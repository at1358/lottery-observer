import {list,run,db,stmt} from './db';
import {emptyCostLedger,validateCostSettings,validateCostEntry,buildCostLedger} from './cost-ledger.mjs';
import {currentCombinationPeriod} from './combination-periods.mjs';
const key='costLedger',resultKey='costLedgerResult',stamp=()=>new Date().toISOString();
function conflict(message='成本账本已被其他页面修改，请刷新后重试'):never{throw Object.assign(Error(message),{status:409});}
async function documentRow(){const [row]=await list('SELECT value FROM settings WHERE key=?',key);return row||null;}
async function audit(message:string){await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'成本计算','success',message,1,stamp());}
async function commit(row:any,next:any,history?:{key:string,value:any}){
 const serialized=JSON.stringify(next),statements=[];
 if(history&&row)statements.push(stmt('INSERT OR IGNORE INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',history.key,JSON.stringify(history.value),key,row.value));
 statements.push(row?stmt('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,key,row.value):stmt('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,serialized));
 const saved=await db().batch(statements);return !!saved[saved.length-1].meta.changes;
}
export async function refreshCostLedger(trigger='read'){
 for(let attempt=0;attempt<4;attempt++){
  const row=await documentRow();if(!row)return {skipped:true,changed:false};
  const document=JSON.parse(row.value),draws=await list('SELECT year,issue,number,zodiac,drawn_at,updated_at FROM draws'),result=buildCostLedger(document,draws),[before]=await list('SELECT value FROM settings WHERE key=?',resultKey),previous=before?JSON.parse(before.value):null;
  if(previous?.basisKey===result.basisKey)return {...previous,changed:false};
  const pack={...result,trigger,sourceRevision:document.revision},serialized=JSON.stringify(pack);
  const saved=before?await run('UPDATE settings SET value=? WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',serialized,resultKey,before.value,key,row.value):await run('INSERT OR IGNORE INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',resultKey,serialized,key,row.value);
  if(saved.meta.changes){if(trigger==='draw'&&result.stats.settled)await audit(`开奖后自动核算成本：已结算 ${result.stats.settled} 期，余额 ${(result.stats.balanceCents/100).toFixed(2)} 元`);return {...pack,changed:true};}
 }
 throw Error('成本账本正在更新，请稍后刷新');
}
export async function saveCostSettings(input:any,actor:any){
 const value=validateCostSettings(input);
 for(let attempt=0;attempt<4;attempt++){
  const row=await documentRow(),old=row?JSON.parse(row.value):emptyCostLedger();if(input.revision!==old.revision)conflict();
  const now=stamp(),next={...old,...value,revision:crypto.randomUUID(),createdAt:old.createdAt||now,updatedAt:now};
  if(await commit(row,next,row?{key:'costLedgerConfigHistory:'+old.revision,value:{settings:old,changedAt:now,changedBy:actor?.name||actor?.id||null}}:undefined)){await refreshCostLedger('settings');await audit('成本账本设置已保存；默认金额和赔率只应用于以后新录入的记录');return {config:{...next,entries:undefined}};}
 }
 conflict();
}
export async function saveCostEntry(input:any,actor:any){
 const value=validateCostEntry(input);if(input.id&&!/^[a-f0-9-]{36}$/.test(input.id))throw Error('成本记录编号无效');
 for(let attempt=0;attempt<4;attempt++){
  const row=await documentRow();if(!row)throw Error('请先设置初始本金，创建成本账本');const document=JSON.parse(row.value),old=input.id?document.entries.find((r:any)=>r.id===input.id):null;
  if(input.id&&!old)throw Error('找不到本期成本记录');if(old&&input.revision!==old.revision)conflict('本期记录已被修改，请重新打开后保存');
  if(document.entries.some((r:any)=>r.id!==input.id&&r.year===value.year&&r.issue===value.issue))conflict('该年份、期号已有记录，请编辑或恢复原记录，避免重复记账');
  if(!old&&document.entries.length>=5000)throw Error('成本账本最多保存5000期');
  const [draw]=await list('SELECT number FROM draws WHERE year=? AND issue=?',value.year,value.issue),now=stamp(),financial=(r:any)=>{const v=validateCostEntry(r);return JSON.stringify([v.year,v.issue,v.numberStakes,v.oddsHundredths]);};
  const entry={...old,...value,id:old?.id||crypto.randomUUID(),revision:crypto.randomUUID(),createdAt:old?.createdAt||now,updatedAt:now,recordedAfterDraw:old?.recordedAfterDraw??!!draw,modifiedAfterDraw:!!old?.modifiedAfterDraw||!!old&&!!draw&&financial(old)!==financial(value),changedBy:actor?.name||actor?.id||null};
  const next={...document,revision:crypto.randomUUID(),updatedAt:now,entries:old?document.entries.map((r:any)=>r.id===old.id?entry:r):[...document.entries,entry]};
  if(await commit(row,next,old?{key:'costLedgerHistory:'+old.id+':'+old.revision,value:{entry:old,changedAt:now,action:'edit',changedBy:actor?.name||actor?.id||null}}:undefined)){await refreshCostLedger('entry');await audit(`${old?'修改':'录入'} ${entry.year} 年第 ${entry.issue} 期成本记录，${entry.numbers.length} 个号码`);return {entry};}
 }
 conflict();
}
export async function voidCostEntry(input:any,actor:any){
 if(!/^[a-f0-9-]{36}$/.test(input.id||'')||typeof input.voided!=='boolean')throw Error('成本记录操作无效');
 for(let attempt=0;attempt<4;attempt++){
  const row=await documentRow();if(!row)throw Error('成本账本尚未创建');const document=JSON.parse(row.value),old=document.entries.find((r:any)=>r.id===input.id);if(!old)throw Error('找不到本期成本记录');if(old.revision!==input.revision)conflict('本期记录已被修改，请刷新');
  if(!!old.voidedAt===input.voided)return {entry:old};const now=stamp(),entry={...old,voidedAt:input.voided?now:null,revision:crypto.randomUUID(),updatedAt:now,changedBy:actor?.name||actor?.id||null},next={...document,revision:crypto.randomUUID(),updatedAt:now,entries:document.entries.map((r:any)=>r.id===old.id?entry:r)};
  if(await commit(row,next,{key:'costLedgerHistory:'+old.id+':'+old.revision,value:{entry:old,action:input.voided?'void':'restore',changedAt:now,changedBy:actor?.name||actor?.id||null}})){await refreshCostLedger('entry');await audit(`${input.voided?'作废':'恢复'} ${entry.year} 年第 ${entry.issue} 期成本记录`);return {entry};}
 }
 conflict();
}
export async function costLedgerState(params=new URLSearchParams()){
 await refreshCostLedger();const row=await documentRow(),document=row?JSON.parse(row.value):emptyCostLedger(),[stored]=await list('SELECT value FROM settings WHERE key=?',resultKey),storedPack=stored?JSON.parse(stored.value):null,pack=storedPack?.sourceRevision===document.revision?storedPack:buildCostLedger(document,await list('SELECT year,issue,number,zodiac,drawn_at,updated_at FROM draws'));
 const year=params.get('year')||'',status=params.get('status')||'',page=Math.max(1,Math.floor(Number(params.get('page'))||1)),pageSize=25;if(status&&!['pending','settled','review','voided','win','loss'].includes(status))throw Error('成本结果筛选无效');if(year&&!/^\d{4}$/.test(year))throw Error('年份筛选无效');
 const rows=pack.rows.filter((r:any)=>(!year||r.year===+year)&&(!status||r.status===status||status==='win'&&r.hit===true||status==='loss'&&r.hit===false)).reverse(),draws=await list('SELECT year,issue,draw_date,drawn_at FROM draws'),[expected]=await list("SELECT value FROM settings WHERE key='expectedDrawPeriods'"),todayYear=Number(new Date(Date.now()+8*3600000).toISOString().slice(0,4)),current=currentCombinationPeriod(todayYear,draws,expected?JSON.parse(expected.value):{}),latest=Math.max(0,...draws.filter(r=>r.year===todayYear).map(r=>+r.issue)),suggested={year:todayYear,issue:current.issue&&!current.drawn?current.issue:String(Math.min(366,latest+1)).padStart(3,'0'),confirmed:!!current.issue&&!current.drawn};
 let history:any[]=[];const entryId=params.get('history');if(entryId){if(!document.entries.some((r:any)=>r.id===entryId))throw Error('找不到本期成本记录');history=(await list("SELECT value FROM settings WHERE key LIKE ? ORDER BY json_extract(value,'$.changedAt') DESC LIMIT 50",'costLedgerHistory:'+entryId+':%')).map(r=>JSON.parse(r.value));}
 return {initialized:!!row,config:{...document,entries:undefined},stats:pack.stats,rows:rows.slice((page-1)*pageSize,page*pageSize),count:rows.length,page,pageSize,lastCheckedAt:pack.lastCheckedAt,suggested,years:[...new Set<number>([todayYear,...document.entries.map((r:any)=>r.year)])].sort((a,b)=>b-a),history};
}
export async function scheduledCostLedger(trigger='scheduled'){try{const result=await refreshCostLedger(trigger);return {checked:result.changed?1:0,skipped:!!result.skipped};}catch(error:any){await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'成本计算','error',error.message,0,stamp());return {checked:0,failed:1,error:error.message};}}
