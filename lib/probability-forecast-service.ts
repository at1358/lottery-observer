import {list,run,db,stmt} from './db';
import {evaluate} from './domain.mjs';
import {effectivePrediction} from './complete-prediction.mjs';
import {rulesWithReference} from './number-reference.mjs';
import {buildCustomMaterial} from './custom-material.mjs';
import {FORECAST_MODEL,forecastKey,forecastSignature,forecastSchedule,forecastTarget,estimateProbability,numericBaseline,visibleForecast} from './probability-forecast.mjs';

const currentKey='probabilityForecastCurrent',runtimeKey='probabilityForecastRuntime',leaseKey='probabilityForecastLease';
const stamp=()=>new Date().toISOString();
async function setting(key:string,fallback:any=null){const [row]=await list('SELECT value FROM settings WHERE key=?',key);return row?JSON.parse(row.value):fallback;}
async function put(key:string,value:any){await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
export async function probabilityForecastState(){
 const [pack,runtime,draws]=await Promise.all([setting(currentKey),setting(runtimeKey,{}),list('SELECT year,issue FROM draws')]);
 return {pack,draws,automation:{...forecastSchedule(runtime),lastRun:runtime.lastRun||null,lastSuccessAt:runtime.lastSuccessAt||null,error:runtime.error||null,target:pack?.target||null,model:FORECAST_MODEL},forItem:(item:any,origin:string)=>visibleForecast(pack,item,origin,draws)};
}
/** No fetches, remote AI keys, settlement writes, or changes to stored material rules. */
export async function refreshProbabilityForecasts(manual=false){
 let runtime=await setting(runtimeKey,{}),schedule=forecastSchedule(runtime);
 if(!manual&&!schedule.due)return {skipped:true,nextRun:schedule.nextRun};
 const at=Date.now(),lease=String(at+5*60000),claimed=await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<=?',leaseKey,lease,at);
 if(!claimed.meta.changes)return {skipped:true,reason:'概率参考正在计算'};
 try{
  runtime=await setting(runtimeKey,{});schedule=forecastSchedule(runtime);
  if(!manual&&!schedule.due)return {skipped:true,nextRun:schedule.nextRun};
  const [sources,predictions,draws,expected,rules,referenceRows,planRows,previousRows,failures]=await Promise.all([
   list('SELECT * FROM sources WHERE deleted_batch IS NULL'),list('SELECT p.* FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.deleted_batch IS NULL AND s.deleted_batch IS NULL'),list('SELECT * FROM draws'),setting('expectedDrawPeriods',{}),setting('rules',{}),list("SELECT key,value FROM settings WHERE key LIKE 'numberReference:%'"),list("SELECT value FROM settings WHERE key LIKE 'customMaterialPlan:%'"),list("SELECT key,value FROM settings WHERE key LIKE 'customMaterialRows:%'"),list("SELECT source_id,year,issue FROM collection_periods WHERE status='failed' AND deleted_batch IS NULL")
  ]);
  const target=forecastTarget(draws,expected,at);
  if(!target.ready||!target.issue){
   await put(runtimeKey,{...runtime,lastRun:stamp(),error:target.reason,retryAt:new Date(at+5*60000).toISOString(),...(target.drawn?{closedDate:schedule.date}:{})});
   return {skipped:true,reason:target.reason,nextRun:forecastSchedule(await setting(runtimeKey,{})).nextRun};
  }
  const dm=new Map(draws.map(d=>[d.year+':'+Number(d.issue),d])),references=new Map(referenceRows.map(r=>[Number(r.key.split(':')[1]),JSON.parse(r.value)])),prior=new Map(previousRows.map(r=>[r.key.slice('customMaterialRows:'.length),JSON.parse(r.value)])),blocked=new Set(failures.map(r=>r.source_id+':'+r.year+':'+Number(r.issue))),items:any={};
  const generatedAt=stamp(),validDraw=(draw:any)=>draw&&Number.isInteger(draw.number)&&draw.number>=1&&draw.number<=49&&(!draw.drawn_at||Date.parse(draw.drawn_at)<=at);
  for(const source of sources.filter(s=>s.year===target.year)){
   const rows=predictions.filter(p=>p.source_id===source.id).map(initial=>{
    const p=effectivePrediction(initial),draw=dm.get(p.year+':'+Number(p.issue));
    const excluded=blocked.has(p.source_id+':'+p.year+':'+Number(p.issue))||Date.parse(p.first_seen)>at||!validDraw(draw)||source.kind!=='自动识别'&&p.kind!==source.kind;
    const verdict=excluded?{status:'review'}:evaluate(p,draw,rulesWithReference(rules.years?.[p.year]||{},references.get(p.year)));
    return {...p,backtest:!!p.historical||!!draw&&(!draw.drawn_at||p.first_seen>=draw.drawn_at),verdict};
   });
   const current=predictions.map(effectivePrediction).find(p=>p.source_id===source.id&&p.year===target.year&&+p.issue===+target.issue),content=current?JSON.parse(current.parsed):null,currentValid=!!content?.valid&&!blocked.has(source.id+':'+target.year+':'+Number(target.issue));
   items[forecastKey('collected',source.id)]={...estimateProbability(rows,target),signature:forecastSignature(source),origin:'collected',id:source.id,name:source.name,target,generatedAt,targetDataAvailable:currentValid,baseline:currentValid?numericBaseline(current.kind,content.values):null};
  }
  for(const row of planRows){
   const plan=JSON.parse(row.value);if(plan.deletedAt||plan.year!==target.year)continue;
   // Generate into memory only; never overwrite a custom column's stored results.
   const result=buildCustomMaterial(plan,draws,Object.values(expected),references.get(plan.year)||null,prior.get(plan.id)||null,generatedAt);
   const rows=result.rows.map((r:any)=>({...r,status:validDraw(dm.get(r.year+':'+Number(r.issue)))?r.status:'review'})),current=rows.find((r:any)=>+r.issue===+target.issue);
   items[forecastKey('custom',plan.id)]={...estimateProbability(rows,target),signature:forecastSignature(plan),origin:'custom',id:plan.id,name:plan.name,target,generatedAt,targetDataAvailable:!!(current?.valid||current?.killZodiac),baseline:current?.valid||current?.killZodiac?numericBaseline(plan.type||'lag-zodiac',current.killNumbers):null};
  }
  const pack={model:FORECAST_MODEL,revision:crypto.randomUUID(),generatedAt,target,items},nextRuntime={lastRun:generatedAt,lastSuccessAt:generatedAt,lastSuccessDate:schedule.date,error:null,retryAt:null,count:Object.keys(items).length};
  const writes=[['probabilityForecastHistory:'+schedule.date+':'+pack.revision,pack],[currentKey,pack],[runtimeKey,nextRuntime]].map(([key,value])=>stmt('INSERT INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value),leaseKey,lease));
  const saved=await db().batch(writes);if(!saved.every((r:any)=>r.meta.changes))throw Error('概率计算任务已被其他进程接管，请重试');
  await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'下一期概率参考','success',`北京时间每天12:00；${target.year}年第${target.issue}期，共${Object.keys(items).length}个栏目；仅历史统计估计，不保证下一期结果`,Object.keys(items).length,generatedAt);
  return {calculated:Object.keys(items).length,target,generatedAt,nextRun:forecastSchedule(nextRuntime).nextRun};
 }catch(error:any){
  await run('INSERT INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',runtimeKey,JSON.stringify({...runtime,lastRun:stamp(),error:'概率参考计算失败：'+error.message,retryAt:new Date(Date.now()+5*60000).toISOString()}),leaseKey,lease);
  await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'下一期概率参考','error',error.message,0,stamp());
  if(manual)throw error;return {failed:1,error:error.message};
 }finally{await run('UPDATE settings SET value=? WHERE key=? AND value=?','0',leaseKey,lease);}
}
