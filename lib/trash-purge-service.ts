import {db,list,stmt} from './db';
import {PURGE_SCOPES,validatePurge,planPurgeKeys} from './trash-purge.mjs';
const conflict=()=>Object.assign(Error('回收站项目已恢复、已删除或状态发生变化，请刷新后重新选择'),{status:409});
export async function purgeTrash(input:any){
 const ids=validatePurge(input),selection=JSON.stringify(ids),entries=await list('SELECT * FROM trash WHERE restored_at IS NULL AND id IN (SELECT value FROM json_each(?))',selection);
 if(entries.length!==ids.length)throw conflict();if(entries.some(e=>!PURGE_SCOPES[e.type]))throw Error('该回收站类型暂不支持彻底删除');
 const batches=(type:string)=>JSON.stringify(entries.filter(e=>e.type===type).map(e=>e.id)),sourceBatches=batches('sources'),recordBatches=batches('records'),folderBatches=batches('folder');
 const sources=await list('SELECT id FROM sources WHERE deleted_batch IN (SELECT value FROM json_each(?))',sourceBatches),sourceIds=JSON.stringify(sources.map(s=>s.id));
 const [folderCount]=await list('SELECT COUNT(*) AS n FROM folders WHERE deleted_batch IN (SELECT value FROM json_each(?))',folderBatches);
 const dependent=(await list("SELECT DISTINCT deleted_batch AS id FROM predictions WHERE source_id IN (SELECT value FROM json_each(?)) AND deleted_batch IS NOT NULL UNION SELECT DISTINCT deleted_batch AS id FROM collection_periods WHERE source_id IN (SELECT value FROM json_each(?)) AND deleted_batch IS NOT NULL",sourceIds,sourceIds)).filter(e=>!ids.includes(e.id));
 const exact:string[]=[],prefix:string[]=[],plans:any[]=[];
 for(const entry of entries.filter(e=>['combination','simulation'].includes(e.type))){
  const {id}=JSON.parse(entry.payload),keys=planPurgeKeys(entry.type,id),[stored]=await list('SELECT value FROM settings WHERE key=?',entry.type+'Plan:'+id),p=stored?JSON.parse(stored.value):null;
  if(!p?.deletedAt||p.deletedBatch!==entry.id)throw conflict();plans.push({key:entry.type+'Plan:'+id,value:stored.value});exact.push(...keys.exact);prefix.push(...keys.prefix);
 }
 for(const source of sources){exact.push('sourceNavigation:'+source.id);prefix.push('sourceReference:'+source.id+':','purgedPeriod:'+source.id+':');}
 const alerts=await list("SELECT key,value FROM settings WHERE key LIKE 'sourceAlertRule:%' AND json_extract(value,'$.sourceId') IN (SELECT value FROM json_each(?))",sourceIds);
 for(const alert of alerts){const p=JSON.parse(alert.value);exact.push(alert.key,'sourceAlertRuntime:'+p.id);prefix.push('sourceAlertDelivery:'+p.id+':');}
 const token='trashPurgeTransaction:'+crypto.randomUUID(),commands:any[]=[],gate='EXISTS(SELECT 1 FROM settings WHERE key=?)';
 // This private transaction marker is created only if the complete selection
 // still matches. Every mutation is guarded, and the marker is removed in the
 // same atomic batch; a concurrent restore/purge cannot turn this into a partial purge.
 commands.push(stmt("INSERT INTO settings(key,value) SELECT ?,'true' WHERE (SELECT COUNT(*) FROM trash t JOIN json_each(?) e ON t.id=json_extract(e.value,'$.id') WHERE t.restored_at IS NULL AND t.type=json_extract(e.value,'$.type') AND t.payload=json_extract(e.value,'$.payload') AND t.created_at=json_extract(e.value,'$.created_at'))=? AND (SELECT COUNT(*) FROM sources WHERE deleted_batch IN (SELECT value FROM json_each(?)))=? AND (SELECT COUNT(*) FROM folders WHERE deleted_batch IN (SELECT value FROM json_each(?)))=? AND (SELECT COUNT(*) FROM settings s JOIN json_each(?) p ON s.key=json_extract(p.value,'$.key') AND s.value=json_extract(p.value,'$.value'))=?",token,JSON.stringify(entries),entries.length,sourceBatches,sources.length,folderBatches,folderCount.n,JSON.stringify(plans),plans.length));
 const add=(sql:string,...args:any[])=>commands.push(stmt(sql+' AND '+gate,...args,token));
 add("INSERT OR IGNORE INTO settings(key,value) SELECT 'purgedPeriod:'||source_id||':'||year||':'||issue,'true' FROM (SELECT source_id,year,issue FROM predictions WHERE deleted_batch IN (SELECT value FROM json_each(?)) UNION SELECT source_id,year,issue FROM collection_periods WHERE deleted_batch IN (SELECT value FROM json_each(?))) p WHERE source_id NOT IN (SELECT value FROM json_each(?))",recordBatches,recordBatches,sourceIds);
 add('DELETE FROM revisions WHERE prediction_id IN (SELECT id FROM predictions WHERE deleted_batch IN (SELECT value FROM json_each(?)) OR source_id IN (SELECT value FROM json_each(?)))',recordBatches,sourceIds);
 add('DELETE FROM predictions WHERE (deleted_batch IN (SELECT value FROM json_each(?)) OR source_id IN (SELECT value FROM json_each(?)))',recordBatches,sourceIds);
 add('DELETE FROM collection_periods WHERE (deleted_batch IN (SELECT value FROM json_each(?)) OR source_id IN (SELECT value FROM json_each(?)))',recordBatches,sourceIds);
 add('DELETE FROM snapshots WHERE source_id IN (SELECT value FROM json_each(?))',sourceIds);
 add('DELETE FROM jobs WHERE source_id IN (SELECT value FROM json_each(?))',sourceIds);
 add('DELETE FROM settings WHERE (key IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_each(?) p WHERE substr(settings.key,1,length(p.value))=p.value))',JSON.stringify(exact),JSON.stringify(prefix));
 add('DELETE FROM sources WHERE deleted_batch IN (SELECT value FROM json_each(?))',sourceBatches);
 add('UPDATE sources SET folder_id=NULL WHERE folder_id IN (SELECT id FROM folders WHERE deleted_batch IN (SELECT value FROM json_each(?)))',folderBatches);
 add('UPDATE folders SET parent_id=NULL WHERE deleted_batch IS NULL AND parent_id IN (SELECT id FROM folders WHERE deleted_batch IN (SELECT value FROM json_each(?)))',folderBatches);
 add('DELETE FROM folders WHERE deleted_batch IN (SELECT value FROM json_each(?))',folderBatches);
 const dependentIds=JSON.stringify(dependent.map(e=>e.id));
 add("UPDATE trash SET count=(SELECT COUNT(*) FROM (SELECT source_id,year,issue FROM predictions WHERE deleted_batch=trash.id UNION SELECT source_id,year,issue FROM collection_periods WHERE deleted_batch=trash.id)) WHERE type='records' AND restored_at IS NULL AND id IN (SELECT value FROM json_each(?))",dependentIds);
 add("UPDATE trash SET name=count||' 条按期资料' WHERE type='records' AND restored_at IS NULL AND id IN (SELECT value FROM json_each(?))",dependentIds);
 add("DELETE FROM trash WHERE type='records' AND restored_at IS NULL AND count=0 AND id IN (SELECT value FROM json_each(?))",dependentIds);
 const deletionIndex=commands.length;add('DELETE FROM trash WHERE restored_at IS NULL AND id IN (SELECT value FROM json_each(?))',selection);
 add("INSERT INTO jobs(id,name,status,message,count,created_at) SELECT ?,'资料管理','success',?,?,? WHERE 1",crypto.randomUUID(),`已彻底删除 ${entries.length} 项回收站记录：${entries.map(e=>e.name).join('、').slice(0,300)}；所属数据已清理，不能从回收站恢复。`,entries.length,new Date().toISOString());
 commands.push(stmt('DELETE FROM settings WHERE key=?',token));
 const results=await db().batch(commands);if(!results[0].meta.changes||results[deletionIndex].meta.changes!==entries.length)throw conflict();
 return {deleted:entries.length,irreversible:true};
}
