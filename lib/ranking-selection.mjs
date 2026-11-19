export const RANKING_GROUPS=['zodiacs','numbers','thirtySix'];
const keyPattern=/^(collected|custom):[A-Za-z0-9_-]{1,100}$/;
export const rankingRowKey=row=>row.origin+':'+row.id;
export function rankingSelection(value={}){
 return {revision:typeof value?.revision==='string'?value.revision:'',excluded:Object.fromEntries(RANKING_GROUPS.map(group=>[group,[...new Set(Array.isArray(value?.excluded?.[group])?value.excluded[group].filter(key=>typeof key==='string'&&keyPattern.test(key)):[])]]))};
}
// This preference only hides rows from a ranking group. It never changes a
// source, prediction, custom material, calculation plan or its stored results.
export function updateRankingSelection(previous,input,candidates){
 const current=rankingSelection(previous),group=input.group;
 if(!RANKING_GROUPS.includes(group)||!['add','remove'].includes(input.action))throw Error('请选择有效的统计分组和操作');
 if(!Array.isArray(input.keys)||!input.keys.length||input.keys.length>500||input.keys.some(key=>typeof key!=='string'||!keyPattern.test(key)))throw Error('请选择1–500个统计资料栏目');
 if(input.revision!==current.revision)throw Object.assign(Error('统计范围已被修改，请刷新后重试'),{status:409});
 const allowed=new Set(candidates.map(rankingRowKey)),keys=[...new Set(input.keys)];
 if(keys.some(key=>!allowed.has(key)))throw Error('所选资料不属于该年度的统计分组，或已被删除，请刷新后选择');
 const excluded=new Set(current.excluded[group]);let changed=0;
 for(const key of keys){if(input.action==='remove'){if(!excluded.has(key)){excluded.add(key);changed++;}}else if(excluded.delete(key))changed++;}
 if(excluded.size>5000)throw Error('该统计分组的自定义范围超过上限');
 return {selection:{revision:changed?crypto.randomUUID():current.revision,excluded:{...current.excluded,[group]:[...excluded]}},changed};
}
