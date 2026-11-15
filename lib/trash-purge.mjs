export const PURGE_CONFIRMATION='彻底删除';
/** @type {Record<string,string>} */
export const PURGE_SCOPES={
 sources:'删除来源及其采集原文、修改历史、网页快照、采集失败记录、专用对照和资料提醒。其他组合、模拟方案及独立历史保留。',
 records:'删除本批次采集原文、修改历史和采集失败记录；仅保留不含正文的防重复采集标记。其他栏目快照和独立计算历史保留。',
 folder:'仅删除已移入回收站的目录及其已删除的子目录，保留采集来源和资料。',
 combination:'删除此组合的配置、计算结果、推送记录和运行状态；关联模拟账本保留，并继续保持暂停。',
 simulation:'删除此模拟方案的配置、账本、历史版本和运行状态。'
};
export function validatePurge(input){
 if(input?.confirmation!==PURGE_CONFIRMATION)throw Error('请输入“彻底删除”确认，此操作无法从回收站恢复');
 if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>500)throw Error('每次请选择1–500项回收站记录');
 if(input.ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)))throw Error('回收站项目编号无效');
 return [...new Set(input.ids)];
}
export const purgedPeriodKey=(sourceId,year,issue)=>`purgedPeriod:${sourceId}:${Number(year)}:${String(Number(issue)).padStart(3,'0')}`;
export function planPurgeKeys(type,id){
 if(!['combination','simulation'].includes(type)||!/^[a-f0-9-]{36}$/.test(id))throw Error('回收站方案信息无效');
 return type==='combination'?{exact:['Plan','Runtime','Lease'].map(s=>'combination'+s+':'+id),prefix:['Result','Attempt','Delivery','FailureDelivery'].map(s=>'combination'+s+':'+id+':')}:{exact:['Plan','Rows','Runtime','Lease'].map(s=>'simulation'+s+':'+id),prefix:['simulationArchive:'+id+':']};
}
