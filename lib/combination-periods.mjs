export function collectedSourceIds(plan){return [...new Set([...(plan.baseMode==='source'?[plan.baseSourceId]:[]),...(plan.steps||[]).filter(s=>s.type==='source').map(s=>s.sourceId)])];}
const issueKey=value=>/^\d{1,3}$/.test(String(value||''))&&+value>=1&&+value<=366?String(+value).padStart(3,'0'):null;
export function selectCombinationHistory(plan,candidates,predictions,sources,failures=[]){
 const all=[...new Set(candidates.map(issueKey).filter(Boolean))].sort(),ids=collectedSourceIds(plan),scoped=plan.historyScope==='collected-common'&&ids.length>0;
 if(!scoped)return {issues:all,scope:{mode:plan.historyScope||'all',active:false,sourceCount:ids.length,excluded:0}};
 const active=new Set(sources.filter(s=>!s.deleted_batch).map(s=>s.id)),blocked=new Set(failures.filter(f=>+f.year===+plan.year&&(!f.status||f.status==='failed')&&!f.deleted_batch).map(f=>f.source_id+':'+issueKey(f.issue))),sets=new Map(ids.map(id=>[id,new Set()]));
 for(const p of predictions){const issue=issueKey(p.issue);if(!issue||p.deleted_batch||+p.year!==+plan.year||!active.has(p.source_id)||!sets.has(p.source_id)||blocked.has(p.source_id+':'+issue))continue;let parsed;try{parsed=typeof p.parsed==='string'?JSON.parse(p.parsed):p.parsed;}catch{continue;}if(parsed?.valid&&parsed.values?.length&&!parsed.warnings?.length)sets.get(p.source_id).add(issue);}
 const issues=all.filter(issue=>ids.every(id=>sets.get(id).has(issue)));
 return {issues,scope:{mode:'collected-common',active:true,sourceCount:ids.length,excluded:all.length-issues.length,eligibleIssues:issues}};
}
