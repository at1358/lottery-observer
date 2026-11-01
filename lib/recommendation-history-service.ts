import {db,list,run,stmt} from './db';
import {evaluate} from './domain.mjs';
import {rulesWithReference} from './number-reference.mjs';
import {interpretation,compareRecommendations,afterDrawStatus} from './recommendation-history.mjs';
const read=(value:any,fallback:any=null)=>{try{return typeof value==='string'?JSON.parse(value):value||fallback;}catch{return fallback;}};
async function context(year:number,issue:string){
 const [draws,settings]=await Promise.all([list('SELECT * FROM draws WHERE year=? AND issue=?',year,issue),list("SELECT key,value FROM settings WHERE key IN ('rules',?)",'numberReference:'+year)]);
 const config=new Map(settings.map(r=>[r.key,read(r.value,{})]));return {draw:draws[0]||null,rules:rulesWithReference(config.get('rules')?.years?.[year]||{},config.get('numberReference:'+year))};
}
function details(row:any,before:any,after:any,kind:string,draw:any,rules:any,at:string,afterDraw:any,reconstructed=false){
 const originalVerdict=evaluate(row,draw,rules),verdict=evaluate({kind,parsed:after},draw,rules);
 return {before:{kind:row.latest_kind||row.kind,parsed:before,values:before?.values||[]},after:{kind,parsed:after,values:after.values},afterDraw,originalVerdict,verdict,draw:draw?{number:draw.number,zodiac:draw.zodiac,element:draw.element,drawn_at:draw.drawn_at,draw_date:draw.draw_date,provenance:draw.provenance}:null,observedAt:at,reconstructed};
}
let legacyWork:Promise<void>|null=null;
export async function ensureRecommendationHistory(){
 if(legacyWork)return legacyWork;
 legacyWork=(async()=>{
  const affected=await list("SELECT DISTINCT p.*,s.name FROM predictions p JOIN sources s ON s.id=p.source_id JOIN revisions r ON r.prediction_id=p.id WHERE r.change_type='legacy'");
  for(const row of affected){
   const revisions=await list('SELECT * FROM revisions WHERE prediction_id=? ORDER BY created_at,rowid',row.id),{draw,rules}=await context(row.year,row.issue);
   let previous=read(row.parsed),kind=row.kind,raw=row.raw,version=0,retroactive=row.retroactive||0,first:any=read(row.first_verdict);const commands=[];
   for(const revision of revisions){
    let type='audit',metadata:any=null,revisionVersion:any=null;
    if(!revision.raw.startsWith('[')){
     const saved=revision.change_type==='prediction'?read(revision.metadata):null,nextKind=saved?.after?.kind||row.kind,parsed=saved?.after?.parsed||interpretation(revision.raw,nextKind,row.name,previous?.sourceRules),comparison=compareRecommendations(previous,parsed,kind,nextKind);
     if(comparison.changed||saved){
      const afterDraw=afterDrawStatus(draw,revision.created_at),info=details({...row,latest_kind:kind},previous,parsed,row.kind,draw,rules,revision.created_at,afterDraw,true);
      type='prediction';metadata=saved||info;revisionVersion=++version;if(metadata.afterDraw===true){retroactive=1;first ||= {verdict:metadata.originalVerdict,draw:metadata.draw,observedAt:revision.created_at,reconstructed:true};}
     }else type=comparison.comparable?'annotation':'unparsed';
     if(parsed.valid){previous=parsed;kind=nextKind;}raw=revision.raw;
    }
    commands.push(stmt('UPDATE revisions SET change_type=?,metadata=?,version=? WHERE id=?',type,metadata?JSON.stringify(metadata):null,revisionVersion,revision.id));
   }
   commands.push(stmt('UPDATE predictions SET latest_raw=?,latest_parsed=?,latest_kind=?,latest_version=?,retroactive=?,first_verdict=?,changed=(changed&~1)|? WHERE id=?',raw,JSON.stringify(previous),kind,version,retroactive,first?JSON.stringify(first):null,version?1:0,row.id));
   await db().batch(commands);
  }
 })().finally(()=>{legacyWork=null;});return legacyWork;
}
export async function recordRecommendationObservation(predictionId:string,raw:string,kind:string,parsed:any,at:string){
 for(let attempt=0;attempt<4;attempt++){
  const [row]=await list('SELECT * FROM predictions WHERE id=?',predictionId);if(!row||row.last_seen>at)return {changed:false};
  const before=read(row.latest_parsed)||read(row.parsed),beforeKind=row.latest_kind||row.kind,comparison=compareRecommendations(before,parsed,beforeKind,kind),version=row.latest_version||0;
  if(!comparison.changed){
   const result=await run('UPDATE predictions SET latest_raw=?,latest_parsed=?,latest_kind=?,last_seen=? WHERE id=? AND latest_version=? AND last_seen<=?',raw,JSON.stringify(parsed.valid?parsed:before),parsed.valid?kind:beforeKind,at,row.id,version,at);
   if(result.meta.changes)return {changed:false};continue;
  }
  const {draw,rules}=await context(row.year,row.issue),afterDraw=afterDrawStatus(draw,at,true),info=details({...row,latest_kind:beforeKind},before,parsed,kind,draw,rules,at,afterDraw),first=afterDraw===true?JSON.stringify({verdict:info.originalVerdict,draw:info.draw,observedAt:at,reconstructed:false}):null;
  const results:any[]=await db().batch([
   stmt("INSERT INTO revisions(id,prediction_id,raw,created_at,change_type,metadata,version) SELECT ?,?,?,?,'prediction',?,? FROM predictions WHERE id=? AND latest_version=? AND last_seen<=?",crypto.randomUUID(),row.id,raw,at,JSON.stringify(info),version+1,row.id,version,at),
   stmt('UPDATE predictions SET latest_raw=?,latest_parsed=?,latest_kind=?,latest_version=latest_version+1,changed=changed|1,retroactive=MAX(retroactive,?),first_verdict=COALESCE(first_verdict,?),last_seen=? WHERE id=? AND latest_version=? AND last_seen<=?',raw,JSON.stringify(parsed),kind,afterDraw===true?1:0,first,at,row.id,version,at)
  ]);
  if(results[1].meta.changes)return {changed:true,afterDraw,version:version+1};
 }
 throw Error('资料版本正在被其他采集任务更新，请稍后重试');
}
export async function resolveRevisionVerdicts(year:number,issues?:string[]){
 const records=await list(`SELECT p.*,r.id AS revision_id,r.metadata,r.created_at FROM revisions r JOIN predictions p ON p.id=r.prediction_id WHERE r.change_type='prediction' AND p.year=?${issues?.length?` AND p.issue IN (${issues.map(()=>'?').join(',')})`:''} AND (json_extract(r.metadata,'$.draw') IS NULL OR json_extract(r.metadata,'$.afterDraw') IS NULL) ORDER BY r.created_at,r.rowid`,year,...(issues||[]));
 for(const row of records){const {draw,rules}=await context(row.year,row.issue);if(!draw)continue;const info=read(row.metadata),afterDraw=afterDrawStatus(draw,row.created_at),updated={...details({...row,latest_kind:info.before.kind},info.before.parsed,info.after.parsed,info.after.kind,draw,rules,row.created_at,afterDraw,true),resolvedAt:new Date().toISOString()};
  await db().batch([stmt('UPDATE revisions SET metadata=? WHERE id=?',JSON.stringify(updated),row.revision_id),stmt('UPDATE predictions SET retroactive=MAX(retroactive,?),first_verdict=COALESCE(first_verdict,?) WHERE id=?',afterDraw===true?1:0,afterDraw===true?JSON.stringify({verdict:updated.originalVerdict,draw:updated.draw,observedAt:row.created_at,reconstructed:true}):null,row.id)]);
 }
}
