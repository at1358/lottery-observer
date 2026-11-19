// Latest-only plans retain their actual daily snapshots without backfilling old
// periods. Available-period plans reuse the combination report's same-period
// completeness checks; neither mode needs a current draw to produce candidates.
/** @param {any} plan @param {string[]} issues @param {{issue:string}[]} snapshots */
export function quickHistoryIssues(plan,issues,snapshots){
 if(plan.workspace!=='quick'||plan.quickScope==='available')return issues;
 const saved=new Set(snapshots.map(r=>r.issue));
 return issues.filter(issue=>saved.has(issue));
}
export function visibleCombinationPlans(plans,quick=false){
 return plans.filter(p=>(p.workspace==='quick')===quick);
}
