import {list,run} from './db';
import {evaluate,statistics} from './domain.mjs';
import {rulesWithReference} from './number-reference.mjs';
import {restoreArchivedDefinitions} from './source-definition-service';

export async function verifyStoredResults(input:any={}){
 const year=input.year?Number(input.year):null;
 const restored=await restoreArchivedDefinitions(input.source,year||undefined);
 const args=[...(input.source?[input.source]:[]),...(year?[year]:[]),...(input.issues||[])];
 const where=`${input.source?' AND p.source_id=?':''}${year?' AND p.year=?':''}${input.issues?.length?` AND p.issue IN (${input.issues.map(()=>'?').join(',')})`:''}`;
 const [rows,draws,refs,ruleRows,failures]=await Promise.all([
  list('SELECT p.* FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.deleted_batch IS NULL AND s.deleted_batch IS NULL'+where,...args),
  list('SELECT * FROM draws'),list("SELECT value FROM settings WHERE key LIKE 'numberReference:%'"),list("SELECT value FROM settings WHERE key='rules'"),
  list("SELECT p.* FROM collection_periods p JOIN sources s ON s.id=p.source_id WHERE p.status='failed' AND p.deleted_batch IS NULL AND s.deleted_batch IS NULL"+where,...args)
 ]);
 const dm=new Map(draws.map(d=>[d.year+'-'+d.issue,d])),annual=new Map(refs.map(r=>{const v=JSON.parse(r.value);return [v.year,v];})),rules=ruleRows[0]?JSON.parse(ruleRows[0].value):{},fm=new Map(failures.map(p=>[p.source_id+'-'+p.year+'-'+p.issue,p])),seen=new Set();
 const checked=rows.map(p=>{const key=p.source_id+'-'+p.year+'-'+p.issue;seen.add(key);const failed=fm.get(key);return {...p,verdict:failed?{status:'collection_failed',reason:failed.reason}:evaluate(p,dm.get(p.year+'-'+p.issue),rulesWithReference(rules.years?.[p.year]||{},annual.get(p.year)))};});
 for(const f of failures)if(!seen.has(f.source_id+'-'+f.year+'-'+f.issue))checked.push({...f,verdict:{status:'collection_failed',reason:f.reason}});
 const report={...statistics(checked),name:input.name||'全部采集资料',source:input.source||null,year:year?String(year):null,issues:input.issues||null,trigger:input.trigger||'manual',restored,checkedAt:new Date().toISOString()};
 await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','lastVerification',JSON.stringify(report));
 await run('INSERT INTO jobs(id,source_id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),input.source||null,'开奖复核','success',`${report.trigger==='draw'?'开奖入库后自动复核':'手动复核'}：${report.name}，共 ${report.total} 条，正确 ${report.win}，错误 ${report.loss}，待开奖 ${report.pending}，待复核 ${report.review}，采集失败 ${report.collectionFailed}${restored?'；已补全 '+restored+' 条留档对照':''}`,report.settled,report.checkedAt);
 return report;
}
