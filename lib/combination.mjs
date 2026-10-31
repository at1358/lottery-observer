import {KINDS,parsePrediction} from './domain.mjs';
import {numberList,validateReferenceYear} from './number-reference.mjs';
import {numberAttribute} from './number-attributes.mjs';
import {sourceDefinitions} from './source-rules.mjs';
export const ALL_NUMBERS=Array.from({length:49},(_,i)=>i+1);
export const COMBINATION_MANUAL_KINDS=['号码','尾数','头数','生肖','五行','杀段','杀门','单双','半头','波色','合数','合数单双','季节','生肖属性'];
const time=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'');
export function validateCombination(input){
 const name=String(input.name||'').trim(),year=validateReferenceYear(input.year);if(!name||name.length>80)throw Error('组合名称须为1–80字');
 const baseMode=input.baseMode||(input.baseSourceId?'source':(Array.isArray(input.baseNumbers)?input.baseNumbers.length:String(input.baseNumbers||'').trim())?'manual':'all');if(!['all','source','manual'].includes(baseMode))throw Error('请选择基础号码池');
 const base=baseMode==='manual'?numberList(input.baseNumbers||[]):[],baseSourceId=baseMode==='source'?String(input.baseSourceId||''):'';
 if(baseMode==='manual'&&!base.length)throw Error('请填写一组基础号码');if(baseMode==='source'&&(!baseSourceId||baseSourceId.length>100))throw Error('请选择基础号码资料');
 const steps=input.steps;if(!Array.isArray(steps)||steps.length>30||!steps.length&&baseMode==='all')throw Error('请选择基础资料或至少一项排除条件，最多30项');
 const values=steps.map((step,index)=>{
  if(!['source','manual'].includes(step.type)||!['auto','include','exclude'].includes(step.mode))throw Error('第'+(index+1)+'项组合条件无效');
  if(step.type==='source'){if(!step.sourceId||String(step.sourceId).length>100)throw Error('请选择采集栏目');return {type:'source',sourceId:String(step.sourceId),mode:step.mode};}
  if(!COMBINATION_MANUAL_KINDS.includes(step.kind))throw Error('请选择支持的手工条件类型');
  const raw=String(step.values||'').trim();if(raw.length>300)throw Error('手工条件过长');const parsed=manualValues(step.kind,raw);if(!parsed.valid)throw Error('第'+(index+1)+'项：'+parsed.warnings.join('；'));
  return {type:'manual',kind:step.kind,values:raw,mode:step.mode};
 });
 const calc={enabled:input.calculation?.enabled===true,mode:input.calculation?.mode||'daily',time:input.calculation?.time||'19:00',interval:Number(input.calculation?.interval||120)};
 const push={enabled:input.push?.enabled===true,time:input.push?.time||'19:05'};
 const cutoff=input.cutoff||'21:35';if(!time(calc.time)||!time(push.time)||!time(cutoff)||!['daily','interval'].includes(calc.mode)||!Number.isInteger(calc.interval)||calc.interval<5||calc.interval>10080)throw Error('计算或推送时间无效；间隔至少5分钟');
 if(calc.enabled&&calc.mode==='daily'&&calc.time>=cutoff||push.enabled&&push.time>=cutoff)throw Error('自动计算和推送时间须早于开奖前截止时间');
 const targetMode=input.targetMode||'upcoming';if(!['upcoming','fixed','common'].includes(targetMode))throw Error('期数选择方式无效');
 const fixedIssue=String(Number(input.fixedIssue||1)).padStart(3,'0');if(!/^\d{3}$/.test(fixedIssue)||+fixedIssue<1||+fixedIssue>366)throw Error('固定期数应为001–366');
 return {name,year,baseMode,baseSourceId,baseNumbers:base,steps:values,calculation:calc,push,cutoff,targetMode,fixedIssue};
}
export function manualValues(kind,raw){
 if(kind==='号码'){try{const values=numberList(raw);return {values,valid:values.length>0,warnings:values.length?[]:['请填写01–49号码']};}catch(e){return {values:[],valid:false,warnings:[e.message]};}}
 return parsePrediction('001期【'+raw+'】',kind);
}
/** @param {any} plan @param {any} context */
export function computeCombination(plan,context){
 const {year,issue,predictions,sources,rules={},failures=[]}=context;
 if(Number(year)!==plan.year)throw Error('计算年份与组合年份不一致');
 const period=String(Number(issue)).padStart(3,'0');if(!/^\d{3}$/.test(period)||+period<1||+period>366)throw Error('请选择有效的计算期数');
 let remaining=[...(plan.baseNumbers.length?plan.baseNumbers:ALL_NUMBERS)],baseNumbers=[...remaining];const trace=[],errors=[];
 const steps=plan.baseMode==='source'?[{type:'source',sourceId:plan.baseSourceId,mode:'include',role:'base'},...plan.steps]:plan.steps;
 for(let index=0;index<steps.length;index++){
  const step=steps[index],source=step.type==='source'?sources.find(s=>s.id===step.sourceId):null;
  const row=step.type==='source'?predictions.find(p=>p.source_id===step.sourceId&&p.year===year&&p.issue===period):null;
  const label=step.role==='base'?'基础号码 · '+(source?.name||'已删除的采集栏目'):step.type==='manual'?'手工条件 '+(index+1):source?.name||'已删除的采集栏目';
  let error=null,kind=row?.kind||step.kind,parsed;
  if(step.type==='source'){
   if(!source||source.deleted_batch)error='采集栏目已删除或不存在';
   else if(!row||row.deleted_batch)error=`缺少 ${year} 年第 ${period} 期资料，不使用其他期数替代`;
   else if(failures.some(f=>f.source_id===source.id&&f.year===year&&f.issue===period))error='该期已被记录为采集失败';
   else{try{parsed=typeof row.parsed==='string'?JSON.parse(row.parsed):row.parsed;}catch{}if(!parsed?.valid)error=parsed?.warnings?.join('；')||'该期资料解析不完整';
    else if(source.year===undefined||source.year===year){const definition=sourceDefinitions(row.raw||'');if(definition.entries.length)parsed={...parsed,sourceRules:{...definition.rules,definitions:definition.entries.map(({index,...entry})=>entry),warnings:definition.warnings,capturedAt:row.first_seen,origin:'首次采集原文内对照',...parsed.sourceRules}};}
   }
  }else parsed=manualValues(kind,step.values);
  if(!error&&(!parsed?.valid||!KINDS.includes(kind)))error='组合条件无法识别';
  if(!error&&step.role==='base'&&!['号码','15码','24码','36码'].includes(kind))error='基础资料请选择推荐号码类栏目，例如15码、30码或36码';
  const mode=step.mode==='auto'?(kind?.startsWith('杀')?'exclude':'include'):step.mode;
  const before=[...remaining],matched=[],origins=new Set();
  if(!error){for(const n of ALL_NUMBERS){const actual=numberAttribute(kind,n,rules,parsed.sourceRules||{});origins.add(actual.origin);if(actual.value===undefined||actual.value===null){error='缺少完整的'+kind+'号码对照（'+actual.origin+'）';break;}const hit=Array.isArray(actual.value)?parsed.values.some(v=>actual.value.includes(v)):parsed.values.includes(actual.value);if(hit)matched.push(n);}}
  if(error)errors.push(label+'：'+error);else{const match=new Set(matched);remaining=remaining.filter(n=>mode==='include'?match.has(n):!match.has(n));}
  if(step.role==='base')baseNumbers=error?[]:[...remaining];
  trace.push({index:index+1,role:step.role||'condition',label,sourceId:source?.id||null,predictionId:row?.id||null,kind,mode,values:parsed?.values||[],raw:row?.raw||step.values,sourceRules:parsed?.sourceRules||null,firstSeen:row?.first_seen||null,status:error?'blocked':'complete',error,origin:[...origins].join(' / '),matched,before,remaining:[...remaining],removed:before.filter(n=>!remaining.includes(n))});
 }
 return {year,issue:period,status:errors.length?'blocked':'complete',errors,baseMode:plan.baseMode||'all',baseNumbers,numbers:errors.length?[]:remaining,partialNumbers:remaining,trace,total:errors.length?null:remaining.length};
}
export function combinationMessage(plan,result){
 if(result.status!=='complete')throw Error('资料或对照不齐，不能推送不完整结果');
 const pad=n=>String(n).padStart(2,'0');
 return `组合计算结果：${plan.name}\n${result.year} 年第 ${result.issue} 期\n基础号码池 ${result.baseNumbers.length} 个\n剩余候选 ${result.numbers.length} 个：${result.numbers.length?result.numbers.map(pad).join(' '):'无共同剩余号码'}\n`+result.trace.map(t=>`${t.index}. ${t.label}：${t.mode==='exclude'?'排除':'保留'} ${t.values.join('、')}，剩余${t.remaining.length}个`).join('\n')+`\n计算时间：${new Date(result.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}\n按所选资料筛选的候选号码`;
}
