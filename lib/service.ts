import { env } from 'cloudflare:workers';
import {evaluate, statistics, parsePrediction, splitPeriods, inferKind, validateDraw, parseMacauSocket, KINDS} from './domain.mjs';
import {resolveModule} from './content-resolver.mjs';
import {DEFAULT_SCHEDULE,validateSchedule,effectiveSchedule,nextScheduledRun,estimatedExecution} from './schedule.mjs';
import {DEFAULT_HISTORY,parseHistory,historyUrl} from './draw-history.mjs';
import {DEFAULT_DRAW_SCHEDULE,collectionOutcome} from './collection-deadline.mjs';
import {folders as listFolders,ensureFolder,trashList} from './manage';
import {rulesWithReference,validateReferenceYear} from './number-reference.mjs';
import {collectReference} from './reference-collector.mjs';
import {sendLatestDraw,refreshPendingPush} from './wecom';
import {captureDefinitions,attachDefinitionMetadata,enrichDefinition} from './source-definition-service';
import {scheduledCombinations} from './combination-service';
import {sourceDefinitions} from './source-rules.mjs';
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const plannedLabel=(value:string)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+'（北京时间）';
function db(){if(!env.DB)throw Error('数据库尚未连接');return env.DB;}
async function list(sql:string,...args:any[]){return (await db().prepare(sql).bind(...args).all()).results as any[];}
async function run(sql:string,...args:any[]){return db().prepare(sql).bind(...args).run();}
async function batches(statements:any[]){for(let i=0;i<statements.length;i+=80)await db().batch(statements.slice(i,i+80));}
function stmt(sql:string,...args:any[]){return db().prepare(sql).bind(...args);}
export async function getSetting(key:string,fallback:any={}){const [r]=await list('SELECT value FROM settings WHERE key=?',key);return r?JSON.parse(r.value):fallback;}
export async function putSetting(key:string,value:any){await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
async function log(name:string,status:string,message:string,count=0,sourceId:string|null=null){await run('INSERT INTO jobs(id,source_id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?,?)',id(),sourceId,name,status,message,count,now());}
function validateSource(s:any){
 if(!s.name?.trim())throw Error('请填写来源名称');
 if(!Number.isInteger(+s.year)||+s.year<2000||+s.year>2100)throw Error('请确认资料年份');
 if(!KINDS.includes(s.kind))throw Error('请选择有效的资料类型');
 if(s.url)checkUrl(s.url);
 if(!Number.isInteger(+s.interval)||+s.interval<60||+s.interval>10080)throw Error('采集间隔应为 60–10080 分钟');
 if(String(s.selector||'body').length>200)throw Error('内容选择器过长');
 validateSchedule({mode:s.schedule_mode||'inherit',time:s.daily_time||'16:30',interval:s.interval},true);
 if(s.cutoff_time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.cutoff_time))throw Error('采集截止时间应为 00:00–23:59');
}
export function checkUrl(value:string){
 const u=new URL(value),h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('仅支持无密码的 HTTP / HTTPS 网页');
 if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h==='metadata.google.internal'||h.includes(':')||/^\d+(?:\.\d+){3}$/.test(h)||!h.includes('.'))throw Error('请使用公开网站域名，不支持内部地址或 IP 地址');
 return u;
}
async function download(url:string,strictOrigin=false,referer?:string){
 let u=checkUrl(url);
 for(let hop=0;hop<5;hop++){
  const response=await fetch(u.href,{redirect:'manual',signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','Accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8','Accept-Language':'zh-CN,zh;q=0.9','Cache-Control':'no-cache','Referer':referer||u.origin+'/'}});
  if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw Error('跳转地址为空');const next=checkUrl(new URL(location,u).href);if(strictOrigin&&next.origin!==new URL(url).origin){const error:any=Error('来源临时跳转到其他站点，已停止采集以免混入无关内容');error.code='UNRELATED_REDIRECT';throw error;}u=next;continue;}
  if(!response.ok)throw Error(`来源网站返回 HTTP ${response.status}`);
  const reader=response.body?.getReader();if(!reader)throw Error('网站没有返回内容');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1200000){await reader.cancel();throw Error('网页超过 1.2 MB，请缩小采集范围或使用接口');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const head=new TextDecoder().decode(bytes.slice(0,2048));const charset=(response.headers.get('content-type')?.match(/charset=["']?([^;\s"']+)/i)||head.match(/charset=["']?([^\s"'>;]+)/i))?.[1]||'utf-8';
  let text:string;try{text=new TextDecoder(charset).decode(bytes);}catch{text=new TextDecoder().decode(bytes);}
  return {text,url:u.href};
 }
 throw Error('网站跳转次数过多');
}
async function sourceDownload(url:string){
 let lastError:any;
 for(let attempt=0;attempt<3;attempt++){
  const target=checkUrl(url);if(attempt)target.searchParams.set('_period_observer_retry',Date.now()+'-'+attempt);
  try{const result=await download(target.href,true);const canonical=new URL(result.url);canonical.searchParams.delete('_period_observer_retry');return {...result,url:canonical.href};}
  catch(e:any){lastError=e;if(e.code!=='UNRELATED_REDIRECT')throw e;}
 }
 throw lastError;
}
export async function previewNumberReference(input:any){const year=validateReferenceYear(input.year);checkUrl(input.url);return collectReference({url:input.url,year},(url:string)=>download(url));}
export async function previewSource(s:any){
 const sample=s.text||s.sample||'';
 const kindHint=/半头/.test(s.name+' '+sample)&&['自动识别','杀头','头数'].includes(s.kind)?inferKind(s.name+' '+sample):s.kind;
 let data:any;
 try{data=s.url?await sourceDownload(s.content_url||s.url):{text:String(s.text||''),url:'https://text-preview.invalid/'};}
 catch(e){if(s.content_url&&s.content_url!==s.url)data=await sourceDownload(s.url);else throw e;}
 const extracted=await resolveModule(data,{selector:s.selector||'auto',sample,name:s.name,kind:kindHint},sourceDownload);
 const text=extracted.text;const kind=extracted.kind;
 const rows=splitPeriods(text).map((r:any)=>({...r,kind,parsed:{...parsePrediction(r.raw,kind,s.name),...(extracted.sourceRules&&(s.year===undefined||(r.explicitYear||+s.year+(r.yearOffset||0))===+s.year)?{sourceRules:extracted.sourceRules}:{})}}));
 if(!rows.length)throw Error('未识别到“001期”这样的期数记录。请调整内容选择器，或粘贴网页正文；动态渲染页面需要提供正文接口。');
 const keys=new Set();for(const r of rows){const key=(r.explicitYear||r.yearOffset)+'-'+r.issue;if(keys.has(key))throw Error('选中的内容包含重复期数，可能混入多个资料栏目。请把正文选择器缩小到单个作者的单项资料。');keys.add(key);}
 return {kind,rows,html:extracted.html,url:extracted.url,selector:extracted.selector,followedPages:extracted.visited};
}
export async function saveSource(s:any){
 await finalizeCollections();
 validateSource(s);const sourceId=s.id||id();
 const [previous]=await list('SELECT * FROM sources WHERE id=?',sourceId);const sample=s.text??s.sample??previous?.sample??'';
 if(previous?.deleted_batch)throw Error('该来源已删除，请先在回收站恢复');
 const folderId=s.folder_id===undefined?(previous?previous.folder_id:await ensureFolder(s.kind)):s.folder_id||null;
 if(folderId&&!(await list('SELECT id FROM folders WHERE id=? AND deleted_batch IS NULL',folderId)).length)throw Error('选择的文件夹不存在');
 const collectNow=s.collectNow===undefined?!previous:s.collectNow===true;
 const needsVerify=s.url&&sample&&(collectNow||!previous||previous.url!==s.url||previous.sample!==sample||previous.kind!==s.kind||previous.selector!==s.selector||previous.error);
 let preview:any=null,warning:string|null=null;
 if(needsVerify){try{preview=await previewSource({...s,sample,text:sample,content_url:previous?.url===s.url?s.content_url||previous.content_url:''});}catch(e:any){warning=e.message;}}
 const source={...s,id:sourceId,year:+s.year,kind:preview?.kind||s.kind,selector:preview?.selector||s.selector||'auto',sample,content_url:preview?.url||(previous?.url===s.url?previous.content_url:'')||'',schedule_mode:s.schedule_mode||'inherit',daily_time:s.daily_time||'16:30',enabled:warning?0:(s.enabled===undefined?previous?!!previous.enabled:true:!!s.enabled)?1:0};
 const defaults=await getSetting('collectionSchedule',DEFAULT_SCHEDULE);
 const scheduleChanged=!previous||previous.schedule_mode!==source.schedule_mode||previous.daily_time!==source.daily_time||previous.interval!==+s.interval||!previous.enabled&&source.enabled;
 const nextRun=scheduleChanged||!previous?.next_run?nextScheduledRun(effectiveSchedule(source,defaults)):previous.next_run;
 await run(`INSERT INTO sources(id,name,url,kind,year,selector,sample,content_url,schedule_mode,daily_time,enabled,interval,next_run,error,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,kind=excluded.kind,year=excluded.year,selector=excluded.selector,sample=excluded.sample,content_url=excluded.content_url,schedule_mode=excluded.schedule_mode,daily_time=excluded.daily_time,enabled=excluded.enabled,interval=excluded.interval,next_run=excluded.next_run,error=excluded.error`,sourceId,s.name.trim(),s.url||'',source.kind,+s.year,source.selector,sample,source.content_url,source.schedule_mode,source.daily_time,source.enabled,+s.interval,nextRun,warning?'待识别：'+warning:preview?null:previous?.error||null,previous?.created_at||now());
 await run('UPDATE sources SET cutoff_time=?,tracking_from=? WHERE id=?',s.cutoff_time||previous?.cutoff_time||'21:35',source.enabled?(previous?.enabled&&previous.tracking_from||now()):previous?.tracking_from||null,sourceId);
 await run('UPDATE sources SET folder_id=? WHERE id=?',folderId,sourceId);
 let inserted=0;
 if(preview&&collectNow){const result=await ingest(source,preview.rows);inserted=result.inserted;await storeSnapshot(sourceId,preview.html);await run('UPDATE sources SET last_run=? WHERE id=?',now(),sourceId);}
 await log(s.name,warning?'warning':'success',warning?'配置已保存，自动采集未启用：'+warning:'栏目配置已保存；下次计划 '+plannedLabel(nextRun),inserted,sourceId);
 return {id:sourceId,inserted,selector:source.selector,kind:source.kind,nextRun,estimatedRun:estimatedExecution(nextRun,Date.now(),(env as any).AUTH_MODE==='standalone'?'standalone':'sites'),warning,enabled:!!source.enabled};
}
async function storeSnapshot(sourceId:string,html:string){await run('INSERT INTO snapshots(id,source_id,html,created_at) VALUES(?,?,?,?)',id(),sourceId,html,now());await run('DELETE FROM snapshots WHERE source_id=? AND id NOT IN(SELECT id FROM snapshots WHERE source_id=? ORDER BY created_at DESC LIMIT 5)',sourceId,sourceId);}
export async function toggleSource(sourceId:string,enabled:boolean){
 await finalizeCollections();
 const [s]=await list('SELECT * FROM sources WHERE id=? AND deleted_batch IS NULL',sourceId);if(!s)throw Error('找不到该栏目');
 if(enabled&&s.error?.startsWith('待识别'))throw Error('该栏目尚未完成识别，请先打开来源设置重新识别');
 const defaults=await getSetting('collectionSchedule',DEFAULT_SCHEDULE),nextRun=enabled?nextScheduledRun(effectiveSchedule(s,defaults)):s.next_run;
 await run('UPDATE sources SET enabled=?,next_run=?,tracking_from=? WHERE id=?',enabled?1:0,nextRun,enabled?now():s.tracking_from,sourceId);
 await log(s.name,'success',enabled?'已启用自动采集，下一次计划 '+plannedLabel(nextRun):'已暂停自动采集',0,sourceId);return {enabled,nextRun};
}
export async function saveCollectionSchedule(input:any){
 const schedule=validateSchedule(input);await putSetting('collectionSchedule',schedule);
 const inherited=await list("SELECT * FROM sources WHERE schedule_mode='inherit'");
 await batches(inherited.map(s=>stmt('UPDATE sources SET next_run=? WHERE id=?',nextScheduledRun(effectiveSchedule(s,schedule)),s.id)));
 await log('采集计划','success',schedule.enabled?'全站采集计划已更新：'+(schedule.mode==='daily'?'每天 '+schedule.time:'每 '+schedule.interval+' 分钟'):'已暂停全站自动采集');return schedule;
}
export async function ingest(source:any,rows:any[],historical=false){
 if(!(await list('SELECT id FROM sources WHERE id=? AND deleted_batch IS NULL',source.id)).length)throw Error('采集来源已删除');
 const old=await list('SELECT id,issue,year,raw,parsed,kind,changed,first_seen FROM predictions WHERE source_id=?',source.id);
 const captured=rows.find(r=>r.parsed?.sourceRules)?.parsed.sourceRules,profile=await captureDefinitions(source,captured);
 const hiddenPeriods=new Map((await list('SELECT year,issue,deleted_batch FROM collection_periods WHERE source_id=? AND deleted_batch IS NOT NULL',source.id)).map(p=>[p.year+'-'+p.issue,p.deleted_batch]));
 const existing=new Map(old.map(r=>[r.year+'-'+r.issue,r]));let inserted=0,changed=0;const commands=[];const stamp=now();
 // Some older collectors retained a printed reference table inside the original
 // last row. Extract that already archived table even if the site removed the issue.
 for(const stored of old){
  const previous=JSON.parse(stored.parsed);if(stored.year!==source.year||previous.sourceRules?.capturedAt)continue;
  const definition=sourceDefinitions(stored.raw);if(!definition.entries.length)continue;
  const rules=enrichDefinition(previous.sourceRules,{...definition.rules,definitions:definition.entries.map(({index,...entry})=>entry),warnings:definition.warnings,capturedAt:stored.first_seen,version:'original:'+stored.id,origin:'首次采集原文内对照'});if(!rules)continue;
  stored.parsed=JSON.stringify({...previous,sourceRules:rules});
  commands.push(stmt('INSERT INTO revisions(id,prediction_id,raw,created_at) VALUES(?,?,?,?)',id(),stored.id,'[从首次留档原文提取对照；原文、推荐值和留档时间均保留]\n'+JSON.stringify(rules),stamp));
  commands.push(stmt('UPDATE predictions SET parsed=? WHERE id=?',stored.parsed,stored.id));
 }
 for(const r of rows){
  if(+r.issue<1||+r.issue>366)continue;
  const year=r.explicitYear||source.year+(r.yearOffset||0),key=year+'-'+r.issue,found=existing.get(key);
  if(found){
   const previous=JSON.parse(found.parsed),candidate:any=parsePrediction(r.raw,r.kind||source.kind,source.name),rules=enrichDefinition(previous.sourceRules,year===source.year?attachDefinitionMetadata(r.parsed?.sourceRules,profile):null);
   if(!(found.changed&2)&&rules&&previous.valid&&candidate.valid&&found.kind===(r.kind||source.kind)&&previous.values.length===candidate.values.length&&previous.values.every((v:any)=>candidate.values.includes(v))){
    commands.push(stmt('INSERT INTO revisions(id,prediction_id,raw,created_at) VALUES(?,?,?,?)',id(),found.id,'[来源对照补全；原文和推荐值不变；开奖后补全仅用于历史核验]\n'+JSON.stringify(rules),stamp));
    commands.push(stmt('UPDATE predictions SET parsed=?,historical=CASE WHEN EXISTS(SELECT 1 FROM draws WHERE draws.year=predictions.year AND draws.issue=predictions.issue) THEN 1 ELSE historical END WHERE id=?',JSON.stringify({...previous,sourceRules:rules}),found.id));
   }
   if(found.raw!==r.raw){commands.push(stmt('INSERT INTO revisions(id,prediction_id,raw,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM revisions WHERE prediction_id=? AND raw=?)',id(),found.id,r.raw,stamp,found.id,r.raw));commands.push(stmt('UPDATE predictions SET changed=changed|1,last_seen=? WHERE id=?',stamp,found.id));changed++;}else commands.push(stmt('UPDATE predictions SET last_seen=? WHERE id=?',stamp,found.id));continue;
  }
  const kind=r.kind||source.kind;const p={...parsePrediction(r.raw,kind,source.name),...(r.parsed?.sourceRules&&year===source.year?{sourceRules:attachDefinitionMetadata(r.parsed.sourceRules,profile)}:{})};
  const predictionId=id(),deletedBatch=hiddenPeriods.get(key)||null;commands.push(stmt('INSERT OR IGNORE INTO predictions(id,source_id,year,issue,kind,raw,parsed,first_seen,last_seen,historical,deleted_batch) VALUES(?,?,?,?,?,?,?,?,?,?,?)',predictionId,source.id,year,r.issue,kind,r.raw,JSON.stringify(p),stamp,stamp,historical?1:0,deletedBatch));existing.set(key,{raw:r.raw,id:predictionId,parsed:JSON.stringify(p),kind,changed:0});if(!deletedBatch)inserted++;
 }
 await batches(commands);return {inserted,changed};
}
export async function crawl(sourceId:string,text?:string){
 const [s]=await list('SELECT * FROM sources WHERE id=? AND deleted_batch IS NULL',sourceId);if(!s)throw Error('找不到该来源');
 try{
  const result=await previewSource({...s,text});
  s.kind=result.kind;
  const counts=await ingest(s,result.rows,!!text);
  if(!text)await storeSnapshot(s.id,result.html);
  const defaults=await getSetting('collectionSchedule',DEFAULT_SCHEDULE);
  await run('UPDATE sources SET kind=?,selector=?,content_url=?,last_run=?,next_run=?,error=NULL WHERE id=?',s.kind,result.selector,s.url?result.url:'',now(),nextScheduledRun(effectiveSchedule(s,defaults)),s.id);
  await log(s.name,'success',`新增 ${counts.inserted} 条，发现 ${counts.changed} 条内容变更`,counts.inserted,s.id);return counts;
 }catch(e:any){await run('UPDATE sources SET last_run=?,next_run=?,error=? WHERE id=?',now(),new Date(Date.now()+Math.max(30,s.interval*2)*60000).toISOString(),e.message,s.id);await log(s.name,'error',e.message,0,s.id);throw e;}
}
export async function saveDraw(input:any,provenance='手动录入',allowUnknownTime=false){
 const d=validateDraw(input,allowUnknownTime);const drawnAt=d.drawnAt?new Date(d.drawnAt).toISOString():null;
 const [before]=await list('SELECT * FROM draws WHERE year=? AND issue=?',d.year,d.issue);
 const sameResult=before?.number===d.number;
 const numbers=d.numbers?.length?d.numbers:sameResult?JSON.parse(before.numbers||'[]'):[];
 const zodiacs=d.zodiacs?.length?d.zodiacs:sameResult?JSON.parse(before.zodiacs||'[]'):[];
 const actualTime=drawnAt||before?.drawn_at||null,drawDate=d.drawDate||before?.draw_date||null;
 const zodiac=d.zodiac|| (sameResult?before.zodiac:null)||null,element=d.element||(sameResult?before.element:null)||null;
 if(before&&sameResult&&(before.zodiac||null)===zodiac&&(before.element||null)===element&&(before.drawn_at||null)===actualTime&&before.numbers===JSON.stringify(numbers)&&before.zodiacs===JSON.stringify(zodiacs)&&(before.draw_date||null)===drawDate)return {...d,unchanged:true};
 await run('INSERT INTO draws(id,year,issue,number,zodiac,element,drawn_at,provenance,updated_at,numbers,zodiacs,draw_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(year,issue) DO UPDATE SET number=excluded.number,zodiac=excluded.zodiac,element=excluded.element,drawn_at=excluded.drawn_at,provenance=excluded.provenance,updated_at=excluded.updated_at,numbers=excluded.numbers,zodiacs=excluded.zodiacs,draw_date=excluded.draw_date',id(),d.year,d.issue,d.number,zodiac,element,actualTime,provenance,now(),JSON.stringify(numbers),JSON.stringify(zodiacs),drawDate);
 await log('开奖结果','success',`${d.year} 年第 ${d.issue} 期，特码 ${String(d.number).padStart(2,'0')}，来源：${provenance}${before?'；更正前：'+JSON.stringify({number:before.number,zodiac:before.zodiac,element:before.element,drawn_at:before.drawn_at,provenance:before.provenance}):''}`,before?0:1);return d;
}
const pathValue=(obj:any,path:string)=>path?path.split('.').reduce((a,k)=>a?.[k],obj):obj;
export async function syncDraws(){
 const c=await getSetting('drawSource');if(!c.url)throw Error('请先设置可信的开奖数据接口');
 try{
  if(c.adapter==='macau-live')return await syncMacauSocket(c);
  const {text}=await download(c.url);let data;try{data=JSON.parse(text);}catch{throw Error('开奖源必须返回 JSON；请提供网页背后的开奖接口，或手动录入结果');}
  const root=pathValue(data,c.root||'');const rows=Array.isArray(root)?root:[root];if(rows.length>366)throw Error('一次最多同步 366 期');
  // Validate the entire response before writing; malformed feeds never become partial truth.
  const validated=rows.map(row=>validateDraw({year:Number(pathValue(row,c.yearField||'year')),issue:String(pathValue(row,c.issueField||'issue')),number:Number(pathValue(row,c.numberField||'number')),zodiac:pathValue(row,c.zodiacField||'zodiac')||null,element:pathValue(row,c.elementField||'element')||null,drawnAt:pathValue(row,c.timeField||'drawn_at'),numbers:pathValue(row,c.numbersField||'numbers'),zodiacs:pathValue(row,c.zodiacsField||'zodiacs'),drawDate:pathValue(row,c.dateField||'drawDate')}));
  for(const d of validated)await saveDraw(d,c.url);
  await putSetting('drawSync',{lastRun:now(),error:null,count:validated.length});return {count:validated.length};
 }catch(e:any){await putSetting('drawSync',{lastRun:now(),error:e.message});await log('开奖同步','error',e.message);throw e;}
}
export async function syncHistory(year?:number){
 const config=await getSetting('historySource',DEFAULT_HISTORY),selected=Number(year||config.year),url=historyUrl(config,selected);checkUrl(url);
 try{
  const data=await download(url,true,'https://mvqx1n.dlxyzw.com:1734/');const rows=parseHistory(data.text,selected);let changed=0;
  const existing=new Map((await list('SELECT * FROM draws WHERE year=?',selected)).map(d=>[d.issue,d])),commands=[];
  for(const row of rows){
   const before=existing.get(row.issue),numbers=JSON.stringify(row.numbers),zodiacs=JSON.stringify(row.zodiacs);
   if(before&&before.number===row.number&&before.zodiac===row.zodiac&&before.numbers===numbers&&before.zodiacs===zodiacs&&before.draw_date===row.drawDate)continue;
   changed++;
   commands.push(stmt('INSERT INTO draws(id,year,issue,number,zodiac,element,drawn_at,provenance,updated_at,numbers,zodiacs,draw_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(year,issue) DO UPDATE SET number=excluded.number,zodiac=excluded.zodiac,element=excluded.element,drawn_at=excluded.drawn_at,provenance=excluded.provenance,updated_at=excluded.updated_at,numbers=excluded.numbers,zodiacs=excluded.zodiacs,draw_date=excluded.draw_date',id(),row.year,row.issue,row.number,row.zodiac,before?.number===row.number?before.element:null,before?.drawn_at||null,url,now(),numbers,zodiacs,row.drawDate));
   if(before)commands.push(stmt('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',id(),'开奖更正','success',`${row.year} 年第 ${row.issue} 期历史开奖补全或更正；原记录：${JSON.stringify(before)}；新记录：${JSON.stringify(row)}`,0,now()));
  }
  await batches(commands);
  await putSetting('historySync',{lastRun:now(),year:selected,count:rows.length,changed,error:null});
  await log('历史开奖','success',`${selected} 年历史开奖同步完成，共 ${rows.length} 期，新增或更新 ${changed} 期（六码平码、特码及七码生肖）`,changed);
  await finalizeCollections();return {count:rows.length,changed,year:selected};
 }catch(e:any){await putSetting('historySync',{lastRun:now(),year:selected,error:e.message});await log('历史开奖','error',e.message);throw e;}
}
export async function saveDrawSchedule(input:any){
 const value=validateSchedule({...DEFAULT_DRAW_SCHEDULE,...input,mode:'daily'});
 await putSetting('drawSchedule',value);await putSetting('drawScheduleState',{nextRun:nextScheduledRun(value)});return value;
}
export async function finalizeCollections(){
 const [sources,predictions,draws,socket,expected,finalized]=await Promise.all([list('SELECT * FROM sources WHERE enabled=1 AND tracking_from IS NOT NULL AND deleted_batch IS NULL'),list('SELECT * FROM predictions'),list('SELECT year,issue,draw_date FROM draws WHERE draw_date IS NOT NULL'),getSetting('drawSocket'),getSetting('expectedDrawPeriods'),list('SELECT source_id,year,issue FROM collection_periods')]);
 const periods=new Map(draws.map(d=>[d.year+'-'+d.issue,{year:d.year,issue:d.issue,date:d.draw_date}]));
 for(const [key,value] of Object.entries(expected))periods.set(key,value as any);
 const nextDate=socket.nextDrawText?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
 if(nextDate&&socket.nextIssue){const year=Number(nextDate[1]),issue=String(Number(socket.nextIssue)).padStart(3,'0');periods.set(year+'-'+issue,{year,issue,date:`${year}-${nextDate[2].padStart(2,'0')}-${nextDate[3].padStart(2,'0')}`});}
 const ps=new Map(predictions.map(p=>[p.source_id+'-'+p.year+'-'+p.issue,p])),done=new Set(finalized.map(p=>p.source_id+'-'+p.year+'-'+p.issue));let failed=0;
 for(const s of sources)for(const p of periods.values()){
  if(s.year!==p.year||done.has(s.id+'-'+p.year+'-'+p.issue)||ps.get(s.id+'-'+p.year+'-'+p.issue)?.deleted_batch)continue;
  const outcome=collectionOutcome(s,ps.get(s.id+'-'+p.year+'-'+p.issue),p.date);if(!outcome)continue;
  const result=await run('INSERT OR IGNORE INTO collection_periods(id,source_id,year,issue,deadline_at,status,reason,finalized_at) VALUES(?,?,?,?,?,?,?,?)',id(),s.id,p.year,p.issue,outcome.deadline,outcome.status,outcome.reason,now());
  if(result.meta.changes&&outcome.status==='failed'){failed++;await log(s.name,'error',`${p.year} 年第 ${p.issue} 期：${outcome.reason}`,0,s.id);}
 }
 return {failed};
}
export async function dailyDrawUpdate(){
 const result:any={live:null,history:null,errors:[]};
 const c=await getSetting('drawSource'),h=await getSetting('historySource',DEFAULT_HISTORY);
 if(c.enabled&&c.url)try{result.live=await syncDraws();}catch(e:any){result.errors.push(e.message);}
 if(h.enabled)try{result.history=await syncHistory();}catch(e:any){result.errors.push(e.message);}
 result.collections=await finalizeCollections();
 await putSetting('drawScheduleState',{lastRun:now(),nextRun:nextScheduledRun(await getSetting('drawSchedule',DEFAULT_DRAW_SCHEDULE)),error:result.errors.join('；')||null});
 return result;
}
export async function scheduledDrawUpdate(){
 const schedule=await getSetting('drawSchedule',DEFAULT_DRAW_SCHEDULE),[stored]=await list("SELECT value FROM settings WHERE key='drawScheduleState'"),before=stored?JSON.parse(stored.value):{};
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),todayRun=today+'T'+schedule.time+':00+08:00';
 const due=schedule.enabled&&((before.nextRun&&before.nextRun<=now())||(!before.nextRun&&Date.parse(todayRun)<=Date.now()));
 if(!due)return {skipped:true,reason:schedule.enabled?'尚未到开奖采集时间':'开奖自动采集已暂停'};
 const lease=JSON.stringify({...before,nextRun:new Date(Date.now()+20*60000).toISOString()});
 const claimed=stored?await run("UPDATE settings SET value=? WHERE key='drawScheduleState' AND value=?",lease,stored.value):await run("INSERT OR IGNORE INTO settings(key,value) VALUES('drawScheduleState',?)",lease);
 if(!claimed.meta.changes)return {skipped:true,reason:'已有开奖同步任务执行中'};
 return dailyDrawUpdate();
}
export async function tick(){
 const stamp=now();let success=0,failed=0;
 const drawResult:any=await scheduledDrawUpdate();if(!drawResult.skipped){success+=drawResult.errors.length?0:1;failed+=drawResult.errors.length;}
 await refreshPendingPush(dailyDrawUpdate);
 const pushResult:any=await sendLatestDraw();if(pushResult.sent)success++;if(pushResult.failed)failed++;
 await finalizeCollections();
 const collectionSchedule=await getSetting('collectionSchedule',DEFAULT_SCHEDULE);
 const due=collectionSchedule.enabled===false?[]:await list('SELECT * FROM sources WHERE deleted_batch IS NULL AND enabled=1 AND url<>\'\' AND (next_run IS NULL OR next_run<=?) ORDER BY next_run LIMIT 8',stamp);
 for(const s of due){
  // Atomic lease prevents simultaneous cloud/manual ticks from fetching the same source.
  const lease=await run('UPDATE sources SET next_run=? WHERE id=? AND (next_run IS NULL OR next_run<=?)',new Date(Date.now()+10*60000).toISOString(),s.id,stamp);
  if(!lease.meta.changes)continue;
  try{await crawl(s.id);success++;}catch{failed++;}
 }
 await finalizeCollections();
 const [remaining]=await list('SELECT COUNT(*) AS count FROM sources WHERE deleted_batch IS NULL AND enabled=1 AND url<>\'\' AND (next_run IS NULL OR next_run<=?)',now());
 const combinations=await scheduledCombinations();success+=combinations.calculated+combinations.pushed;failed+=combinations.failed;
 const pending=collectionSchedule.enabled===false?0:remaining.count;
 await putSetting('scheduler',{lastRun:now(),success,failed,remaining:pending});
 await log('定时检查',failed?'error':'success',collectionSchedule.enabled===false?'全站自动采集已暂停；开奖同步按原设置运行':`本批检查完成：成功 ${success}，失败 ${failed}，剩余到期栏目 ${pending}`,success);
 return {success,failed,remaining:pending,push:pushResult,combinations};
}
export async function recheckResults(input:any={}){
 const query=new URLSearchParams();let name='全部采集资料';
 if(input.source){const [source]=await list('SELECT name FROM sources WHERE id=? AND deleted_batch IS NULL',input.source);if(!source)throw Error('找不到该采集栏目');query.set('source',input.source);name=source.name;}
 if(input.year!==undefined&&input.year!==''){const year=validateReferenceYear(input.year);query.set('year',String(year));name+=' · '+year+' 年';}
 // The same evaluation path powers the table, ranking and explicit recheck.
 // It evaluates all matching rows before pagination and never trusts a page's 准/中 label.
 const result=await state(query),report={...result.stats,name,source:input.source||null,year:query.get('year')||null,checkedAt:now()};
 await putSetting('lastVerification',report);
 await log('开奖复核','success',`${name}：共 ${report.total} 条，正确 ${report.win}，错误 ${report.loss}，待开奖 ${report.pending}，待复核 ${report.review}，采集失败 ${report.collectionFailed}`,report.settled,input.source||null);
 return report;
}
export async function state(query:URLSearchParams){
 await finalizeCollections();
 const [sources,ps,drawRows,jobs,rules,drawSource,drawSync,scheduler,collectionSchedule,historySource,historySync,drawSchedule,drawScheduleState,periods,referenceRows]=await Promise.all([
  list('SELECT * FROM sources WHERE deleted_batch IS NULL ORDER BY sort_order,created_at,name'),list('SELECT p.* FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.deleted_batch IS NULL AND s.deleted_batch IS NULL ORDER BY p.year DESC,p.issue DESC'),list('SELECT * FROM draws ORDER BY year DESC,issue DESC'),list('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 80'),getSetting('rules'),getSetting('drawSource'),getSetting('drawSync'),getSetting('scheduler'),getSetting('collectionSchedule',DEFAULT_SCHEDULE),getSetting('historySource',DEFAULT_HISTORY),getSetting('historySync'),getSetting('drawSchedule',DEFAULT_DRAW_SCHEDULE),getSetting('drawScheduleState'),list("SELECT c.* FROM collection_periods c JOIN sources s ON s.id=c.source_id WHERE c.status='failed' AND c.deleted_batch IS NULL AND s.deleted_batch IS NULL"),list("SELECT value FROM settings WHERE key LIKE 'numberReference:%'")]);
 const annualReferences=new Map(referenceRows.map(r=>{const p=JSON.parse(r.value);return [p.year,p];}));
 const draws=drawRows.map(d=>({...d,numbers:JSON.parse(d.numbers||'[]'),zodiacs:JSON.parse(d.zodiacs||'[]')}));
 const dm=new Map(draws.map(d=>[d.year+'-'+d.issue,d]));const sm=new Map(sources.map(s=>[s.id,s]));
 const failures=new Map(periods.map(p=>[p.source_id+'-'+p.year+'-'+p.issue,p]));
 const effectiveRules=new Map([...new Set(ps.map(p=>p.year))].map(year=>[year,rulesWithReference(rules.years?.[year]||{},annualReferences.get(year))]));
 const all=ps.map(p=>{const draw=dm.get(p.year+'-'+p.issue),failure=failures.get(p.source_id+'-'+p.year+'-'+p.issue);return {...p,name:sm.get(p.source_id)?.name||'',parsed:JSON.parse(p.parsed),draw,collectionFailure:failure||null,backtest:!!p.historical||!!draw&&(!draw.drawn_at||p.first_seen>=draw.drawn_at),verdict:failure?{status:'collection_failed',reason:failure.reason}:evaluate(p,draw,effectiveRules.get(p.year)||{})};});
 const existing=new Set(ps.map(p=>p.source_id+'-'+p.year+'-'+p.issue));
 for(const failure of periods){if(existing.has(failure.source_id+'-'+failure.year+'-'+failure.issue))continue;const source=sm.get(failure.source_id);if(!source)continue;all.push({...failure,id:'failed:'+failure.id,name:source.name,kind:source.kind,raw:'',parsed:{valid:false,values:[],warnings:[]},first_seen:failure.finalized_at,last_seen:failure.finalized_at,historical:0,changed:0,draw:dm.get(failure.year+'-'+failure.issue),backtest:false,synthetic:true,collectionFailure:failure,verdict:{status:'collection_failed',reason:failure.reason}});}
 all.sort((a,b)=>b.year-a.year||Number(b.issue)-Number(a.issue));
 let filtered=all.filter(p=>(!query.get('source')||p.source_id===query.get('source'))&&(!query.get('kind')||p.kind===query.get('kind'))&&(!query.get('year')||p.year===Number(query.get('year')))&&(!query.get('from')||+p.issue>=Number(query.get('from')))&&(!query.get('to')||+p.issue<=Number(query.get('to')))&&(!query.get('q')||(p.name+' '+p.raw).includes(query.get('q')||'')));
 if(query.get('cohort')==='forward')filtered=filtered.filter(p=>!p.backtest);if(query.get('cohort')==='backtest')filtered=filtered.filter(p=>p.backtest);
 const stats=statistics(filtered);const ranking=sources.map(s=>({...s,stats:statistics(filtered.filter(p=>p.source_id===s.id))})).filter(s=>s.stats.total>0).sort((a,b)=>(b.stats.rate??-1)-(a.stats.rate??-1));if(query.get('status'))filtered=filtered.filter(p=>p.verdict.status===query.get('status'));
 const rank=sources.map(s=>({...s,stats:statistics(all.filter(p=>p.source_id===s.id))}));
 const page=Math.max(1,+query.get('page')!||1),pageSize=25;
 const issues=[...new Set(filtered.map(p=>p.year+'-'+p.issue))].sort().slice(-60);
 const trend=issues.map(issue=>({issue,...statistics(filtered.filter(p=>p.year+'-'+p.issue===issue))}));
 const nextCollection=sources.filter(s=>s.enabled&&s.next_run).map(s=>s.next_run).sort()[0]||null;
 return {runtime:(env as any).AUTH_MODE==='standalone'?'standalone':'sites',overviewDisplay:await getSetting('overviewDisplay',{range:20,chart:'area',showLoss:true}),folders:await listFolders(),trash:await trashList(),sources:rank,ranking,rows:filtered.slice((page-1)*pageSize,page*pageSize),count:filtered.length,page,pageSize,stats,global:statistics(all),draws,jobs,rules,drawSource,drawSync,scheduler,trend,collectionSchedule,historySource,historySync,drawSchedule,drawScheduleState,scheduleInfo:{nextRun:nextCollection,estimatedRun:nextCollection?estimatedExecution(nextCollection,Date.now(),(env as any).AUTH_MODE==='standalone'?'standalone':'sites'):null,nextCheck:estimatedExecution(now(),Date.now(),(env as any).AUTH_MODE==='standalone'?'standalone':'sites')}};
}
export async function revise(predictionId:string,raw:string,kind:string){
 await finalizeCollections();
 const [p]=await list('SELECT p.*,s.name FROM predictions p JOIN sources s ON p.source_id=s.id WHERE p.id=? AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL',predictionId);if(!p)throw Error('记录不存在');
 if(!KINDS.includes(kind)||kind==='自动识别')throw Error('请指定资料类型');
 const previousParsed=JSON.parse(p.parsed),parsed={...parsePrediction(raw,kind,p.name),...(previousParsed.sourceRules?{sourceRules:previousParsed.sourceRules}:{})};if(!parsed.valid)throw Error(parsed.warnings.join('；'));
 // Correct the interpretation, preserve the collected original and record the operator's input.
 await db().batch([stmt('INSERT INTO revisions(id,prediction_id,raw,created_at) VALUES(?,?,?,?)',id(),p.id,'[人工解析修正]\n'+raw,now()),stmt('UPDATE predictions SET parsed=?,kind=?,historical=1,changed=changed|2 WHERE id=?',JSON.stringify(parsed),kind,p.id)]);return {parsed};
}
export async function snapshot(sourceId:string){const [r]=await list('SELECT x.* FROM snapshots x JOIN sources s ON s.id=x.source_id WHERE x.source_id=? AND s.deleted_batch IS NULL ORDER BY x.created_at DESC LIMIT 1',sourceId);return r;}
export async function history(predictionId:string){return list('SELECT r.* FROM revisions r JOIN predictions p ON p.id=r.prediction_id JOIN sources s ON s.id=p.source_id WHERE r.prediction_id=? AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL ORDER BY r.created_at',predictionId);}
async function syncMacauSocket(config:any){
 const frame=await download(config.frameUrl||'https://tbjl.sxhwqc.com:2025/am.html');
 const match=frame.text.match(/(?:let|const|var)\s+serverUrl\s*=\s*['"](wss:\/\/[^'"]+)['"]/g)?.filter(s=>!s.includes('webapi.'));
 const last=match?.at(-1)?.match(/['"](wss:\/\/[^'"]+)['"]/)?.[1];if(!last)throw Error('开奖页面的推送地址已变更，需要重新适配');
 const socketUrl=checkUrl(last.replace(/^wss:/,'https:'));
 let socket:any;
 if((env as any).openWebSocket){socket=(env as any).openWebSocket(last);await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{socket.close();reject(Error('连接开奖推送超时'));},15000);socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('开奖推送连接失败'));},{once:true});});}
 else{const response=await fetch(socketUrl.href,{headers:{Upgrade:'websocket'},signal:AbortSignal.timeout(15000)});socket=response.webSocket;if(!socket)throw Error('开奖推送连接失败：HTTP '+response.status);socket.accept();}
 const draw:any=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{socket.close();reject(Error('等待完整开奖推送超时'));},15000);
  const done=(error:any,value?:any)=>{clearTimeout(timeout);socket.close(1000);error?reject(error):resolve(value);};
  socket.addEventListener('message',(event:any)=>{try{const result=parseMacauSocket(String(event.data));if(result)done(null,result);}catch(e){done(e);}});
  socket.addEventListener('error',()=>done(Error('开奖推送连接发生错误')));
  socket.send('am');
 });
 // This feed supplies next-draw time only. Never fabricate the completed draw's timestamp.
 const saved=await saveDraw(draw,config.url,true);
 const nextDate=draw.nextDrawText.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
 if(nextDate){const year=Number(nextDate[1]),issue=String(Number(draw.nextIssue)).padStart(3,'0'),expected=await getSetting('expectedDrawPeriods');expected[year+'-'+issue]={year,issue,date:`${year}-${nextDate[2].padStart(2,'0')}-${nextDate[3].padStart(2,'0')}`};await putSetting('expectedDrawPeriods',Object.fromEntries(Object.entries(expected).sort().slice(-740)));}
 await putSetting('drawSocket',{lastRun:now(),year:draw.year,issue:draw.issue,numbers:draw.numbers,zodiac:draw.zodiac,nextIssue:draw.nextIssue,nextDrawText:draw.nextDrawText,raw:draw.raw,frameUrl:frame.url,socketUrl:last});
 await putSetting('drawSync',{lastRun:now(),error:null,count:1,issue:draw.issue,number:draw.number});
 return {count:1,issue:draw.issue,number:draw.number,unchanged:saved.unchanged||false};
}
