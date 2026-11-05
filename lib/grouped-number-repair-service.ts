import {db,list,stmt} from './db';
import {parsePrediction} from './domain.mjs';
let pending:Promise<void>|null=null;
// Repair only the original incomplete interpretation. Never replace the first
// raw record with today's website, or undo a manual parsing correction.
export async function repairGroupedNumberInterpretations(){
 if(pending)return pending;
 pending=(async()=>{
  const rows=await list("SELECT p.*,s.name FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.deleted_batch IS NULL AND s.deleted_batch IS NULL AND p.kind IN ('号码','15码','24码','36码') AND (p.changed&2)=0 AND json_extract(p.parsed,'$.valid')=0 AND (p.raw LIKE '%主攻%' OR s.name LIKE '%主攻%')");
  for(const row of rows){
   const before=JSON.parse(row.parsed),parsed:any=parsePrediction(row.raw,row.kind,row.name);if(!parsed.valid||!parsed.numberGroups?.length)continue;
   const cleanRules=(rules:any)=>{if(!rules)return null;const definitions=rules.definitions?.filter((d:any)=>!['主','攻'].includes(d.label));return definitions?.length?{...rules,definitions}:null;};
   const rules=cleanRules(before.sourceRules);if(rules)parsed.sourceRules=rules;
   const latestBefore=row.latest_parsed?JSON.parse(row.latest_parsed):null,latestKind=row.latest_kind||row.kind,latestCandidate=parsePrediction(row.latest_raw||row.raw,latestKind,row.name);
   const latestRules=cleanRules(latestBefore?.sourceRules||before.sourceRules),latest=latestCandidate.valid?{...latestCandidate,...latestRules?{sourceRules:latestRules}:{}}:latestBefore;
   const [failure]=await list("SELECT * FROM collection_periods WHERE source_id=? AND year=? AND issue=? AND status='failed' AND deleted_batch IS NULL",row.source_id,row.year,row.issue);
   const corrected=!!failure&&row.first_seen<=failure.deadline_at&&failure.reason.includes('当期资料未通过完整性识别'),at=new Date().toISOString(),reason='系统解析修复：主、攻两组号码在截止前已完整留档，原误判已保留于审计记录';
   const metadata={before,after:parsed,firstSeen:row.first_seen,...corrected?{collectionBefore:failure,collectionAfter:{status:'collected',reason}}:{}};
   const referenceKey='sourceReference:'+row.source_id+':'+row.year,[reference]=await list('SELECT value FROM settings WHERE key=?',referenceKey),profile=reference?JSON.parse(reference.value):null;
   const obsolete=profile?.rules?.definitions?.length&&profile.rules.definitions.every((d:any)=>d.field==='numberAttributes'&&['主','攻'].includes(d.label));
   const commands=[
    stmt("INSERT INTO revisions(id,prediction_id,raw,created_at,change_type,metadata) SELECT ?,?,?,?,'audit',? WHERE EXISTS(SELECT 1 FROM predictions WHERE id=? AND parsed=? AND last_seen=?)",crypto.randomUUID(),row.id,'[系统解析修复：主、攻按各组标注数量识别；保留首次原文和采集时间]',at,JSON.stringify(metadata),row.id,row.parsed,row.last_seen),
    stmt('UPDATE predictions SET parsed=?,latest_parsed=? WHERE id=? AND parsed=? AND last_seen=?',JSON.stringify(parsed),latest?JSON.stringify(latest):row.latest_parsed,row.id,row.parsed,row.last_seen)
   ];
   if(obsolete)commands.push(
    stmt('INSERT OR IGNORE INTO settings(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)','sourceReferenceArchive:'+row.source_id+':'+row.year+':'+crypto.randomUUID(),JSON.stringify({profile,reason:'主、攻为当期推荐分组，不属于年度号码对照',archivedAt:at}),referenceKey,reference.value),
    stmt('DELETE FROM settings WHERE key=? AND value=? AND EXISTS(SELECT 1 FROM predictions WHERE id=? AND parsed=?)',referenceKey,reference.value,row.id,JSON.stringify(parsed))
   );
   if(corrected)commands.push(stmt("UPDATE collection_periods SET status='collected',reason=? WHERE id=? AND status='failed' AND EXISTS(SELECT 1 FROM predictions WHERE id=? AND parsed=?)",reason,failure.id,row.id,JSON.stringify(parsed)));
   await db().batch(commands);
  }
 })().finally(()=>{pending=null;});return pending;
}
