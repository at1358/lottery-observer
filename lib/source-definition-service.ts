import {list,run} from './db';
import {validateReferenceYear} from './number-reference.mjs';
import {sourceDefinitions} from './source-rules.mjs';
export async function readSourceDefinitions(sourceId:string,yearInput:any){
 const [source]=await list('SELECT id,name,year FROM sources WHERE id=? AND deleted_batch IS NULL',sourceId);if(!source)throw Error('找不到该采集栏目');
 const year=validateReferenceYear(yearInput||source.year),[stored]=await list('SELECT value FROM settings WHERE key=?','sourceReference:'+sourceId+':'+year);
 if(stored)return {profile:JSON.parse(stored.value)};
 if(year!==source.year)return {profile:null};
 const old=await list('SELECT id,raw,parsed,first_seen FROM predictions WHERE source_id=? AND year=? AND deleted_batch IS NULL ORDER BY issue DESC LIMIT 50',sourceId,year);
 for(const row of old){const parsed=JSON.parse(row.parsed),definition=sourceDefinitions(row.raw),rules=parsed.sourceRules?.definitions?.length?parsed.sourceRules:definition.entries.length?{...definition.rules,definitions:definition.entries.map(({index,...entry})=>entry),warnings:definition.warnings}:null;if(rules)return {profile:{sourceId,year,name:source.name,rules,capturedAt:rules.capturedAt||row.first_seen,origin:'首次留档原文'}};}
 return {profile:null};
}
export async function captureDefinitions(source:any,rules:any){
 if(!rules?.definitions?.length&&!rules?.segments)return null;
 const key='sourceReference:'+source.id+':'+source.year;
 const bytes=new TextEncoder().encode(JSON.stringify(rules)),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const [old]=await list('SELECT value FROM settings WHERE key=?',key),before=old?JSON.parse(old.value):null;
 if(before?.version===hash)return before;
 const value={sourceId:source.id,year:source.year,name:source.name,url:source.url,rules,version:hash,capturedAt:new Date().toISOString()};
 await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
 await run('INSERT INTO jobs(id,source_id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),source.id,'来源对照采集','success',`已保存 ${source.name} 的栏目专用对照（${rules.definitions?.length||7} 个分组）；仅使用完整、无重叠的49号码对照`,rules.definitions?.length||7,value.capturedAt);
 return value;
}
export function attachDefinitionMetadata(rules:any,profile:any){return profile?{...rules,capturedAt:profile.capturedAt,version:profile.version}:rules;}
export function enrichDefinition(previous:any,current:any){
 if(!current)return null;
 const fields=['segments','doors','elements','zodiacs','waves','heads','tails','sums','sumParities','parities','halfHeads','numberSeasons','numberAttributes'];
 if(fields.some(field=>previous?.[field]&&current[field]&&JSON.stringify(previous[field])!==JSON.stringify(current[field])))return null;
 if(previous&&fields.every(field=>!current[field]||previous[field]))return null;
 return {...current,...previous,definitions:current.definitions||previous?.definitions,warnings:current.warnings||previous?.warnings};
}
