import {db,list,stmt} from './db';
import {parsePrediction} from './domain.mjs';
let pending:Promise<void>|null=null;
// Reinterpret the original archive, never the site's newly edited recommendation.
export async function repairKingdomInterpretations(){
 if(pending)return pending;
 pending=(async()=>{
  const rows=await list("SELECT p.*,s.name FROM predictions p JOIN sources s ON s.id=p.source_id WHERE p.deleted_batch IS NULL AND s.deleted_batch IS NULL AND p.kind IN ('生肖','杀肖') AND (p.changed&2)=0 AND json_extract(p.parsed,'$.valid')=0 AND (p.raw LIKE '%一国三肖%' OR s.name LIKE '%一国三肖%')");
  for(const row of rows){
   const before=JSON.parse(row.parsed),parsed={...parsePrediction(row.raw,row.kind,row.name),...before.sourceRules?{sourceRules:before.sourceRules}:{}};if(!parsed.valid)continue;
   const latestBefore=row.latest_parsed?JSON.parse(row.latest_parsed):null,latestKind=row.latest_kind||row.kind;
   const latestCandidate=parsePrediction(row.latest_raw||row.raw,latestKind,row.name),latest=latestCandidate.valid?{...latestCandidate,...latestBefore?.sourceRules?{sourceRules:latestBefore.sourceRules}:before.sourceRules?{sourceRules:before.sourceRules}:{}}:latestBefore;
   const [failure]=await list("SELECT * FROM collection_periods WHERE source_id=? AND year=? AND issue=? AND status='failed' AND deleted_batch IS NULL",row.source_id,row.year,row.issue);
   const corrected=!!failure&&row.first_seen<=failure.deadline_at&&failure.reason.includes('当期资料未通过完整性识别'),at=new Date().toISOString();
   const metadata={before,after:parsed,firstSeen:row.first_seen,...corrected?{collectionBefore:failure,collectionAfter:{status:'collected',reason:'系统解析规则修复：原始推荐已在截止前留档，三国各三肖完整，原误判保留于解析修复审计'}}:{}};
   const commands=[
    stmt("INSERT INTO revisions(id,prediction_id,raw,created_at,change_type,metadata) SELECT ?,?,?,?,'audit',? WHERE EXISTS(SELECT 1 FROM predictions WHERE id=? AND parsed=? AND last_seen=?)",crypto.randomUUID(),row.id,'[系统解析修复：一国三肖按吴蜀魏各三肖识别；保留首次原文和采集时间]\n'+JSON.stringify(metadata),at,JSON.stringify(metadata),row.id,row.parsed,row.last_seen),
    stmt('UPDATE predictions SET parsed=?,latest_parsed=? WHERE id=? AND parsed=? AND last_seen=?',JSON.stringify(parsed),latest?JSON.stringify(latest):row.latest_parsed,row.id,row.parsed,row.last_seen)
   ];
   if(corrected)commands.push(stmt("UPDATE collection_periods SET status='collected',reason=? WHERE id=? AND status='failed' AND EXISTS(SELECT 1 FROM predictions WHERE id=? AND parsed=?)",metadata.collectionAfter!.reason,failure.id,row.id,JSON.stringify(parsed)));
   await db().batch(commands);
  }
 })().finally(()=>{pending=null;});return pending;
}
