import {list,run,db,stmt} from './db';
import {validateCustomMaterial,buildCustomMaterial,annualPeriods} from './custom-material.mjs';
const planKey=(id:string)=>'customMaterialPlan:'+id,rowsKey=(id:string)=>'customMaterialRows:'+id;
const stamp=()=>new Date().toISOString();
async function setting(key:string,fallback:any=null){const [row]=await list('SELECT value FROM settings WHERE key=?',key);return row?JSON.parse(row.value):fallback;}
async function find(id:string){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('自建栏目编号无效');const plan=await setting(planKey(id));if(!plan)throw Error('该自建栏目不存在');return plan;}
export async function customMaterialSummaries(){
 const rows=await list("SELECT p.value AS plan,json_extract(r.value,'$.stats') AS stats,json_extract(r.value,'$.lastCheckedAt') AS checked FROM settings p LEFT JOIN settings r ON r.key='customMaterialRows:'||substr(p.key,length('customMaterialPlan:')+1) WHERE p.key LIKE 'customMaterialPlan:%' ORDER BY json_extract(p.value,'$.lag'),json_extract(p.value,'$.year') DESC,json_extract(p.value,'$.createdAt')");
 return rows.map(r=>({...JSON.parse(r.plan),stats:r.stats?JSON.parse(r.stats):null,lastCheckedAt:r.checked||null}));
}
export async function refreshCustomMaterial(id:string){
 for(let attempt=0;attempt<4;attempt++){
  const plan=await find(id),[before]=await list('SELECT value FROM settings WHERE key=?',rowsKey(id)),previous=before?JSON.parse(before.value):null;
  const [draws,expected,reference]=await Promise.all([list('SELECT * FROM draws WHERE year BETWEEN ? AND ?',plan.year-2,plan.year),setting('expectedDrawPeriods',{}),setting('numberReference:'+plan.year)]);
  const result=buildCustomMaterial(plan,draws,Object.values(expected),reference,previous),value=JSON.stringify(result),serialized=JSON.stringify(plan);
  const saved=before?await run('UPDATE settings SET value=? WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',value,rowsKey(id),before.value,planKey(id),serialized):await run('INSERT OR IGNORE INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',rowsKey(id),value,planKey(id),serialized);
  if(saved.meta.changes)return {plan,...result};
 }
 throw Error('自建资料正在更新，请稍后刷新');
}
export async function refreshCustomMaterials(year?:number){
 const plans=(await customMaterialSummaries()).filter(p=>!year||p.year>=year&&p.year<=year+2);let checked=0;
 for(const plan of plans){await refreshCustomMaterial(plan.id);checked++;}return {checked};
}
export async function saveCustomMaterial(input:any){
 const value=validateCustomMaterial(input),old=input.id?await find(input.id):null,id=old?.id||crypto.randomUUID();
 const maxima=await list('SELECT year,MAX(CAST(issue AS INTEGER)) AS issue FROM draws WHERE year BETWEEN ? AND ? GROUP BY year',value.year-2,value.year);
 for(const row of maxima)if(row.issue>annualPeriods(row.year,value.periodCounts))throw Error(`${row.year} 年开奖管理已有第 ${row.issue} 期，请将该年度总期数设为366，避免跨年取期错误`);
 if(old&&input.revision!==old.revision){const error:any=Error('该栏目已被其他页面修改，请重新载入');error.status=409;throw error;}
 if(!old&&(await customMaterialSummaries()).length>=50)throw Error('最多创建50个自建栏目');
 const plan={...value,id,revision:crypto.randomUUID(),createdAt:old?.createdAt||stamp(),updatedAt:stamp()},serialized=JSON.stringify(plan);
 // Archive the preceding rules and generated records before changing a column.
 if(old){
  const [snapshot]=await list('SELECT value FROM settings WHERE key=?',rowsKey(id));
  const results=await db().batch([
   stmt('INSERT OR IGNORE INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)','customMaterialArchive:'+id+':'+old.revision,JSON.stringify({plan:old,records:snapshot?JSON.parse(snapshot.value):null,archivedAt:stamp()}),planKey(id),JSON.stringify(old)),
   stmt('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,planKey(id),JSON.stringify(old))
  ]);if(!results[1].meta.changes)throw Error('该栏目存在并发修改，请重新载入');
 }else{const saved=await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',planKey(id),serialized);if(!saved.meta.changes)throw Error('栏目已存在，请重新载入');}
 const result=await refreshCustomMaterial(id);
 await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'自建资料','success',`「${plan.name}」已保存：${plan.year} 年目标期减 ${plan.lag} 期取冲肖杀号，已生成 ${result.rows.length} 期`,result.rows.length,stamp());
 return {plan,stats:result.stats};
}
export async function readCustomMaterials(params=new URLSearchParams()){
 const items=await customMaterialSummaries(),id=params.get('material');if(!id)return {items};
 const plan=await find(id),stored=await setting(rowsKey(id),{rows:[],stats:null,lastCheckedAt:null});
 const status=params.get('status')||'',from=params.get('from')||'',to=params.get('to')||'',page=Math.max(1,Math.floor(Number(params.get('page'))||1)),pageSize=25;
 if(status&&!['win','loss','pending','review'].includes(status))throw Error('核验筛选无效');
 for(const v of [from,to])if(v&&(!/^\d{1,3}$/.test(v)||+v<1||+v>366))throw Error('筛选期数应为1–366');if(from&&to&&+from>+to)throw Error('开始期数不能大于结束期数');
 const filtered=stored.rows.filter((r:any)=>(!status||r.status===status)&&(!from||+r.issue>=+from)&&(!to||+r.issue<=+to));
 return {items,plan,stats:stored.stats,rows:filtered.slice((page-1)*pageSize,page*pageSize),count:filtered.length,page,pageSize,lastCheckedAt:stored.lastCheckedAt};
}
