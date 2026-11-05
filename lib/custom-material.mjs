import {ZODIACS} from './number-reference.mjs';
import {periodZodiacResolver} from './period-zodiacs.mjs';
import {parseManualKill,buildManualKill} from './manual-kill.mjs';

export const OPPOSITE_ZODIACS=Object.fromEntries(ZODIACS.map((z,i)=>[z,ZODIACS[(i+6)%12]]));
export const OPPOSITE_PAIRS=[['鼠','马'],['牛','羊'],['虎','猴'],['兔','鸡'],['龙','狗'],['蛇','猪']];
export const issueText=n=>String(Number(n)).padStart(3,'0');
export const calendarPeriods=year=>year%4===0&&(year%100!==0||year%400===0)?366:365;
export const annualPeriods=(year,counts={})=>counts[year]||calendarPeriods(year);

export function validateCustomMaterial(input){
 if(input.type==='manual-kill'){
  const year=Number(input.year),name=String(input.name||'').trim(),declaredCount=Number(input.declaredCount||6),referenceYear=input.referenceYear?Number(input.referenceYear):null;
  if(!Number.isInteger(year)||year<2000||year>2100)throw Error('资料年份应为2000–2100');if(!name||name.length>60)throw Error('栏目名称应为1–60字');if(referenceYear!==null&&(!Number.isInteger(referenceYear)||referenceYear<1900||referenceYear>2100))throw Error('参考年份无效');
  const sourceText=String(input.sourceText||''),layout=input.layout||'before-issue',issueCorrections=input.issueCorrections||[],parsed=parseManualKill(sourceText,{layout,declaredCount,issueCorrections});
  return {type:'manual-kill',name,year,declaredCount,referenceYear,sourceText,layout,issueCorrections,records:parsed.records,importSummary:parsed.summary,unparsed:parsed.unparsed,periodCounts:{}};
 }
 if(input.type&&input.type!=='lag-zodiac')throw Error('自建资料类型无效');
 const year=Number(input.year),lag=Number(input.lag),name=String(input.name||`n−${lag} 冲肖杀肖`).trim();
 if(!Number.isInteger(year)||year<2000||year>2100)throw Error('资料年份应为2000–2100');
 if(!Number.isInteger(lag)||lag<1||lag>366)throw Error('n减多少期应为1–366的整数');
 if(!name||name.length>60)throw Error('栏目名称应为1–60字');
 if(input.periodCounts!==undefined&&(!input.periodCounts||typeof input.periodCounts!=='object'||Array.isArray(input.periodCounts)))throw Error('年度期数配置无效');
 const periodCounts={};
 for(const [key,value] of Object.entries(input.periodCounts||{})){
  if(!/^\d{4}$/.test(key)||+key<year-2||+key>year||![365,366].includes(Number(value)))throw Error('年度总期数只能为365或366，年份须为资料年及前两年');
  periodCounts[key]=Number(value);
 }
 return {name,year,lag,periodCounts};
}
export function shiftPeriod(year,issue,delta,counts={}){
 let value=Number(issue),y=Number(year);
 if(!Number.isInteger(value)||value<1||value>annualPeriods(y,counts)||!Number.isInteger(delta)||Math.abs(delta)>366)throw Error('期数偏移无效');
 value+=delta;
 while(value<=0){y--;value+=annualPeriods(y,counts);}
 while(value>annualPeriods(y,counts)){value-=annualPeriods(y,counts);y++;}
 return {year:y,issue:issueText(value)};
}
export function materialRuleKey(plan){return plan.type==='manual-kill'?JSON.stringify({type:plan.type,year:plan.year,declaredCount:plan.declaredCount}):JSON.stringify({year:plan.year,lag:plan.lag,periodCounts:Object.fromEntries([plan.year-2,plan.year-1,plan.year].map(y=>[y,annualPeriods(y,plan.periodCounts)]))});}
export function customMaterialLabel(plan,stats){return plan.type==='manual-kill'?plan.name+' · 错误'+(stats?.loss||0)+'期':plan.name;}
const validZodiac=z=>ZODIACS.includes(z);
const validDraw=d=>d&&Number.isInteger(d.number)&&d.number>=1&&d.number<=49;
const finiteTime=v=>v&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
export function customMaterialStats(rows){
 const win=rows.filter(r=>r.status==='win').length,loss=rows.filter(r=>r.status==='loss').length,settled=win+loss;
 const lastLoss=rows.filter(r=>r.status==='loss').sort((a,b)=>b.year-a.year||Number(b.issue)-Number(a.issue))[0],latestLoss=lastLoss?{year:lastLoss.year,issue:lastLoss.issue,number:lastLoss.actualNumber,zodiac:lastLoss.actualZodiac||null}:null;
 const modes=Object.fromEntries(['forecast','history','unconfirmed'].map(mode=>{const group=rows.filter(r=>r.mode===mode),w=group.filter(r=>r.status==='win').length,l=group.filter(r=>r.status==='loss').length;return [mode,{win:w,loss:l,settled:w+l,rate:w+l?w/(w+l)*100:null}];}));
 return {total:rows.length,drawn:rows.filter(r=>r.actualNumber).length,latestDrawIssue:issueText(Math.max(0,...rows.filter(r=>r.actualNumber).map(r=>+r.issue))),latestLoss,win,loss,settled,rate:settled?win/settled*100:null,errorRate:settled?loss/settled*100:null,pending:rows.filter(r=>r.status==='pending').length,review:rows.filter(r=>r.status==='review').length,modes};
}
export function buildCustomMaterial(plan,draws,expected=[],reference=null,previous=null,at=new Date().toISOString()){
 if(plan.type==='manual-kill'){const ruleKey=materialRuleKey(plan),rows=buildManualKill({...plan,ruleKey},draws,previous,at);return {ruleKey,rows,stats:customMaterialStats(rows),lastCheckedAt:at};}
 const ruleKey=materialRuleKey(plan),sameRule=previous?.ruleKey===ruleKey,prior=new Map((sameRule?previous.rows:[]).map(r=>[r.issue,r]));
 const count=annualPeriods(plan.year,plan.periodCounts),index=new Map(),targetIssues=new Set();
 for(const draw of draws){const issue=Number(draw.issue);if(validDraw(draw)&&Number.isInteger(issue)&&issue>=1&&issue<=annualPeriods(draw.year,plan.periodCounts))index.set(draw.year+'-'+issueText(issue),draw);}
 for(const draw of index.values()){
  if(draw.year===plan.year)targetIssues.add(Number(draw.issue));
  if(draw.year<plan.year-2||draw.year>plan.year)continue;
  const target=shiftPeriod(draw.year,draw.issue,plan.lag,plan.periodCounts);if(target.year===plan.year)targetIssues.add(Number(target.issue));
 }
 for(const period of expected)if(period.year===plan.year&&Number.isInteger(Number(period.issue))&&+period.issue>=1&&+period.issue<=count)targetIssues.add(+period.issue);
 // Fill missing issues explicitly: a missing draw must never compress the lag.
 const last=targetIssues.size?Math.max(...targetIssues):0;for(let i=1;i<=last;i++)targetIssues.add(i);
 const lastDraw=Math.max(0,...[...index.values()].filter(d=>d.year===plan.year).map(d=>Number(d.issue))),resolveZodiacs=periodZodiacResolver(plan.year,reference,draws,expected);
 const rows=[...targetIssues].sort((a,b)=>b-a).map(n=>{
  const issue=issueText(n),source=shiftPeriod(plan.year,n,-plan.lag,plan.periodCounts),basis=index.get(source.year+'-'+source.issue),actual=index.get(plan.year+'-'+issue),old=prior.get(issue);
  const sourceZodiac=validZodiac(basis?.zodiac)?basis.zodiac:null,killZodiac=sourceZodiac?OPPOSITE_ZODIACS[sourceZodiac]:null;
  const actualZodiac=validZodiac(actual?.zodiac)?actual.zodiac:null,mapping=resolveZodiacs(issue),killNumbers=killZodiac&&mapping?Object.entries(mapping.zodiacs).filter(([,z])=>z===killZodiac).map(([n])=>Number(n)).sort((a,b)=>a-b):[];
  const identity=JSON.stringify([source.year,source.issue,basis?.number||null,sourceZodiac,killZodiac]),unchanged=!!old?.killZodiac&&old.basisKey===identity;
  const generatedAt=killZodiac?(unchanged?old.generatedAt:at):null,wasBacktest=unchanged?old.wasBacktest:!!actual;
  let status,reason;
  if(!basis){status='review';reason=`缺少 ${source.year} 年第 ${source.issue} 期依据开奖，请在开奖管理补采该年历史数据`;}
  else if(!sourceZodiac){status='review';reason=`${source.year} 年第 ${source.issue} 期开奖未提供有效生肖，不用其他年份对照推算`;}
  else if(!actual){status=n<=lastDraw?'review':'pending';reason=n<=lastDraw?'该期历史开奖结果缺失，等待补齐':'等待该期实际开奖';}
  else if(!actualZodiac){status='review';reason='目标期开奖未提供有效生肖，等待补齐';}
  else{status=killZodiac===actualZodiac?'loss':'win';reason=status==='win'?`实际开${actualZodiac}，未开被杀的${killZodiac}`:`实际开${actualZodiac}，命中被杀的${killZodiac}`;}
  const actualTime=finiteTime(actual?.drawn_at),mode=wasBacktest?'history':!actual?'forecast':actualTime&&finiteTime(generatedAt)!==null&&finiteTime(generatedAt)<actualTime?'forecast':actualTime?'history':'unconfirmed';
  const row={year:plan.year,issue,sourceYear:source.year,sourceIssue:source.issue,sourceNumber:basis?.number||null,sourceZodiac,sourceProvenance:basis?.provenance||'',killZodiac,killNumbers,numberNote:killZodiac&&!killNumbers.length?'未配置本期资料适用的完整生肖号码对照；仍按实际开奖生肖核对':mapping?.origin||'',actualNumber:actual?.number||null,actualZodiac,status,reason,mode,generatedAt,wasBacktest,basisKey:identity};
  const content=JSON.stringify(row),changed=!old||JSON.stringify(Object.fromEntries(Object.entries(old).filter(([k])=>!['firstSeen','updatedAt'].includes(k))))!==content;
  return {...row,firstSeen:old?.firstSeen||at,updatedAt:changed?at:old.updatedAt};
 });
 return {ruleKey,rows,stats:customMaterialStats(rows),lastCheckedAt:at};
}
