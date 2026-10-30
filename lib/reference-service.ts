import {list,run} from './db';
import {emptyReference,validateReference,validateReferenceYear,referenceCoverage} from './number-reference.mjs';
const key=(year:number)=>'numberReference:'+year;
export async function readNumberReference(value:any){
 const year=validateReferenceYear(value),rows=await list('SELECT value FROM settings WHERE key=?',key(year));
 const profile=rows[0]?JSON.parse(rows[0].value):emptyReference(year);
 const years=(await list("SELECT key FROM settings WHERE key LIKE 'numberReference:%'")).map(r=>Number(r.key.split(':')[1])).filter(Number.isInteger).sort((a,b)=>b-a);
 return {profile:{...profile,revision:profile.revision||profile.updatedAt||null},years,coverage:referenceCoverage(profile)};
}
export async function saveNumberReference(input:any){
 const profile=validateReference(input),[existing]=await list('SELECT value FROM settings WHERE key=?',key(profile.year));
 const before=existing?JSON.parse(existing.value):null;
 if((before?.revision||before?.updatedAt||null)!==profile.revision)throw Object.assign(Error('这份对照表已被其他操作更新，请重新载入后再保存'),{status:409});
 const updatedAt=new Date().toISOString();
 const value=JSON.stringify({...profile,revision:crypto.randomUUID(),updatedAt,collectedAt:input.collectedAt&&Number.isFinite(Date.parse(input.collectedAt))?new Date(input.collectedAt).toISOString():null});
 const result=existing?await run('UPDATE settings SET value=? WHERE key=? AND value=?',value,key(profile.year),existing.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key(profile.year),value);
 if(!result.meta.changes)throw Object.assign(Error('这份对照表已被其他操作更新，请重新载入后再保存'),{status:409});
 await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'号码对照','success',`${profile.year} 年号码对照已保存${profile.enabled?'并用于核验':'；未启用核验'}；来源：${profile.contentUrl||profile.url||'手动添加'}`,referenceCoverage(profile).zodiacs.count,updatedAt);
 return readNumberReference(profile.year);
}
