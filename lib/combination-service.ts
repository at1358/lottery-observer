import {list,run} from './db';
import {validateCombination,computeCombination,combinationMessage} from './combination.mjs';
import {rulesWithReference} from './number-reference.mjs';
import {nextScheduledRun} from './schedule.mjs';
import {beijingDate} from './wecom-push.mjs';
import {sendRobotContent} from './wecom';
import {combinationPeriodReport} from './combination-results.mjs';
const stamp=()=>new Date().toISOString(),planKey=(id:string)=>'combinationPlan:'+id,runtimeKey=(id:string)=>'combinationRuntime:'+id;
async function setting(key:string,fallback:any={}){const [r]=await list('SELECT value FROM settings WHERE key=?',key);return r?JSON.parse(r.value):fallback;}
async function put(key:string,value:any){await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
async function hash(value:any){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
async function audit(status:string,message:string,count=0){await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'组合计算',status,message,count,stamp());}
async function plans(){return (await list("SELECT value FROM settings WHERE key LIKE 'combinationPlan:%' ORDER BY key")).map(r=>JSON.parse(r.value));}
async function findPlan(id:string){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('组合编号无效');const p=await setting(planKey(id),null);if(!p)throw Error('找不到该组合');return p;}
async function updateRuntime(id:string,patch:any){
 for(let attempt=0;attempt<4;attempt++){const key=runtimeKey(id),[row]=await list('SELECT value FROM settings WHERE key=?',key),value=JSON.stringify({...row?JSON.parse(row.value):{},...patch});const r=row?await run('UPDATE settings SET value=? WHERE key=? AND value=?',value,key,row.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,value);if(r.meta.changes)return;}
 throw Error('组合状态正在更新，请稍后重试');
}
function nextCalculation(plan:any,at=Date.now()){return plan.calculation.mode==='interval'?new Date(at+plan.calculation.interval*60000).toISOString():nextScheduledRun({...plan.calculation,interval:Math.max(60,plan.calculation.interval)},at);}
function tomorrow(plan:any){const day=beijingDate(Date.now()+86400000);return new Date(day+'T'+(plan.calculation.mode==='daily'?plan.calculation.time:'00:00')+':00+08:00').toISOString();}
const sourceIds=(p:any)=>[...new Set<string>([...(p.baseMode==='source'?[p.baseSourceId]:[]),...p.steps.filter((s:any)=>s.type==='source').map((s:any)=>s.sourceId)])];
const algorithm=(p:any)=>({year:p.year,baseMode:p.baseMode||(p.baseNumbers.length?'manual':'all'),baseSourceId:p.baseSourceId||'',baseNumbers:p.baseNumbers,steps:p.steps});
export async function saveCombination(input:any,canManagePush:boolean){
 const value=validateCombination(input),id=input.id||crypto.randomUUID(),old=input.id?await findPlan(input.id):null;
 if((value.push.enabled||old?.push.enabled)&&!canManagePush)throw Error('企业微信群推送只能由管理员配置；请联系管理员编辑该组合');
 if(old&&input.revision!==old.revision){const e:any=Error('组合已被其他页面修改，请重新载入后保存');e.status=409;throw e;}
 if(!old&&(await plans()).length>=50)throw Error('最多保存50个组合');
 const ids=sourceIds(value);for(const sourceId of ids)if(!(await list('SELECT id FROM sources WHERE id=? AND deleted_batch IS NULL',sourceId)).length)throw Error('所选采集栏目已删除，请重新选择');
 if(value.push.enabled&&!(await setting('wecomPush')).webhook)throw Error('请先在企业微信推送菜单配置机器人 Webhook');
 const now=stamp(),plan={...value,id,revision:crypto.randomUUID(),createdAt:old?.createdAt||now,updatedAt:now};
 const serialized=JSON.stringify(plan),saved=old?await run('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,planKey(id),JSON.stringify(old)):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',planKey(id),serialized);if(!saved.meta.changes)throw Error('组合存在并发修改，请重新载入');
 if(!old||JSON.stringify(old.calculation)!==JSON.stringify(value.calculation))await updateRuntime(id,{nextCalc:nextCalculation(plan),lastError:null});
 await audit('success',`组合「${plan.name}」已保存，共${plan.steps.length}项条件；${plan.calculation.enabled?'自动计算已启用':'手动计算'}；${plan.push.enabled?'每天 '+plan.push.time+' 推送':'自动推送未启用'}`);return {plan};
}
export async function saveCombinationPush(input:any){const old=await findPlan(input.id);return saveCombination({...old,revision:input.revision,push:{enabled:input.enabled,time:input.time}},true);}
async function target(plan:any,input:any={}){
 if(input.issue){const issue=String(Number(input.issue)).padStart(3,'0');if(!/^\d{3}$/.test(issue)||+issue<1||+issue>366||Number(input.year||plan.year)!==plan.year)throw Error('请输入同年份有效期数');return periodInfo(plan.year,issue);}
 if(plan.targetMode==='fixed')return periodInfo(plan.year,plan.fixedIssue);
 if(plan.targetMode==='latest'){
  const ids=sourceIds(plan);if(!ids.length)throw Error('按资料最新一期计算时，请至少选择一个采集栏目，或手动指定期数');
  const [row]=await list(`SELECT MAX(p.issue) AS issue FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.year=? AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL AND p.source_id IN (${ids.map(()=>'?').join(',')})`,plan.year,...ids);
  if(!row?.issue)throw Error('所选栏目暂无已采集期数，请先采集资料');return periodInfo(plan.year,row.issue);
 }
 if(plan.targetMode==='common'){
  const ids=sourceIds(plan);
  if(ids.length){const [row]=await list(`SELECT p.year,p.issue FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.year=? AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL AND p.source_id IN (${ids.map(()=>'?').join(',')}) GROUP BY p.year,p.issue HAVING COUNT(DISTINCT p.source_id)=? ORDER BY p.issue DESC LIMIT 1`,plan.year,...ids,ids.length);if(!row)throw Error('所选栏目没有共同期数，请先采集同一期资料');return periodInfo(plan.year,row.issue);}
 }
 const expected=await setting('expectedDrawPeriods'),today=beijingDate(),draws=await list('SELECT issue FROM draws WHERE year=?',plan.year),closed=new Set(draws.map(d=>d.issue));
 const candidates=Object.values(expected).filter((p:any)=>p.year===plan.year&&p.date>=today&&!closed.has(p.issue)).sort((a:any,b:any)=>a.date.localeCompare(b.date)||Number(a.issue)-Number(b.issue)) as any[];
 if(!candidates.length)throw Error('暂无可信开奖源公布的待开奖期数；请同步开奖或手动指定期数');return periodInfo(plan.year,candidates[0].issue);
}
async function periodInfo(year:number,issue:string){const [draw]=await list('SELECT draw_date,drawn_at FROM draws WHERE year=? AND issue=?',year,issue),expected=await setting('expectedDrawPeriods'),date=draw?.draw_date||expected[year+'-'+issue]?.date||(draw?.drawn_at?beijingDate(Date.parse(draw.drawn_at)):null);return {year,issue,date,drawn:!!draw};}
async function refreshSources(plan:any){
 if(plan.calculation.refreshSources===false)return [];
 const {crawl}=await import('./service'),results=[];
 for(const id of sourceIds(plan)){
  const [source]=await list('SELECT id,name,url,year FROM sources WHERE id=? AND deleted_batch IS NULL',id);
  if(!source?.url)continue;
  if(source.year!==plan.year){results.push({sourceId:id,name:source.name,status:'error',error:'栏目年份与组合年份不一致'});continue;}
  try{const counts=await crawl(id,undefined,{preserveSchedule:true});results.push({sourceId:id,name:source.name,status:'success',...counts});}
  catch(e:any){results.push({sourceId:id,name:source.name,status:'error',error:e.message});}
 }
 return results;
}
async function execute(plan:any,input:any={},persist=true,refresh=true){
 const collection=refresh?await refreshSources(plan):[];
 const period=await target(plan,input),sources=await list('SELECT id,name,year,kind,deleted_batch FROM sources WHERE deleted_batch IS NULL');
 const ids=sourceIds(plan),predictions=ids.length?await list(`SELECT * FROM predictions WHERE year=? AND issue=? AND deleted_batch IS NULL AND source_id IN (${ids.map(()=>'?').join(',')})`,period.year,period.issue,...ids):[];
 const failures=await list("SELECT source_id,year,issue FROM collection_periods WHERE year=? AND issue=? AND status='failed' AND deleted_batch IS NULL",period.year,period.issue);
 const reference=await setting('numberReference:'+plan.year,null),rules=await setting('rules'),effective=rulesWithReference(rules.years?.[plan.year]||{},reference);
 const computed=computeCombination(plan,{...period,predictions,sources,rules:effective,failures});
 // A failed live refresh cannot silently publish a stale snapshot as latest.
 const collectionErrors=collection.filter(r=>r.status==='error').map(r=>r.name+'：采集最新资料失败（'+r.error+'）');
 if(collectionErrors.length){computed.errors.push(...collectionErrors);computed.status='blocked';computed.numbers=[];computed.total=null;}
 const algorithmHash=await hash(algorithm(plan)),fingerprint=await hash({algorithm:algorithmHash,year:period.year,issue:period.issue,trace:computed.trace,errors:computed.errors});
 const key='combinationResult:'+plan.id+':'+period.year+':'+period.issue+':'+fingerprint;
 const result={...computed,collection,id:key,planId:plan.id,planName:plan.name,planRevision:plan.revision||null,algorithmHash,fingerprint,periodDate:period.date,drawn:period.drawn,historical:period.drawn||predictions.some(p=>p.historical),createdAt:stamp()};
 if(!persist)return {...result,preview:true};
 await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,JSON.stringify(result));const saved=await setting(key);
 await updateRuntime(plan.id,{lastCalc:stamp(),lastResultId:key,lastStatus:saved.status,lastError:saved.errors.join('；')||null});
 // A deterministic result is retained once; audit each actual calculation for transparency.
 await audit(saved.status==='complete'?'success':'warning',`「${plan.name}」${period.year}年第${period.issue}期：${saved.status==='complete'?'剩余候选 '+saved.total+' 个':saved.errors.join('；')}`,saved.total||0);
 return {...saved,collection};
}
export async function calculateCombination(input:any){const plan=await findPlan(input.id);return {result:await execute(plan,input)};}
export async function previewCombination(input:any){const plan={...validateCombination(input),id:input.id||'preview',revision:null};return {result:await execute(plan,input,false)};}
async function periodReport(plan:any,snapshots:any[]){
 const ids=sourceIds(plan),sources=await list('SELECT id,name,kind,year,deleted_batch FROM sources WHERE deleted_batch IS NULL'),draws=await list('SELECT * FROM draws WHERE year=?',plan.year);
 const predictions=ids.length?await list(`SELECT * FROM predictions WHERE year=? AND deleted_batch IS NULL AND source_id IN (${ids.map(()=>'?').join(',')})`,plan.year,...ids):[];
 const failures=await list("SELECT source_id,year,issue FROM collection_periods WHERE year=? AND status='failed' AND deleted_batch IS NULL",plan.year);
 const reference=await setting('numberReference:'+plan.year,null),rules=await setting('rules'),effective=rulesWithReference(rules.years?.[plan.year]||{},reference),algorithmHash=await hash(algorithm(plan));
 const current=snapshots.filter(r=>r.algorithmHash===algorithmHash),issues=[...new Set<string>([...predictions.map(p=>p.issue),...failures.filter(f=>ids.includes(f.source_id)).map(f=>f.issue),...current.map(r=>r.issue),...(!ids.length?draws.map(d=>d.issue):[])])].sort();
 const grouped=new Map<string,any[]>();for(const p of predictions){if(!grouped.has(p.issue))grouped.set(p.issue,[]);grouped.get(p.issue)!.push(p);}
 const backtests=issues.filter(issue=>!current.some(r=>r.issue===issue&&r.status==='complete')).map(issue=>({...computeCombination(plan,{year:plan.year,issue,predictions:grouped.get(issue)||[],sources,rules:effective,failures:failures.filter(f=>f.issue===issue)}),id:'backtest:'+plan.id+':'+issue,planId:plan.id,planName:plan.name,algorithmHash,createdAt:stamp(),historical:true,backtest:true,collection:[]}));
 return combinationPeriodReport([...current,...backtests],draws);
}
export async function combinationState(selectedId?:string,selectedIssue?:string){
 const values=await plans(),sources=await list('SELECT id,name,kind,year,url,error,enabled FROM sources WHERE deleted_batch IS NULL ORDER BY sort_order,created_at'),runtimeRows=await list("SELECT key,value FROM settings WHERE key LIKE 'combinationRuntime:%'"),profiles=(await list("SELECT value FROM settings WHERE key LIKE 'sourceReference:%'")).map(r=>JSON.parse(r.value));
 const runtimes=new Map(runtimeRows.map(r=>[r.key.slice('combinationRuntime:'.length),JSON.parse(r.value)]));
 const selected=selectedId?values.find(p=>p.id===selectedId):null,resultRows=selected?await list("SELECT value FROM settings WHERE key LIKE ? ORDER BY json_extract(value,'$.createdAt') DESC LIMIT 20",'combinationResult:'+selected.id+':%'):[];
 const report=selected?await periodReport(selected,(await list("SELECT value FROM settings WHERE key LIKE ?",'combinationResult:'+selected.id+':%')).map(r=>JSON.parse(r.value))):null;
 const periodResult=selectedIssue?report?.periods.find((r:any)=>r.issue===String(Number(selectedIssue)).padStart(3,'0'))||null:null;
 const compactReport=report?{...report,periods:report.periods.map((r:any)=>({id:r.id,year:r.year,issue:r.issue,status:r.status,total:r.total,numbers:r.numbers,createdAt:r.createdAt,backtest:r.backtest,historical:r.historical,settlement:r.settlement,snapshotCount:r.snapshotCount,errors:r.errors}))}:null;
 const decorated=[];for(const plan of values){const runtime=runtimes.get(plan.id)||{},last=runtime.lastResultId?await setting(runtime.lastResultId,null):null;decorated.push({...plan,runtime,lastResult:last?{id:last.id,issue:last.issue,year:last.year,status:last.status,total:last.total,numbers:last.numbers,createdAt:last.createdAt,errors:last.errors}:null});}
 return {report:compactReport,periodResult,plans:decorated,sources,profiles,results:resultRows.map(r=>JSON.parse(r.value)),robotConfigured:!!(await setting('wecomPush')).webhook,expectedPeriods:Object.values(await setting('expectedDrawPeriods')).filter((p:any)=>p.date>=beijingDate()).slice(-10)};
}
async function resultToSend(plan:any,selectedId?:string){
 let result=selectedId?await setting(selectedId,null):null;
 if(selectedId&&!result)throw Error('所选计算结果尚未保存，请先保存组合并重新计算');
 if(!result){const r=await setting(runtimeKey(plan.id));if(r.lastResultId)result=await setting(r.lastResultId,null);}
 if(!result||result.planId!==plan.id)throw Error('请先保存组合并完成本期计算');
 if(result.algorithmHash!==await hash(algorithm(plan)))throw Error('组合条件已修改，请重新计算后推送');
 if(result.status!=='complete')throw Error('资料不齐，不能推送不完整的计算结果');
 for(const item of result.trace.filter((t:any)=>t.predictionId)){
  const [p]=await list('SELECT p.id FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.id=? AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL',item.predictionId);
  const [failure]=await list("SELECT id FROM collection_periods WHERE source_id=? AND year=? AND issue=? AND status='failed' AND deleted_batch IS NULL",item.sourceId,result.year,result.issue);
  if(!p||failure)throw Error('本期参与计算的资料已删除或被记录为采集失败，请重新计算');
 }
 const period=await periodInfo(result.year,result.issue),now=new Date(Date.now()+8*3600000).toISOString().slice(11,16);
 if(period.drawn||period.date!==beijingDate()||now>=plan.cutoff)throw Error('只推送当天开奖前的完整计算结果；已开奖、跨日或超过截止时间的结果保留为历史记录');
 return result;
}
export async function pushCombination(input:any,manual=true){
 const plan=await findPlan(input.id);let result:any;
 try{result=await resultToSend(plan,input.resultId);}catch(e:any){if(manual)throw e;return {skipped:true,reason:e.message};}
 const key='combinationDelivery:'+plan.id+':'+result.year+':'+result.issue,[row]=await list('SELECT value FROM settings WHERE key=?',key),before=row?JSON.parse(row.value):{};
 if(before.status==='sent')return {skipped:true,reason:'该组合本期已推送，不重复发送'};
 if(before.retryAt>stamp())return {skipped:true,reason:'正在推送或等待重试'};
 const value={planId:plan.id,planName:plan.name,resultId:result.id,year:result.year,issue:result.issue,status:'sending',attemptAt:stamp(),retryAt:new Date(Date.now()+5*60000).toISOString()};
 const claimed=row?await run('UPDATE settings SET value=? WHERE key=? AND value=?',JSON.stringify(value),key,row.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,JSON.stringify(value));if(!claimed.meta.changes)return {skipped:true,reason:'其他任务正在推送本期组合'};
 try{await sendRobotContent(combinationMessage(plan,result));await put(key,{...value,status:'sent',sentAt:stamp(),retryAt:null});await updateRuntime(plan.id,{lastPush:stamp(),lastPushIssue:result.issue,lastPushError:null});await audit('success',`「${plan.name}」第${result.issue}期组合结果已推送企业微信群`,1);return {sent:true,issue:result.issue};}
 catch(e:any){await put(key,{...value,status:'failed',error:e.message});await updateRuntime(plan.id,{lastPushError:e.message});await audit('error',`「${plan.name}」第${result.issue}期推送失败：${e.message}`);if(manual)throw e;return {failed:true,error:e.message};}
}
export async function scheduledCombinations(){
 const values=(await plans()).filter(p=>p.calculation.enabled||p.push.enabled),localTime=new Date(Date.now()+8*3600000).toISOString().slice(11,16);let calculated=0,pushed=0,blocked=0,failed=0;
 for(const plan of values.slice(0,50)){
  const runtime=await setting(runtimeKey(plan.id)),due=plan.calculation.enabled&&(!runtime.nextCalc||runtime.nextCalc<=stamp()),pushDue=plan.push.enabled&&localTime>=plan.push.time;
  if(!due&&!pushDue)continue;
  const key='combinationLease:'+plan.id,at=Date.now(),lease=await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<=?',key,String(at+10*60000),at);if(!lease.meta.changes)continue;
  try{
   if(localTime>=plan.cutoff){if(due)await updateRuntime(plan.id,{nextCalc:tomorrow(plan),lastError:'已超过开奖前截止时间，本日不再自动计算或推送'});continue;}
   if(due&&calculated+blocked<6){
    try{const result=await execute(plan);if(result.periodDate!==beijingDate()||result.drawn){await updateRuntime(plan.id,{nextCalc:new Date(Date.now()+5*60000).toISOString(),lastError:'已检查所选栏目最新资料，等待当天待开奖期数，不推送历史结果'});blocked++;}
     else{await updateRuntime(plan.id,{nextCalc:result.status==='complete'?nextCalculation(plan):new Date(Date.now()+5*60000).toISOString()});if(result.status==='complete')calculated++;else blocked++;}}
    catch(e:any){blocked++;await updateRuntime(plan.id,{nextCalc:new Date(Date.now()+5*60000).toISOString(),lastError:e.message});}
   }
   if(pushDue&&pushed<4){const result=await pushCombination({id:plan.id},false);if(result.sent)pushed++;if(result.failed)failed++;}
  }finally{await run('UPDATE settings SET value=? WHERE key=?','0',key);}
 }
 return {calculated,pushed,blocked,failed};
}
