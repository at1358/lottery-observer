import {beijingDate,drawDay,knownDrawDate} from './wecom-push.mjs';
// Pending announcements may arrive late. Confirm only the immediate successor
// of yesterday's dated actual draw; never date an arbitrary collected issue.
export function currentCombinationPeriod(year,draws,expected={},at=Date.now()){
 const today=beijingDate(at),unknown={year:+year,issue:null,date:today,drawn:false};if(+year!==+today.slice(0,4))return unknown;
 const rows=draws.filter(d=>+d.year===+year),closed=new Set(rows.map(d=>String(+d.issue).padStart(3,'0'))),period=issue=>({year:+year,issue:String(+issue).padStart(3,'0'),date:today,drawn:closed.has(String(+issue).padStart(3,'0'))});
 const announced=Object.values(expected).filter(p=>+p.year===+year&&p.date===today&&/^\d{1,3}$/.test(String(p.issue))&&+p.issue>=1&&+p.issue<=366).sort((a,b)=>Number(closed.has(String(+a.issue).padStart(3,'0')))-Number(closed.has(String(+b.issue).padStart(3,'0')))||+a.issue-+b.issue);
 if(announced[0])return period(announced[0].issue);
 const dated=draws.map(d=>({draw:d,date:drawDay(knownDrawDate(d,expected))})).filter(r=>r.date&&Number(r.date.slice(0,4))===+r.draw.year&&(!r.draw.drawn_at||Date.parse(r.draw.drawn_at)<=at)),actual=dated.filter(r=>+r.draw.year===+year&&r.date===today).sort((a,b)=>+b.draw.issue-+a.draw.issue)[0];
 if(actual)return period(actual.draw.issue);
 const previous=dated.filter(r=>r.date===beijingDate(at-86400000)&&/^\d{1,3}$/.test(String(r.draw.issue))&&+r.draw.issue>=1&&+r.draw.issue<=366).sort((a,b)=>+b.draw.issue-+a.draw.issue)[0];
 if(previous){const issue=+previous.draw.year===+year?+previous.draw.issue+1:+previous.draw.year===+year-1&&today===year+'-01-01'?1:0;if(issue>=1&&issue<=366&&!closed.has(String(issue).padStart(3,'0')))return {...period(issue),basis:'依据上期实际开奖日期确认当期待开奖期数'};}
 return unknown;
}
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
