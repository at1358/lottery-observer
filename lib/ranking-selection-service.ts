import {list,run} from './db';
import {buildRankingSummary} from './ranking-summary.mjs';
import {updateRankingSelection} from './ranking-selection.mjs';
const key='rankingSummarySelection';
export async function saveRankingSelection(input:any){
 const [before]=await list('SELECT value FROM settings WHERE key=?',key),previous=before?JSON.parse(before.value):{};
 const [sources,plans]=await Promise.all([list('SELECT id,name,kind,year,deleted_batch FROM sources WHERE deleted_batch IS NULL'),list("SELECT value FROM settings WHERE key LIKE 'customMaterialPlan:%'")]);
 const materials=plans.map(row=>({plan:JSON.parse(row.value),rows:[]})),catalog=buildRankingSummary({sources,materials,year:input.year}),group=catalog.groups.find((group:any)=>group.id===input.group);
 const {selection,changed}=updateRankingSelection(previous,input,group?.rows||[]);
 if(changed){
  const value=JSON.stringify(selection),saved=before?await run('UPDATE settings SET value=? WHERE key=? AND value=?',value,key,before.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,value);
  if(!saved.meta.changes)throw Object.assign(Error('统计范围已被修改，请刷新后重试'),{status:409});
 }
 return {revision:selection.revision,group:input.group,action:input.action,changed};
}
