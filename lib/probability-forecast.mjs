import {beijingDate} from './wecom-push.mjs';
import {currentCombinationPeriod} from './combination-periods.mjs';

export const FORECAST_MODEL='beta-binomial-history-v1';
export const FORECAST_MIN_SAMPLES=20;
export const FORECAST_WINDOW=120;
export const forecastKey=(origin,id)=>origin+':'+id;
export const forecastSignature=item=>JSON.stringify([+item.year,item.kind||item.type||'lag-zodiac',item.revision||null]);
const round=n=>Math.round(n*10)/10;
const validIssue=n=>/^\d{1,3}$/.test(String(n))&&+n>=1&&+n<=366;

export function forecastSchedule(runtime={},at=Date.now()){
 const date=beijingDate(at),start=Date.parse(date+'T12:00:00+08:00'),retry=Date.parse(runtime.retryAt);
 const success=Date.parse(runtime.lastSuccessAt),done=runtime.closedDate===date||runtime.lastSuccessDate===date&&Number.isFinite(success)&&success>=start,due=at>=start&&!done&&(!Number.isFinite(retry)||retry<=at);
 const nextRun=done||at<start?new Date(start+(done?86400000:0)).toISOString():new Date(Math.max(start,Number.isFinite(retry)?retry:start)).toISOString();
 return {date,due,nextRun,time:'12:00',timezone:'Asia/Shanghai'};
}
export function forecastTarget(draws,expected={},at=Date.now()){
 const year=+beijingDate(at).slice(0,4),target=currentCombinationPeriod(year,draws,expected,at);
 if(!target.issue)return {...target,ready:false,reason:'开奖管理尚未确认当天待开奖期数'};
 if(target.drawn)return {...target,ready:false,reason:'当期已经开奖，等待次日12:00生成下一期参考'};
 return {...target,ready:true,reason:null};
}
/** Wilson interval describes uncertainty in a historical binomial proportion. */
export function historicalInterval(win,total){
 if(!total)return null;
 const z=1.959963984540054,p=win/total,d=1+z*z/total,center=(p+z*z/(2*total))/d,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
 return [round(Math.max(0,center-half)*100),round(Math.min(1,center+half)*100)];
}
export function estimateProbability(rows,target){
 // Same-year/period deduplication happens before selecting the most recent window.
 // Conflicting duplicates are excluded rather than resolved in favor of a win.
 const groups=new Map();let excluded=0;
 for(const row of rows){
  const status=row.verdict?.status||row.status;
  if(+row.year!==+target.year||!validIssue(row.issue)||+row.issue>=+target.issue||!['win','loss'].includes(status)){excluded++;continue;}
  const key=String(+row.issue);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...row,status});
 }
 const accepted=[];
 for(const group of groups.values()){
  if(new Set(group.map(r=>r.status)).size!==1){excluded+=group.length;continue;}
  accepted.push(group[0]);excluded+=group.length-1;
 }
 const ordered=accepted.sort((a,b)=>+b.issue-+a.issue),sample=ordered.slice(0,FORECAST_WINDOW),n=sample.length,win=sample.filter(r=>r.status==='win').length,loss=n-win;
 const recent=sample.slice(0,30),enough=n>=FORECAST_MIN_SAMPLES,correct=enough?round((win+1)/(n+2)*100):null;
 return {status:enough?'estimated':'insufficient',correct,error:correct===null?null:round(100-correct),samples:n,win,loss,
  interval:enough?historicalInterval(win,n):null,historySamples:sample.filter(r=>r.backtest||r.mode==='history'||r.mode==='unconfirmed').length,
  recent30:{samples:recent.length,win:recent.filter(r=>r.status==='win').length},
  firstIssue:sample.at(-1)?.issue||null,lastIssue:sample[0]?.issue||null,excluded,available:ordered.length,
  reason:enough?'基于最近最多120期已核验资料的平滑历史估计，未证明能预测独立随机开奖':`至少需要${FORECAST_MIN_SAMPLES}期已核验资料，目前${n}期`};
}
export function numericBaseline(kind,values){
 if(!Array.isArray(values)||!values.length||values.some(n=>!Number.isInteger(n)||n<1||n>49)||new Set(values).size!==values.length)return null;
 if(['号码','12码','15码','24码','36码','manual-numbers'].includes(kind))return round(values.length/49*100);
 if(['杀号码','manual-kill','lag-zodiac'].includes(kind))return round((49-values.length)/49*100);
 return null;
}
export function visibleForecast(pack,item,origin,draws=[],at=Date.now()){
 const result=pack?.items?.[forecastKey(origin,item.id)];
 if(!result)return {status:'waiting',reason:'等待每天12:00计算，或手工更新概率参考'};
 if(result.signature!==forecastSignature(item))return {status:'changed',reason:'资料类型或规则已变更，请更新概率参考'};
 if(draws.some(d=>+d.year===+result.target.year&&+d.issue===+result.target.issue))return {...result,status:'closed',reason:'这份预判的目标期已经开奖，等待下一次更新'};
 if(result.target.date!==beijingDate(at))return {...result,status:'stale',reason:'这份预判不是今天的结果，等待12:00更新'};
 return result;
}
