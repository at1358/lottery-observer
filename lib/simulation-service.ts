import {list,run} from './db';
import {validateSimulation,buildSimulationLedger} from './simulation.mjs';
import {combinationReportFor} from './combination-service';
import {customMaterialSchedulePlan} from './custom-material-schedule.mjs';
const planKey=(id:string)=>'simulationPlan:'+id,rowsKey=(id:string)=>'simulationRows:'+id,runtimeKey=(id:string)=>'simulationRuntime:'+id,stamp=()=>new Date().toISOString();
async function setting(key:string,fallback:any=null){const [row]=await list('SELECT value FROM settings WHERE key=?',key);return row?JSON.parse(row.value):fallback;}
async function put(key:string,value:any){await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
async function find(id:string){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('模拟编号无效');const plan=await setting(planKey(id));if(!plan||plan.deletedAt)throw Error('找不到该模拟账本或已删除');return plan;}
async function plans(){return (await list("SELECT value FROM settings WHERE key LIKE 'simulationPlan:%' AND json_extract(value,'$.deletedAt') IS NULL ORDER BY json_extract(value,'$.createdAt')")).map(row=>JSON.parse(row.value));}
async function log(status:string,message:string,count=0){await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'模拟输赢',status,message,count,stamp());}
export async function refreshSimulation(id:string,trigger='manual'){
 for(let attempt=0;attempt<4;attempt++){
  const plan=await find(id),[before]=await list('SELECT value FROM settings WHERE key=?',rowsKey(id)),previous=before?JSON.parse(before.value):null,combination=await combinationReportFor(plan.combinationId);
  if(combination.plan.year!==plan.year)throw Error('组合年份已改变，请重新配置模拟年份');
  const draws=await list('SELECT * FROM draws WHERE year=?',plan.year),result=buildSimulationLedger(plan,combination.report,draws,{combinationRule:combination.simulationRuleHash||combination.algorithmHash,previous}),changed=previous&&(previous.ruleKey!==result.ruleKey||previous.engineVersion!==2);
  if(changed)await run('INSERT OR IGNORE INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)','simulationArchive:'+id+':'+previous.version,JSON.stringify({...previous,archivedAt:stamp()}),rowsKey(id),before.value);
  const pack={...result,engineVersion:2,combinationRevision:combination.plan.revision,version:previous&&!changed?previous.version:crypto.randomUUID(),planSnapshot:plan,combinationName:combination.plan.name,trigger},serialized=JSON.stringify(pack),currentPlan=JSON.stringify(plan);
  const saved=before?await run('UPDATE settings SET value=? WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',serialized,rowsKey(id),before.value,planKey(id),currentPlan):await run('INSERT OR IGNORE INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',rowsKey(id),serialized,planKey(id),currentPlan);
  if(saved.meta.changes)return {plan,...pack};
 }
 throw Error('模拟账本正在更新，请稍后重试');
}
export async function saveSimulation(input:any){
 const value=validateSimulation(input),combination=await combinationReportFor(value.combinationId);if(combination.plan.year!==value.year)throw Error('请选择同年份组合');
 const old=input.id?await find(input.id):null,id=old?.id||crypto.randomUUID();if(old&&old.revision!==input.revision){const error:any=Error('模拟方案已被其他页面修改，请刷新后保存');error.status=409;throw error;}
 if(!old&&(await plans()).length>=50)throw Error('最多保存50个模拟方案');
 const plan={...value,id,dependencyPaused:false,revision:crypto.randomUUID(),createdAt:old?.createdAt||stamp(),updatedAt:stamp()},serialized=JSON.stringify(plan),saved=old?await run('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,planKey(id),JSON.stringify(old)):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',planKey(id),serialized);
 if(!saved.meta.changes)throw Error('模拟方案存在并发修改，请刷新');const result=await refreshSimulation(id,'save');await log('success',`「${plan.name}」已保存，按当前组合从第001期模拟，已结算 ${result.stats.settled} 期`,result.stats.settled);return {plan,stats:result.stats};
}
export async function saveSimulationSelection(input:any){
 const plan=await find(input.id),issue=String(Number(input.issue)).padStart(3,'0');if(!/^\d{3}$/.test(issue)||+issue<1||+issue>366)throw Error('请选择有效期数');
 return saveSimulation({...plan,revision:input.revision,overrides:{...plan.overrides,[issue]:input.numbers}});
}
export async function simulationCandidates(id:string){
 const data=await combinationReportFor(id);return {year:data.plan.year,name:data.plan.name,periods:data.report.periods.map((row:any)=>({issue:row.issue,status:row.status,numbers:row.numbers,errors:row.errors,drawn:!!row.settlement.number}))};
}
export async function readSimulations(params=new URLSearchParams()){
 const items=[],combinations=(await list("SELECT value FROM settings WHERE key LIKE 'combinationPlan:%' AND json_extract(value,'$.deletedAt') IS NULL")).map(row=>JSON.parse(row.value)).map(plan=>({id:plan.id,name:plan.name,year:plan.year}));
 for(const plan of await plans()){let pack=await setting(rowsKey(plan.id),{});const combo=await setting('combinationPlan:'+plan.combinationId);if(combo&&!combo.deletedAt&&(pack.engineVersion!==2||pack.combinationRevision!==combo.revision)){try{pack=await refreshSimulation(plan.id,'combination-change');}catch{}}const runtime=await setting(runtimeKey(plan.id),{}),schedule=customMaterialSchedulePlan(plan.schedule,runtime);items.push({...plan,stats:pack.stats||null,lastCheckedAt:pack.lastCheckedAt||null,combinationName:combinations.find(row=>row.id===plan.combinationId)?.name||pack.combinationName||'组合已删除',nextRun:schedule.nextRun,lastRun:runtime.lastRun||null,error:plan.dependencyPaused?'原组合删除后已暂停自动模拟；请重新选择或确认组合':runtime.error||null});}
 const id=params.get('plan');if(!id)return {items,combinations};const plan=await find(id),pack=await setting(rowsKey(id),{rows:[],stats:null}),page=Math.max(1,Math.floor(Number(params.get('page'))||1)),status=params.get('status')||'',pageSize=25;
 if(status&&!['settled','pending','blocked','skipped','profit','loss','hit','miss'].includes(status))throw Error('模拟结果筛选无效');
 const filtered=pack.rows.filter((row:any)=>!status||row.status===status||row.outcome===status||status==='hit'&&row.hit===true||status==='miss'&&row.hit===false),archives=(await list("SELECT value FROM settings WHERE key LIKE ? ORDER BY json_extract(value,'$.archivedAt') DESC LIMIT 10",'simulationArchive:'+id+':%')).map(row=>JSON.parse(row.value)).map(pack=>({version:pack.version,name:pack.planSnapshot.name,stats:pack.stats,archivedAt:pack.archivedAt}));
 return {items,combinations,plan,stats:pack.stats,rows:filtered.slice((page-1)*pageSize,page*pageSize),count:filtered.length,page,pageSize,lastCheckedAt:pack.lastCheckedAt||null,latestDrawIssue:pack.latestDrawIssue,archives,trend:pack.rows.map((row:any)=>({issue:row.issue,balance:row.balanceCents/100})),runtime:items.find(item=>item.id===id)||null};
}
export async function refreshCombinationSimulations(combinationId:string){const errors=[];let checked=0;for(const plan of (await plans()).filter(p=>p.combinationId===combinationId)){try{await refreshSimulation(plan.id,'combination-save');checked++;}catch(e:any){errors.push(plan.name+'：'+e.message);}}return {checked,errors};}
export async function refreshEnabledSimulations(year?:number,trigger='draw'){
 let checked=0;const errors=[];
 for(const plan of (await plans()).filter(plan=>plan.schedule.enabled&&(!year||plan.year>=year&&plan.year<=year+2))){try{await refreshSimulation(plan.id,trigger);checked++;}catch(error:any){errors.push(plan.name+'：'+error.message);}}
 if(errors.length)await log('error','开奖后模拟复核未全部完成：'+errors.join('；'));return {checked,errors};
}
export async function scheduledSimulations(){
 let checked=0,failed=0;
 for(const plan of (await plans()).filter(plan=>plan.schedule.enabled)){
  let runtime=await setting(runtimeKey(plan.id),{}),timing=customMaterialSchedulePlan(plan.schedule,runtime);if(!timing.due)continue;
  const key='simulationLease:'+plan.id,at=Date.now(),lease=String(at+10*60000),claimed=await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<=?',key,lease,at);if(!claimed.meta.changes)continue;
  try{runtime=await setting(runtimeKey(plan.id),{});timing=customMaterialSchedulePlan(plan.schedule,runtime);if(!timing.due)continue;
   try{const result=await refreshSimulation(plan.id,'scheduled');await put(runtimeKey(plan.id),{...runtime,lastRun:stamp(),lastSuccessAt:stamp(),lastSuccessDate:timing.date,error:null,retryAt:null});checked++;await log('success',`「${plan.name}」定时模拟完成，累计结算 ${result.stats.settled} 期，模拟余额 ${(result.stats.balanceCents/100).toFixed(2)} 元`,result.stats.settled);}
   catch(error:any){failed++;await put(runtimeKey(plan.id),{...runtime,lastRun:stamp(),error:error.message,retryAt:new Date(Date.now()+5*60000).toISOString()});await log('error',`「${plan.name}」定时模拟失败，5分钟后重试：${error.message}`);}
  }finally{await run('UPDATE settings SET value=? WHERE key=? AND value=?','0',key,lease);}
 }
 return {checked,failed};
}
