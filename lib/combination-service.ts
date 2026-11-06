import {list,run} from './db';
import {validateCombination,computeCombination,combinationMessage} from './combination.mjs';
import {rulesWithReference} from './number-reference.mjs';
import {nextScheduledRun} from './schedule.mjs';
import {beijingDate} from './wecom-push.mjs';
import {sendRobotContent} from './wecom';
import {combinationPeriodReport} from './combination-results.mjs';
import {collectionWindowOpen,nextRecoveryAt} from './collection-retry.mjs';
import {customCombinationData,customMaterialSummaries,refreshCustomMaterial} from './custom-material-service';
import {materialRuleKey} from './custom-material.mjs';
import {collectedSourceIds,selectCombinationHistory} from './combination-periods.mjs';
function refuse(code:string,message:string):never{throw Object.assign(Error(message),{code});}
const stamp=()=>new Date().toISOString(),planKey=(id:string)=>'combinationPlan:'+id,runtimeKey=(id:string)=>'combinationRuntime:'+id;
async function setting(key:string,fallback:any={}){const [r]=await list('SELECT value FROM settings WHERE key=?',key);return r?JSON.parse(r.value):fallback;}
async function put(key:string,value:any){await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
async function hash(value:any){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
async function audit(status:string,message:string,count=0){await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'组合计算',status,message,count,stamp());}
async function plans(){return (await list("SELECT value FROM settings WHERE key LIKE 'combinationPlan:%' AND json_extract(value,'$.deletedAt') IS NULL ORDER BY key")).map(r=>JSON.parse(r.value));}
async function findPlan(id:string){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('组合编号无效');const p=await setting(planKey(id),null);if(!p||p.deletedAt)throw Error('找不到该组合或组合已删除');return p;}
async function updateRuntime(id:string,patch:any){
 for(let attempt=0;attempt<4;attempt++){const key=runtimeKey(id),[row]=await list('SELECT value FROM settings WHERE key=?',key),value=JSON.stringify({...row?JSON.parse(row.value):{},...patch});const r=row?await run('UPDATE settings SET value=? WHERE key=? AND value=?',value,key,row.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,value);if(r.meta.changes)return;}
 throw Error('组合状态正在更新，请稍后重试');
}
function nextCalculation(plan:any,at=Date.now()){return plan.calculation.mode==='interval'?new Date(at+plan.calculation.interval*60000).toISOString():nextScheduledRun({...plan.calculation,interval:Math.max(60,plan.calculation.interval)},at);}
function tomorrow(plan:any){const day=beijingDate(Date.now()+86400000);return new Date(day+'T'+(plan.calculation.mode==='daily'?plan.calculation.time:'00:00')+':00+08:00').toISOString();}
const sourceIds=(p:any)=>collectedSourceIds(p) as string[];
const customIds=(p:any)=>[...new Set<string>([...(p.baseMode==='custom'?[p.baseCustomMaterialId]:[]),...p.steps.filter((s:any)=>s.type==='custom').map((s:any)=>s.materialId)])];
const algorithm=(p:any)=>({year:p.year,baseMode:p.baseMode||(p.baseNumbers.length?'manual':'all'),baseSourceId:p.baseSourceId||'',...(p.baseMode==='custom'?{baseCustomMaterialId:p.baseCustomMaterialId||''}:{}),baseNumbers:p.baseNumbers,steps:p.steps});
async function combinationAlgorithm(plan:any){const ids=customIds(plan);if(!ids.length)return algorithm(plan);const values=await customMaterialSummaries();return {...algorithm(plan),customRules:ids.sort().map(id=>{const p=values.find(p=>p.id===id);return {id,ruleKey:p?materialRuleKey(p):null};})};}
export async function saveCombination(input:any,canManagePush:boolean){
 const value=validateCombination(input),id=input.id||crypto.randomUUID(),old=input.id?await findPlan(input.id):null;
 if((value.push.enabled||old?.push.enabled)&&JSON.stringify(value.push)!==JSON.stringify(old?.push)&&!canManagePush)throw Error('企业微信群推送只能由管理员配置；请联系管理员编辑该组合');
 if(old&&input.revision!==old.revision){const e:any=Error('组合已被其他页面修改，请重新载入后保存');e.status=409;throw e;}
 if(!old&&(await plans()).length>=50)throw Error('最多保存50个组合');
 const ids=sourceIds(value);for(const sourceId of ids)if(!(await list('SELECT id FROM sources WHERE id=? AND deleted_batch IS NULL',sourceId)).length)throw Error('所选采集栏目已删除，请重新选择');
 for(const materialId of customIds(value)){const p=await setting('customMaterialPlan:'+materialId,null);if(!p||p.deletedAt)throw Error('所选自建资料不存在或已删除');if(p.year!==value.year)throw Error('自建资料年份与组合年份不一致，请选择同年份栏目');if(value.baseMode==='custom'&&materialId===value.baseCustomMaterialId&&p.type!=='manual-numbers')throw Error('基础号码池请选择自建推荐号码；自建杀码、n−k 杀肖请放入排除条件');}
 if(value.push.enabled&&!(await setting('wecomPush')).webhook)throw Error('请先在企业微信推送菜单配置机器人 Webhook');
 const now=stamp(),plan={...value,id,revision:crypto.randomUUID(),createdAt:old?.createdAt||now,updatedAt:now};
 const serialized=JSON.stringify(plan),saved=old?await run('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,planKey(id),JSON.stringify(old)):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',planKey(id),serialized);if(!saved.meta.changes)throw Error('组合存在并发修改，请重新载入');
 if(!old||JSON.stringify(old.calculation)!==JSON.stringify(value.calculation))await updateRuntime(id,{nextCalc:nextCalculation(plan),lastError:null});
 if(old&&JSON.stringify(algorithm(old))!==JSON.stringify(algorithm(plan)))await updateRuntime(id,{recoveryActive:false,recoveryDate:null,nextRecoveryAt:null,recoveryAttemptId:null,lastResultId:null,lastError:null});
 await audit('success',`组合「${plan.name}」已保存，共${plan.steps.length}项条件；${plan.calculation.enabled?'自动计算已启用':'手动计算'}；${plan.push.enabled?'每天 '+plan.push.time+' 推送':'自动推送未启用'}`);
 const {refreshCombinationSimulations}=await import('./simulation-service');const simulations=await refreshCombinationSimulations(id);return {plan,simulations};
}
export async function saveCombinationPush(input:any){const old=await findPlan(input.id);return saveCombination({...old,revision:input.revision,push:{enabled:input.enabled,time:input.time}},true);}
async function target(plan:any,input:any={}){
 if(input.issue){const issue=String(Number(input.issue)).padStart(3,'0');if(!/^\d{3}$/.test(issue)||+issue<1||+issue>366||Number(input.year||plan.year)!==plan.year)throw Error('请输入同年份有效期数');return periodInfo(plan.year,issue);}
 if(plan.targetMode==='fixed')return periodInfo(plan.year,plan.fixedIssue);
 if(customIds(plan).length&&['latest','common'].includes(plan.targetMode)){
  const current=await todayPeriod(plan);if(plan.targetMode==='latest'&&current.issue&&!current.drawn)return current;
  const [last]=await list('SELECT MAX(CAST(issue AS INTEGER)) AS issue FROM draws WHERE year=?',plan.year),cap=last?.issue?Math.min(366,last.issue+1):0,ids=sourceIds(plan),data=await customCombinationData(customIds(plan),plan.year);const sets:Set<string>[]=[];
  for(const id of ids)sets.push(new Set((await list('SELECT issue FROM predictions WHERE source_id=? AND year=? AND deleted_batch IS NULL',id,plan.year)).map(p=>p.issue)));
  for(const id of customIds(plan))sets.push(new Set(data.records.filter(r=>r.materialId===id&&+r.issue<=cap).map(r=>r.issue)));
  const values=[...new Set<string>(sets.flatMap(set=>[...set]))].filter(issue=>plan.targetMode==='latest'||sets.every(set=>set.has(issue))).sort((a,b)=>+b-+a);if(!values.length)refuse('NO_PERIOD','所选采集或自建资料暂无可用期数，请同步开奖或手动指定期数');return periodInfo(plan.year,values[0]);
 }
 if(plan.targetMode==='latest'){
  const ids=sourceIds(plan);if(!ids.length)refuse('NO_PERIOD','按资料最新一期计算时，请至少选择一个采集栏目，或手动指定期数');
  const [row]=await list(`SELECT MAX(p.issue) AS issue FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.year=? AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL AND p.source_id IN (${ids.map(()=>'?').join(',')})`,plan.year,...ids);
  const current=await todayPeriod(plan);if(current.issue&&!current.drawn&&(!row?.issue||Number(current.issue)>Number(row.issue)))return current;
  if(!row?.issue)refuse('NO_PERIOD','所选栏目暂无已采集期数，请先采集资料');return periodInfo(plan.year,row.issue);
 }
 if(plan.targetMode==='common'){
  const ids=sourceIds(plan);
  if(ids.length){const [row]=await list(`SELECT p.year,p.issue FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.year=? AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL AND p.source_id IN (${ids.map(()=>'?').join(',')}) GROUP BY p.year,p.issue HAVING COUNT(DISTINCT p.source_id)=? ORDER BY p.issue DESC LIMIT 1`,plan.year,...ids,ids.length);if(!row)refuse('NO_PERIOD','所选栏目没有共同期数，请先采集同一期资料');return periodInfo(plan.year,row.issue);}
 }
 const expected=await setting('expectedDrawPeriods'),today=beijingDate(),draws=await list('SELECT issue FROM draws WHERE year=?',plan.year),closed=new Set(draws.map(d=>d.issue));
 const candidates=Object.values(expected).filter((p:any)=>p.year===plan.year&&p.date>=today&&!closed.has(p.issue)).sort((a:any,b:any)=>a.date.localeCompare(b.date)||Number(a.issue)-Number(b.issue)) as any[];
 if(!candidates.length)refuse('NO_PERIOD','暂无可信开奖源公布的待开奖期数；请同步开奖或手动指定期数');return periodInfo(plan.year,candidates[0].issue);
}
async function periodInfo(year:number,issue:string){const [draw]=await list('SELECT draw_date,drawn_at FROM draws WHERE year=? AND issue=?',year,issue),expected=await setting('expectedDrawPeriods'),date=draw?.draw_date||expected[year+'-'+issue]?.date||(draw?.drawn_at?beijingDate(Date.parse(draw.drawn_at)):null);return {year,issue,date,drawn:!!draw};}
async function todayPeriod(plan:any){
 const today=beijingDate();if(plan.targetMode==='fixed'){const fixed=await periodInfo(plan.year,plan.fixedIssue);if(fixed.date===today)return fixed;}
 const closed=new Set((await list('SELECT issue FROM draws WHERE year=?',plan.year)).map(d=>d.issue)),expected=Object.values(await setting('expectedDrawPeriods')).filter((p:any)=>p.year===plan.year&&p.date===today).sort((a:any,b:any)=>Number(closed.has(a.issue))-Number(closed.has(b.issue))||Number(a.issue)-Number(b.issue)) as any[];
 if(expected[0])return periodInfo(plan.year,expected[0].issue);
 const [draw]=await list('SELECT issue FROM draws WHERE year=? AND draw_date=? ORDER BY issue DESC LIMIT 1',plan.year,today);if(draw)return periodInfo(plan.year,draw.issue);
 return {year:plan.year,issue:null,date:today,drawn:false};
}
async function saveResult(plan:any,period:any,computed:any,collection:any[],persist=true){
 const algorithmHash=await hash(await combinationAlgorithm(plan)),fingerprint=await hash({algorithm:algorithmHash,year:period.year,issue:period.issue,trace:computed.trace,errors:computed.errors});
 const key=(period.issue?'combinationResult:':'combinationAttempt:')+plan.id+':'+period.year+':'+(period.issue||period.date)+':'+fingerprint;
 const result={...computed,collection,id:key,planId:plan.id,planName:plan.name,planRevision:plan.revision||null,algorithmHash,fingerprint,periodDate:period.date,drawn:period.drawn,historical:period.drawn||!!computed.historical,createdAt:stamp()};
 if(!persist)return {...result,preview:true};
 await findPlan(plan.id);
 await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,JSON.stringify(result));const saved=await setting(key);
 await updateRuntime(plan.id,{lastCalc:stamp(),lastResultId:key,lastStatus:saved.status,lastError:saved.errors.join('；')||null});
 await audit(saved.status==='complete'?'success':'warning',`「${plan.name}」${period.year}年${period.issue?'第'+period.issue+'期':'期数待确认'}：${saved.status==='complete'?'剩余候选 '+saved.total+' 个':saved.errors.join('；')}`,saved.total||0);
 return {...saved,collection};
}
async function saveFailure(plan:any,errors:string[],collection:any[]=[],persist=true){
 const period=await todayPeriod(plan),all=[...new Set([...collection.filter(r=>r.status==='error').map(r=>r.name+'：采集资料失败（'+r.error+'）'),...errors].filter(Boolean))];
 return saveResult(plan,period,{year:period.year,issue:period.issue,status:'blocked',errors:all.length?all:['本期尚无完整计算记录'],baseMode:plan.baseMode,baseNumbers:[],numbers:[],partialNumbers:[],trace:[],total:null},collection,persist);
}
async function refreshSources(plan:any,ids=sourceIds(plan),requiredIssue?:string,automatic=false){
 const {crawl}=await import('./service'),results=[];
 for(const id of ids){
  const [source]=await list('SELECT id,name,url,year FROM sources WHERE id=? AND deleted_batch IS NULL',id);
  if(!source?.url)continue;
  if(source.year!==plan.year){results.push({sourceId:id,name:source.name,status:'error',error:'栏目年份与组合年份不一致'});continue;}
  try{const counts=await crawl(id,undefined,{preserveSchedule:true,requiredIssue,automatic});results.push({sourceId:id,name:source.name,status:'success',...counts});}
  catch(e:any){results.push({sourceId:id,name:source.name,status:'error',error:e.message});}
 }
 return results;
}
async function storedCalculation(plan:any,period:any){
 const sources=await list('SELECT id,name,year,kind,deleted_batch FROM sources WHERE deleted_batch IS NULL');
 const ids=sourceIds(plan),predictions=ids.length?await list(`SELECT * FROM predictions WHERE year=? AND issue=? AND deleted_batch IS NULL AND source_id IN (${ids.map(()=>'?').join(',')})`,period.year,period.issue,...ids):[];
 const failures=await list("SELECT source_id,year,issue FROM collection_periods WHERE year=? AND issue=? AND status='failed' AND deleted_batch IS NULL",period.year,period.issue);
 const reference=await setting('numberReference:'+plan.year,null),rules=await setting('rules'),effective=rulesWithReference(rules.years?.[plan.year]||{},reference);
 const [draw]=await list('SELECT number,zodiac FROM draws WHERE year=? AND issue=?',period.year,period.issue),custom=await customCombinationData(customIds(plan),plan.year),computed=computeCombination(plan,{...period,predictions,sources,rules:effective,failures,customMaterials:custom.materials,customRecords:custom.records,draw});
 return {...computed,historical:predictions.some(p=>p.historical)||custom.records.some(r=>r.issue===period.issue&&r.historical)};
}
async function recoveryState(plan:any,result:any,persist:boolean){
 if(!persist)return result;
 if(result.status==='complete')await updateRuntime(plan.id,{recoveryActive:false,recoveryDate:null,nextRecoveryAt:null,missingSourceIds:[]});
 else await updateRuntime(plan.id,{recoveryActive:true,recoveryDate:beijingDate(),recoveryIssue:result.issue,nextRecoveryAt:nextRecoveryAt(Date.now(),plan.cutoff),lastRecoveryAttempt:stamp(),recoveryAttemptId:crypto.randomUUID(),missingSourceIds:[...new Set([...(result.trace||[]).filter((t:any)=>t.error&&t.sourceId).map((t:any)=>t.sourceId),...(result.collection||[]).filter((c:any)=>c.status==='error').map((c:any)=>c.sourceId)])]});
 return result;
}
async function execute(plan:any,input:any={},persist=true,refresh=true){
 for(const id of customIds(plan))await refreshCustomMaterial(id);
 let period:any,before:any=null;
 try{period=await target(plan,input);if(input.automatic&&plan.targetMode==='common'){const current=await todayPeriod(plan);if(current.issue&&!current.drawn&&(!period.date||period.date<current.date||Number(period.issue)<Number(current.issue)))period=current;}before=await storedCalculation(plan,period);}catch(e:any){if(e.code!=='NO_PERIOD')throw e;}
 const onlyMissing=input.onlyMissing||plan.calculation.refreshSources===false;
 const missing=before&&(!input.automatic||period?.date===beijingDate()&&!period?.drawn)?[...new Set<string>(before.trace.filter((t:any)=>t.error&&t.sourceId).map((t:any)=>t.sourceId))]:sourceIds(plan);
 const collection=refresh?await refreshSources(plan,onlyMissing?missing:sourceIds(plan),period?.issue||undefined,!!input.automatic):[];
 try{if(!period||!onlyMissing)period=await target(plan,input);}catch(e:any){if(e.code!=='NO_PERIOD')throw e;return recoveryState(plan,await saveFailure(plan,[e.message],collection,persist),persist);}
 if(input.automatic&&plan.targetMode==='common'){const current=await todayPeriod(plan);if(current.issue&&!current.drawn&&(!period.date||period.date<current.date||Number(period.issue)<Number(current.issue)))period=current;}
 const computed=await storedCalculation(plan,period);
 if(input.automatic&&(period.date!==beijingDate()||period.drawn)){computed.status='blocked';computed.numbers=[];computed.total=null;computed.errors.push('尚无当天待开奖期数的完整资料，不使用已开奖或旧期资料代替');}
 // A failed live refresh cannot silently publish a stale snapshot as latest.
 const collectionErrors=collection.filter(r=>r.status==='error').map(r=>r.name+'：采集最新资料失败（'+r.error+'）');
 if(collectionErrors.length){computed.errors.push(...collectionErrors);computed.status='blocked';computed.numbers=[];computed.total=null;}
 return recoveryState(plan,await saveResult(plan,period,computed,collection,persist),persist);
}
export async function calculateCombination(input:any){const plan=await findPlan(input.id);return {result:await execute(plan,input)};}
export async function previewCombination(input:any){const plan={...validateCombination(input),id:input.id||'preview',revision:null};return {result:await execute(plan,input,false)};}
async function periodReport(plan:any,snapshots:any[]){
 const ids=sourceIds(plan),sources=await list('SELECT id,name,kind,year,deleted_batch FROM sources WHERE deleted_batch IS NULL'),draws=await list('SELECT * FROM draws WHERE year=?',plan.year);
 const predictions=ids.length?await list(`SELECT * FROM predictions WHERE year=? AND deleted_batch IS NULL AND source_id IN (${ids.map(()=>'?').join(',')})`,plan.year,...ids):[];
 const failures=await list("SELECT source_id,year,issue FROM collection_periods WHERE year=? AND status='failed' AND deleted_batch IS NULL",plan.year);
 const reference=await setting('numberReference:'+plan.year,null),rules=await setting('rules'),effective=rulesWithReference(rules.years?.[plan.year]||{},reference),algorithmHash=await hash(await combinationAlgorithm(plan));
 const custom=await customCombinationData(customIds(plan),plan.year),cap=Math.min(366,Math.max(0,...draws.map(d=>+d.issue))+1),current=snapshots.filter(r=>r.algorithmHash===algorithmHash),selection=selectCombinationHistory(plan,[...predictions.map(p=>p.issue),...failures.filter(f=>ids.includes(f.source_id)).map(f=>f.issue),...custom.records.filter(r=>+r.issue<=cap).map(r=>r.issue),...current.map(r=>r.issue),...(!ids.length?draws.map(d=>d.issue):[])],predictions,sources,failures),issues=selection.issues,included=new Set(issues);
 const grouped=new Map<string,any[]>();for(const p of predictions){if(!grouped.has(p.issue))grouped.set(p.issue,[]);grouped.get(p.issue)!.push(p);}
 const available=new Map(issues.map(issue=>[issue,computeCombination(plan,{year:plan.year,issue,predictions:grouped.get(issue)||[],sources,rules:effective,failures:failures.filter(f=>f.issue===issue),customMaterials:custom.materials,customRecords:custom.records,draw:draws.find(d=>d.issue===issue)})]));
 const eligible=current.filter(r=>included.has(r.issue)).map(r=>{const now=available.get(r.issue);return now?.status==='blocked'?{...r,status:'blocked',numbers:[],total:null,errors:now.errors,trace:now.trace}:r;});
 const backtests=issues.filter(issue=>!eligible.some(r=>r.issue===issue&&r.status==='complete')).map(issue=>({...available.get(issue),id:'backtest:'+plan.id+':'+issue,planId:plan.id,planName:plan.name,algorithmHash,createdAt:stamp(),historical:true,backtest:true,collection:[]}));
 return {...combinationPeriodReport([...eligible,...backtests],draws),historyScope:selection.scope};
}
export async function combinationReportFor(id:string){
 const plan=await findPlan(id),snapshots=(await list("SELECT value FROM settings WHERE key LIKE ?",'combinationResult:'+plan.id+':%')).map(row=>JSON.parse(row.value));
 const algorithmHash=await hash(await combinationAlgorithm(plan));return {plan,algorithmHash,...plan.historyScope==='collected-common'?{simulationRuleHash:await hash({algorithmHash,historyScope:plan.historyScope})}:{},report:await periodReport(plan,snapshots)};
}
export async function recalculateCombinationHistory(input:any){const plan=await findPlan(input.id);for(const id of customIds(plan))await refreshCustomMaterial(id);const report=await combinationReportFor(plan.id),{refreshCombinationSimulations}=await import('./simulation-service'),simulations=await refreshCombinationSimulations(plan.id);await audit('success',`「${plan.name}」全部历史已重算：成功 ${report.report.overall.computed} 期，已核对 ${report.report.overall.settled} 期`,report.report.overall.computed);return {overall:report.report.overall,simulations};}
export async function combinationState(selectedId?:string,selectedIssue?:string){
 const values=await plans(),sources=await list('SELECT id,name,kind,year,url,error,enabled FROM sources WHERE deleted_batch IS NULL ORDER BY sort_order,created_at'),runtimeRows=await list("SELECT key,value FROM settings WHERE key LIKE 'combinationRuntime:%'"),profiles=(await list("SELECT value FROM settings WHERE key LIKE 'sourceReference:%'")).map(r=>JSON.parse(r.value));
 const runtimes=new Map(runtimeRows.map(r=>[r.key.slice('combinationRuntime:'.length),JSON.parse(r.value)]));
 const selected=selectedId?values.find(p=>p.id===selectedId):null,resultRows=selected?await list("SELECT value FROM settings WHERE key LIKE ? ORDER BY json_extract(value,'$.createdAt') DESC LIMIT 20",'combinationResult:'+selected.id+':%'):[];
 const report=selected?await periodReport(selected,(await list("SELECT value FROM settings WHERE key LIKE ?",'combinationResult:'+selected.id+':%')).map(r=>JSON.parse(r.value))):null;
 const selectedRuntime=selected?runtimes.get(selected.id):null,lastStored=selectedRuntime?.lastResultId?await setting(selectedRuntime.lastResultId,null):null,activeHash=selected?await hash(await combinationAlgorithm(selected)):null,currentResult=lastStored?.algorithmHash===activeHash?(lastStored.drawn?report?.periods.find((r:any)=>r.issue===lastStored.issue)||lastStored:lastStored):report?.periods[0]||null;
 const included=new Set(report?.periods.map((r:any)=>r.issue)||[]),closed=report?.historyScope.active?new Set((await list('SELECT issue FROM draws WHERE year=?',selected.year)).map(r=>r.issue)):new Set(),outside=(r:any)=>!!report?.historyScope.active&&!included.has(r?.issue)&&(r?.historical||r?.drawn||closed.has(r?.issue));
 const visibleCurrent=outside(currentResult)?report?.periods[0]||null:currentResult;
 const periodResult=selectedIssue?report?.periods.find((r:any)=>r.issue===String(Number(selectedIssue)).padStart(3,'0'))||null:null;
 const compactReport=report?{...report,periods:report.periods.map((r:any)=>({id:r.id,year:r.year,issue:r.issue,status:r.status,total:r.total,numbers:r.numbers,createdAt:r.createdAt,backtest:r.backtest,historical:r.historical,settlement:r.settlement,snapshotCount:r.snapshotCount,errors:r.errors}))}:null;
 const decorated=[];for(const plan of values){const runtime=runtimes.get(plan.id)||{},last=runtime.lastResultId?await setting(runtime.lastResultId,null):null;decorated.push({...plan,runtime,lastResult:last?{id:last.id,issue:last.issue,year:last.year,status:last.status,total:last.total,numbers:last.numbers,createdAt:last.createdAt,errors:last.errors}:null});}
 return {report:compactReport,periodResult,currentResult:visibleCurrent,plans:decorated,sources,customMaterials:await customMaterialSummaries(),profiles,results:resultRows.map(r=>JSON.parse(r.value)).filter(r=>r.algorithmHash===activeHash&&!outside(r)),robotConfigured:!!(await setting('wecomPush')).webhook,expectedPeriods:Object.values(await setting('expectedDrawPeriods')).filter((p:any)=>p.date>=beijingDate()).slice(-10)};
}
async function resultToSend(plan:any,selectedId?:string,manual=false){
 let result=selectedId?await setting(selectedId,null):null;
 if(selectedId&&!result)refuse('BAD_SELECTION','所选计算结果尚未保存，请先保存组合并重新计算');
 if(!result){const r=await setting(runtimeKey(plan.id));if(r.lastResultId)result=await setting(r.lastResultId,null);}
 if(!result)refuse('NO_RESULT','本期尚未保存计算结果');
 if(result.planId!==plan.id)refuse('BAD_SELECTION','所选结果不属于当前组合');
 if(result.algorithmHash!==await hash(await combinationAlgorithm(plan)))refuse('OUTDATED_ALGORITHM','组合或自建资料规则已修改，请重新计算后推送');
 const custom=await customCombinationData(customIds(plan),result.year);
 for(const item of result.trace.filter((t:any)=>t.customMaterialId)){const row=custom.records.find(r=>r.materialId===item.customMaterialId&&r.issue===result.issue);if(!row?.parsed.valid||row.recordKey!==item.customRecordKey)refuse('INPUT_FAILED',item.label+'：自建资料缺失或依据已变化，请重新计算');}
 if(result.status!=='complete'){
  if(!manual&&result.periodDate!==beijingDate())refuse('NOT_TODAY','尚无当天的完整计算记录');
  return {...result,notificationHistory:!!result.drawn||result.periodDate!==beijingDate()};
 }
 for(const item of result.trace.filter((t:any)=>t.predictionId)){
  const [p]=await list('SELECT p.id FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.id=? AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL',item.predictionId);
  const [failure]=await list("SELECT id FROM collection_periods WHERE source_id=? AND year=? AND issue=? AND status='failed' AND deleted_batch IS NULL",item.sourceId,result.year,result.issue);
  if(!p||failure)refuse('INPUT_FAILED',item.label+'：本期资料已删除或被记录为采集失败，未生成可推送的完整结果');
 }
 const period=await periodInfo(result.year,result.issue),now=new Date(Date.now()+8*3600000).toISOString().slice(11,16);
 if(period.drawn||period.date!==beijingDate()||now>=plan.cutoff)refuse('NOT_TODAY','只推送当天开奖前的完整计算结果；已开奖、跨日或超过截止时间的结果保留为历史记录');
 return result;
}
function recoveryDue(runtime:any){return !runtime.recoveryActive||runtime.recoveryDate!==beijingDate()||!!runtime.nextRecoveryAt&&runtime.nextRecoveryAt<=stamp();}
function canRecover(plan:any){return collectionWindowOpen()&&new Date(Date.now()+8*3600000).toISOString().slice(11,16)<plan.cutoff;}
export async function pushCombination(input:any,manual=true){
 const plan=await findPlan(input.id);let result:any;
 let runtime=await setting(runtimeKey(plan.id)),last=runtime.lastResultId?await setting(runtime.lastResultId,null):null;
 const selected=input.resultId?await setting(input.resultId,null):null;
 const changedCustomRule=customIds(plan).length>0&&last&&last.algorithmHash!==await hash(await combinationAlgorithm(plan));
 // Before reporting missing data, first collect the missing columns and retry.
 // Existing successful/current snapshots and explicit historical selections are
 // kept intact; failed attempts wait a full hour before the next automatic try.
 if((!input.resultId||selected?.status==='blocked'&&selected.periodDate===beijingDate())&&(!last||last.status!=='complete'||last.periodDate!==beijingDate()||changedCustomRule)&&canRecover(plan)&&(recoveryDue(runtime)||changedCustomRule)){
  await execute(plan,{onlyMissing:true,automatic:!manual});input={...input,resultId:undefined};
 }
 try{result=await resultToSend(plan,input.resultId,manual);}catch(e:any){
  if(e.code==='INPUT_FAILED'&&canRecover(plan)&&recoveryDue(await setting(runtimeKey(plan.id)))){await execute(plan,{onlyMissing:true,automatic:!manual});try{result=await resultToSend(plan,undefined,manual);}catch(next:any){e=next;}}
  if(!result){
  if(e.code==='BAD_SELECTION'||manual&&!['NO_RESULT','INPUT_FAILED'].includes(e.code))throw e;
  // A completed delivery must never turn into a false failure notification
  // merely because the clock subsequently passed the cutoff or the draw arrived.
  const runtime=await setting(runtimeKey(plan.id)),last=runtime.lastResultId?await setting(runtime.lastResultId,null):null;
  if(last?.issue&&last.periodDate===beijingDate()&&(await setting('combinationDelivery:'+plan.id+':'+last.year+':'+last.issue)).status==='sent')return {skipped:true,reason:'本期完整结果已推送'};
  const ids=sourceIds(plan),sources=ids.length?await list(`SELECT name,error FROM sources WHERE deleted_batch IS NULL AND id IN (${ids.map(()=>'?').join(',')})`,...ids):[];
  result=await saveFailure(plan,[e.message,...sources.filter(s=>s.error).map(s=>s.name+'：'+s.error),runtime.lastError].filter(Boolean));
  }
 }
 const messageType=result.status==='complete'?'complete':'blocked';
 runtime=await setting(runtimeKey(plan.id));
 const key=messageType==='complete'?'combinationDelivery:'+plan.id+':'+result.year+':'+result.issue:'combinationFailureDelivery:'+plan.id+':'+(result.periodDate||beijingDate())+':'+(result.issue||'unknown')+(runtime.recoveryAttemptId?':'+runtime.recoveryAttemptId:''),[row]=await list('SELECT value FROM settings WHERE key=?',key),before=row?JSON.parse(row.value):{};
 if(before.status==='sent')return {skipped:true,reason:messageType==='complete'?'该组合本期完整结果已推送，不重复发送':'本次补采未能计算的原因已推送，下一次补采后再通知',messageType};
 if(before.retryAt>stamp())return {skipped:true,reason:'正在推送或等待重试',messageType};
 const value={planId:plan.id,planName:plan.name,resultId:result.id,year:result.year,issue:result.issue,messageType,status:'sending',attemptAt:stamp(),retryAt:new Date(Date.now()+5*60000).toISOString()};
 const claimed=row?await run('UPDATE settings SET value=? WHERE key=? AND value=?',JSON.stringify(value),key,row.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,JSON.stringify(value));if(!claimed.meta.changes)return {skipped:true,reason:'其他任务正在推送本期组合',messageType};
 try{await sendRobotContent(combinationMessage(plan,{...result,notificationAt:messageType==='blocked'&&runtime.lastResultId===result.id?runtime.lastRecoveryAttempt:null}));await put(key,{...value,status:'sent',sentAt:stamp(),retryAt:null});await updateRuntime(plan.id,{lastPush:stamp(),lastPushIssue:result.issue,lastPushKind:messageType,lastPushError:null});await audit('success',`「${plan.name}」${result.issue?'第'+result.issue+'期':'当日'}${messageType==='complete'?'组合结果':'未能计算原因'}已推送企业微信群`,1);return {sent:true,issue:result.issue,messageType,result};}
 catch(e:any){await put(key,{...value,status:'failed',error:e.message});await updateRuntime(plan.id,{lastPushError:e.message});await audit('error',`「${plan.name}」${result.issue||'当日'}期推送失败：${e.message}`);if(manual)throw e;return {failed:true,error:e.message,messageType};}
}
export async function scheduledCombinations(){
 const values=(await plans()).filter(p=>p.calculation.enabled||p.push.enabled),localTime=new Date(Date.now()+8*3600000).toISOString().slice(11,16);let calculated=0,pushed=0,blocked=0,failed=0;
 for(const plan of values.slice(0,50)){
  const runtime=await setting(runtimeKey(plan.id)),recovering=runtime.recoveryActive&&runtime.recoveryDate===beijingDate(),retryDue=recovering&&!!runtime.nextRecoveryAt&&runtime.nextRecoveryAt<=stamp(),due=plan.calculation.enabled&&(!runtime.nextCalc||runtime.nextCalc<=stamp())&&(!recovering||retryDue),pushDue=plan.push.enabled&&localTime>=plan.push.time;
  if(!due&&!pushDue&&!retryDue)continue;
  const key='combinationLease:'+plan.id,at=Date.now(),lease=await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<=?',key,String(at+10*60000),at);if(!lease.meta.changes)continue;
  try{
   if(!canRecover(plan)){if(due||retryDue)await updateRuntime(plan.id,{nextCalc:tomorrow(plan),nextRecoveryAt:null,lastError:'已到21:30停止补采时间或组合截止时间，本日不再自动采集与重算'});}
   else if((due||retryDue)&&calculated+blocked<6){
    try{const result=await execute(plan,{onlyMissing:recovering,automatic:true});if(result.periodDate!==beijingDate()||result.drawn){await updateRuntime(plan.id,{nextCalc:nextRecoveryAt(Date.now(),plan.cutoff)||tomorrow(plan),lastError:'已检查所选栏目最新资料，等待当天待开奖期数，不使用历史结果代替'});blocked++;}
     else{await updateRuntime(plan.id,{nextCalc:result.status==='complete'?nextCalculation(plan):nextRecoveryAt(Date.now(),plan.cutoff)||tomorrow(plan)});if(result.status==='complete')calculated++;else blocked++;}}
    catch(e:any){blocked++;await updateRuntime(plan.id,{nextCalc:nextRecoveryAt(Date.now(),plan.cutoff)||tomorrow(plan),recoveryActive:true,recoveryDate:beijingDate(),nextRecoveryAt:nextRecoveryAt(Date.now(),plan.cutoff),lastError:e.message});}
   }
   if(pushDue&&pushed<4){const result=await pushCombination({id:plan.id},false);if(result.sent)pushed++;if(result.failed)failed++;}
  }finally{await run('UPDATE settings SET value=? WHERE key=?','0',key);}
 }
 return {calculated,pushed,blocked,failed};
}
