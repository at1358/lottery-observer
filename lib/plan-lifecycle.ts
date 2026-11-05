import {db,list,stmt,run} from './db';
const stamp=()=>new Date().toISOString();
export async function deletePlan(type:'combination'|'simulation',input:any){
 if(!/^[a-f0-9-]{36}$/.test(input.id||''))throw Error('方案编号无效');const key=type+'Plan:'+input.id,[row]=await list('SELECT value FROM settings WHERE key=?',key),old=row?JSON.parse(row.value):null;
 if(!old||old.deletedAt)throw Error('方案已删除或不存在');if(old.revision!==input.revision)throw Object.assign(Error('方案已修改，请刷新后再删除'),{status:409});
 const batch=crypto.randomUUID(),deleted={...old,revision:crypto.randomUUID(),deletedAt:stamp(),deletedBatch:batch};
 if(type==='combination'){deleted.calculation={...old.calculation,enabled:false};deleted.push={...old.push,enabled:false};}else deleted.schedule={...old.schedule,enabled:false};
 const serialized=JSON.stringify(deleted),results=await db().batch([
  stmt('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,key,row.value),
  stmt('INSERT INTO trash(id,type,name,count,payload,created_at) SELECT ?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',batch,type,old.name,JSON.stringify({id:old.id}),stamp(),key,serialized)
 ]);if(!results[0].meta.changes)throw Object.assign(Error('方案已修改，请刷新后再删除'),{status:409});
 let paused=0;if(type==='combination')for(const row of await list("SELECT key,value FROM settings WHERE key LIKE 'simulationPlan:%' AND json_extract(value,'$.deletedAt') IS NULL")){const p=JSON.parse(row.value);if(p.combinationId!==old.id)continue;const changed=await run('UPDATE settings SET value=? WHERE key=? AND value=?',JSON.stringify({...p,revision:crypto.randomUUID(),schedule:{...p.schedule,enabled:false},dependencyPaused:true}),row.key,row.value);paused+=changed.meta.changes;}
 await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'方案管理','success',`「${old.name}」已移入回收站，保留逐期记录；相关自动任务已停止`,1,stamp());return {batch,paused};
}
export async function restorePlan(entry:any){
 const payload=JSON.parse(entry.payload),key=entry.type+'Plan:'+payload.id,[row]=await list('SELECT value FROM settings WHERE key=?',key),plan=row?JSON.parse(row.value):null;
 if(!plan||plan.deletedBatch!==entry.id)throw Error('方案删除状态已改变，请刷新');const restored={...plan,revision:crypto.randomUUID(),updatedAt:stamp()};delete restored.deletedAt;delete restored.deletedBatch;
 const results=await db().batch([stmt('UPDATE settings SET value=? WHERE key=? AND value=?',JSON.stringify(restored),key,row.value),stmt('UPDATE trash SET restored_at=? WHERE id=? AND restored_at IS NULL AND EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)',stamp(),entry.id,key,JSON.stringify(restored))]);if(!results[0].meta.changes)throw Error('方案已修改，请刷新后恢复');return {restored:true,type:entry.type};
}
