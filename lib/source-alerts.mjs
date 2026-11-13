import {normalize,evaluate} from './domain.mjs';
import {baseKind} from './number-attributes.mjs';
import {beijingDate,drawDay,knownDrawDate} from './wecom-push.mjs';
import {nextScheduledRun} from './schedule.mjs';
import {effectivePrediction} from './complete-prediction.mjs';
const pad=value=>String(Number(value)).padStart(3,'0');
const read=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
const key=(year,issue)=>Number(year)+':'+pad(issue);
export function alertTerms(value,kind,mode='parsed'){
 const text=normalize(value||'').trim();if(!text||text.length>160)throw Error('请填写160字以内的触发内容');
 const terms=[...new Set(text.split(/[\s、,，;；|/]+/).filter(Boolean))];if(terms.length>20)throw Error('一次最多配置20个触发内容');if(mode==='text')return terms;
 const category=baseKind(kind);
 return [...new Set(terms.map(term=>{
  if(category==='五行'){const v=term.replace(/行$/,'');if(/^[金木水火土]$/.test(v))return v;}
  else if(category==='生肖'){const v=term.replace(/肖$/,'');if(/^[鼠牛虎兔龙蛇马羊猴鸡狗猪]$/.test(v))return v;}
  else if(category==='波色'){const v=term.replace(/(?:波色|波)$/,'');if(/^[红蓝绿]$/.test(v))return v+'波';}
  else if(['单双','季节','合数单双','半头'].includes(category)){const v=term.replace(/季$/,'');if(category==='单双'&&/^[单双]$/.test(v)||category==='季节'&&/^[春夏秋冬]$/.test(v)||category==='合数单双'&&/^合数[单双]$/.test(v)||category==='半头'&&/^[0-4]头[单双]$/.test(v))return v;}
  else if(['号码','尾数','头数','段','门','合数'].includes(category)){
   let v=term.replace(/^(?:第|合数)/,'').replace(/(?:码|尾|头|段|门)$/,'');const cn={零:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};if(v in cn)v=String(cn[v]);
   const [min,max]=category==='号码'?[1,49]:category==='尾数'?[0,9]:category==='头数'?[0,4]:category==='段'?[1,7]:category==='门'?[1,5]:[1,13];if(/^\d{1,2}$/.test(v)&&+v>=min&&+v<=max)return String(+v);
  }else if(category==='生肖属性'&&term.length<=20)return term;
  throw Error(`「${term}」不符合${kind}的识别内容，请核对或改用原文关键词`);
 }))];
}
export function validateSourceAlert(input,source){
 if(!source||source.deleted_batch)throw Error('请选择仍在使用的采集来源');
 const name=String(input.name||'').trim(),message=String(input.message||'').trim(),trigger=input.trigger||'previous_win',timing=input.timing||'collected',matchMode=input.matchMode||'parsed',matchLogic=input.matchLogic||'any',values=String(input.values||'').trim(),cutoff=String(input.cutoff||'21:35'),sendMode=input.sendMode||'immediate',sendTime=String(input.sendTime||'10:30');
 if(!name||name.length>80)throw Error('提醒名称应为1–80字');if(!message||message.length>300)throw Error('自定义提示应为1–300字');
 if(!['previous_win','content'].includes(trigger)||!['collected','after_draw'].includes(timing)||!['parsed','text'].includes(matchMode)||!['any','all'].includes(matchLogic)||typeof input.enabled!=='boolean')throw Error('提醒条件或启用状态无效');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff))throw Error('请选择有效的当期提醒截止时间');if(trigger==='content')alertTerms(values,source.kind,matchMode);
 if(!['immediate','daily'].includes(sendMode)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime))throw Error('请选择有效的推送方式和每天推送时间');
 if(sendMode==='daily'&&sendTime>=cutoff&&!(trigger==='previous_win'&&timing==='after_draw'))throw Error('每天开始推送时间必须早于截止时间；开始时间和截止时间请分别设置');
 return {name,sourceId:source.id,sourceName:source.name,trigger,timing:trigger==='content'?'collected':timing,matchMode,matchLogic,values:trigger==='content'?values:'',message,cutoff,enabled:input.enabled,sendMode,sendTime};
}
export function sourceAlertSchedule(rule,at=Date.now(),manual=false){
 const mode=rule.sendMode||'immediate';if(manual||mode==='immediate')return {mode,due:true,nextStart:null,reason:''};
 const changed=Date.parse(rule.scheduleChangedAt||rule.createdAt||'');if(mode!=='daily'||!Number.isFinite(changed)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.sendTime||''))return {mode,due:false,nextStart:null,reason:'定时配置不完整，请编辑并重新保存规则'};
 const first=Date.parse(nextScheduledRun({mode:'daily',time:rule.sendTime,interval:60},changed)),today=Date.parse(beijingDate(at)+'T'+rule.sendTime+':00+08:00'),next=Math.max(first,today);
 if(at<next)return {mode,due:false,nextStart:new Date(next).toISOString(),reason:'等待定时推送：北京时间 '+new Date(next+8*3600000).toISOString().slice(0,16).replace('T',' ')};
 return {mode,due:true,nextStart:null,reason:''};
}
function adjacentPeriod(context,source,today,tomorrow,afterDraw,closed,at){
 const recent=context.draws.map(draw=>({draw,date:drawDay(knownDrawDate(draw,context.expected))})).filter(item=>[today,beijingDate(at-86400000)].includes(item.date)&&Number(item.date?.slice(0,4))===+item.draw.year&&(!item.draw.drawn_at||Date.parse(item.draw.drawn_at)<=at)).sort((a,b)=>b.date.localeCompare(a.date)||+b.draw.issue-+a.draw.issue)[0];
 if(!recent)return null;const date=new Date(Date.parse(recent.date+'T12:00:00+08:00')+86400000).toISOString().slice(0,10),year=Number(date.slice(0,4)),issue=year===+recent.draw.year?+recent.draw.issue+1:1;
 if(year!==+source.year||!(date===today||afterDraw&&date===tomorrow)||issue<1||issue>366||closed.has(key(year,issue)))return null;
 return {year,issue:pad(issue),date,basis:'依据最近一期实际开奖日期和相邻期数确认'};
}
function clip(text,max=1800){let out='',size=0;for(const char of String(text)){const n=new TextEncoder().encode(char).length;if(size+n>max-6)return out+'…';out+=char;size+=n;}return out;}
export function sourceAlertMessage(rule,source,result){
 const period=result.period,previous=result.previous;const lines=['资料特别提醒：'+rule.name,'来源：'+source.name,period?`${period.year} 年第 ${period.issue} 期`:'当前期数待确认',rule.message];
 if(previous)lines.push(`上一期：${previous.year} 年第 ${previous.issue} 期 · 系统核验${previous.status==='win'?'正确':previous.status==='loss'?'错误':'未完成'}`);
 if(rule.trigger==='content')lines.push(`触发条件：${rule.matchMode==='text'?'原文关键词':'识别内容'} ${rule.values}`);
 if(result.raw)lines.push('当期资料：\n'+clip(result.raw,700));else if(rule.timing==='after_draw')lines.push('本期尚未采集资料；本提醒依据上一期实际开奖核验结果。');
 return clip(lines.join('\n'));
}
/** @returns {{eligible:boolean,reason:string,period:{year:number,issue:string,date:string,basis?:string}|null,previous:{year:number,issue:string,status:string}|null,raw:string,observed:Array<string|number>,content:string}} */
export function evaluateSourceAlert(rule,context,at=Date.now()){
 const source=context.sources.find(s=>s.id===rule.sourceId&&!s.deleted_batch),result={eligible:false,reason:'',period:null,previous:null,raw:'',observed:[]};
 const finish=(reason,eligible=false)=>({...result,eligible,reason,content:source?sourceAlertMessage(rule,source,result):''});
 if(!source)return finish('来源已删除或不存在');if(rule.deletedAt)return finish('提醒规则已删除');
 const today=beijingDate(at),tomorrow=beijingDate(at+86400000),time=new Date(at+8*3600000).toISOString().slice(11,16),closed=new Set(context.draws.map(d=>key(d.year,d.issue))),afterDraw=rule.trigger==='previous_win'&&rule.timing==='after_draw';
 const periods=Object.values(context.expected||{}).filter(p=>+p.year===+source.year&&/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')&&Number(p.date.slice(0,4))===+p.year&&Number.isFinite(Date.parse(p.date))&&new Date(p.date).toISOString().slice(0,10)===p.date&&/^\d{1,3}$/.test(String(p.issue))&&+p.issue>=1&&+p.issue<=366&&(p.date===today||afterDraw&&p.date===tomorrow)&&!closed.has(key(p.year,p.issue))).sort((a,b)=>a.date.localeCompare(b.date)||+a.issue-+b.issue);
 const target=periods[0]||adjacentPeriod(context,source,today,tomorrow,afterDraw,closed,at);if(!target)return finish('等待最近实际开奖或当前期数依据，不推送历史资料');result.period={year:+target.year,issue:pad(target.issue),date:target.date,...target.basis?{basis:target.basis}:{}};
 if(target.date===today&&time>=rule.cutoff)return finish('已到本期提醒截止时间');
 const failure=(year,issue)=>context.failures?.some(f=>f.source_id===source.id&&+f.year===+year&&pad(f.issue)===pad(issue)&&!f.deleted_batch&&(!f.status||f.status==='failed'));
 const prediction=(year,issue)=>effectivePrediction(context.predictions.find(p=>p.source_id===source.id&&+p.year===+year&&pad(p.issue)===pad(issue)&&!p.deleted_batch));
 const current=prediction(target.year,target.issue),parsed=read(current?.parsed);
 if(current&&parsed?.valid&&!parsed.warnings?.length&&!failure(target.year,target.issue)){result.raw=current.raw;result.observed=parsed.values||[];}
 if(!afterDraw&&!result.raw)return finish(failure(target.year,target.issue)?'本期资料采集失败，不触发提醒':'等待本期完整资料采集成功');
 if(rule.trigger==='content'){
  let terms;try{terms=alertTerms(rule.values,current.kind||source.kind,rule.matchMode);}catch(error){return finish(error.message);}
  const raw=normalize(result.raw),observed=result.observed.map(String),matches=terms.map(term=>rule.matchMode==='text'?raw.includes(term):observed.includes(term));
  const matched=rule.matchLogic==='all'?matches.every(Boolean):matches.some(Boolean);return finish(matched?'本期资料符合提醒条件':rule.matchMode==='parsed'?`本期识别内容为「${observed.join('、')}」，未满足「${rule.values}」`:`本期原文未满足关键词「${rule.values}」`,matched);
 }
 let previousYear=+target.year,previousIssue=+target.issue-1;
 if(previousIssue===0){previousYear--;const last=context.draws.filter(d=>+d.year===previousYear).sort((a,b)=>+b.issue-+a.issue)[0];if(!last||drawDay(knownDrawDate(last,context.expected))!==previousYear+'-12-31')return finish('缺少上一年末的完整开奖依据');previousIssue=+last.issue;}
 const draw=context.draws.find(d=>+d.year===previousYear&&+d.issue===previousIssue),previous=prediction(previousYear,previousIssue),drawDate=draw?drawDay(knownDrawDate(draw,context.expected)):null;
 if(!draw||draw.drawn_at&&Date.parse(draw.drawn_at)>at||!previous||failure(previousYear,previousIssue))return finish('上一期资料或实际开奖尚未完成核验');
 if(![today,beijingDate(at-86400000)].includes(drawDate))return finish('上一期开奖日期不属于最近两天，不发送旧期提醒');
 const verdict=evaluate(previous,draw,context.rules?.[previousYear]||{});result.previous={year:previousYear,issue:pad(previousIssue),status:verdict.status};
 return finish(verdict.status==='win'?'上一期经实际开奖核验正确':'上一期未核验为正确，不触发提醒',verdict.status==='win');
}
