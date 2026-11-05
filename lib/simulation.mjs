import {numberList,validateReferenceYear} from './number-reference.mjs';
import {validateSchedule} from './schedule.mjs';

export function decimalUnits(value,{signed=false,max=1000000000,min=0,label='金额'}={}){
 const text=String(value??'').trim();if(!(signed?/^-?\d+(?:\.\d{1,2})?$/:/^\d+(?:\.\d{1,2})?$/).test(text))throw Error(label+'须为最多两位小数的数字');
 const negative=text.startsWith('-'),[whole,fraction='']=text.replace(/^-/,'').split('.'),units=(Number(whole)*100+Number(fraction.padEnd(2,'0')))*(negative?-1:1);
 if(!Number.isSafeInteger(units)||units<min*100||units>max*100)throw Error(label+'超出允许范围');return units;
}
export const decimalText=units=>(units/100).toFixed(2);
const issueText=value=>String(Number(value)).padStart(3,'0');
export function validateSimulation(input){
 const name=String(input.name||'').trim(),combinationId=String(input.combinationId||''),year=validateReferenceYear(input.year);
 if(!name||name.length>80)throw Error('模拟名称须为1–80字');if(!/^[a-f0-9-]{36}$/.test(combinationId))throw Error('请选择组合计算方案');
 const initialCapitalCents=decimalUnits(input.initialCapital,{signed:true,min:-1000000000,label:'初始本金'}),stakeCents=decimalUnits(input.stakePerNumber,{min:.01,max:1000000,label:'每号模拟金额'}),oddsHundredths=decimalUnits(input.odds,{min:1,max:10000,label:'返还倍数'}),selectionMode=input.selectionMode||'all';
 if(!['all','pool'].includes(selectionMode))throw Error('请选择号码使用方式');const selectedNumbers=selectionMode==='pool'?numberList(input.selectedNumbers||[]):[];if(selectionMode==='pool'&&!selectedNumbers.length)throw Error('请至少选择一个号码');
 const overrides={};if(input.overrides!==undefined&&(!input.overrides||typeof input.overrides!=='object'||Array.isArray(input.overrides)))throw Error('逐期选号配置无效');
 if(Object.keys(input.overrides||{}).length>366)throw Error('逐期选号最多366期');
 for(const [key,value] of Object.entries(input.overrides||{})){if(!/^\d{1,3}$/.test(key)||+key<1||+key>366||overrides[issueText(key)])throw Error('逐期选号期号无效或重复');overrides[issueText(key)]=numberList(value);}
 const schedule=validateSchedule({...input.schedule,mode:'daily',time:input.schedule?.time||'21:50',enabled:input.schedule?.enabled===true,interval:60});
 return {name,combinationId,year,initialCapital:decimalText(initialCapitalCents),stakePerNumber:decimalText(stakeCents),odds:decimalText(oddsHundredths),initialCapitalCents,stakeCents,oddsHundredths,selectionMode,selectedNumbers,overrides,schedule};
}
export function simulationRuleKey(plan,combinationRule){return JSON.stringify([plan.year,plan.combinationId,combinationRule,plan.initialCapitalCents,plan.stakeCents,plan.oddsHundredths,plan.selectionMode,plan.selectedNumbers,Object.entries(plan.overrides||{}).sort(([a],[b])=>+a-+b)]);}
export function buildSimulationLedger(plan,report,draws,{combinationRule='',previous=null,at=new Date().toISOString()}={}){
 const ruleKey=simulationRuleKey(plan,combinationRule),same=previous?.ruleKey===ruleKey,prior=new Map((same?previous.rows:[]).map(row=>[row.issue,row])),drawIndex=new Map(draws.filter(d=>d.year===plan.year).map(d=>[issueText(d.issue),d])),periodIndex=new Map();
 for(const period of report.periods||[]){if(period.year!==plan.year)continue;const issue=issueText(period.issue);if(periodIndex.has(issue))throw Error('组合结果含重复期数，已停止模拟');periodIndex.set(issue,period);}
 const drawMax=Math.max(0,...[...drawIndex.keys()].map(Number)),cap=drawMax?Math.min(366,drawMax+1):366,last=Math.max(drawMax,0,...[...periodIndex.keys()].map(Number).filter(n=>n<=cap));
 let balance=plan.initialCapitalCents;const rows=[];
 for(let n=1;n<=last;n++){
  const issue=issueText(n),period=periodIndex.get(issue),draw=drawIndex.get(issue),old=prior.get(issue);let status='blocked',reason='',numbers=[],sourceNumbers=[],hit=null,stake=0,returned=0,profit=0;
  if(!period||period.status!=='complete')reason=period?.errors?.join('；')||'缺少本期完整组合结果，不计模拟盈亏';
  else{
   try{if(!Array.isArray(period.numbers))throw Error('本期组合号码不完整');sourceNumbers=numberList(period.numbers);numbers=Object.hasOwn(plan.overrides||{},issue)?plan.overrides[issue]:plan.selectionMode==='pool'?sourceNumbers.filter(number=>plan.selectedNumbers.includes(number)):[...sourceNumbers];if(numbers.some(number=>!sourceNumbers.includes(number)))throw Error('本期手工选号含组合结果之外的号码，请重新选择');
    if(!numbers.length){status='skipped';reason='本期没有选中号码，不计模拟盈亏';}
    else if(!draw||!Number.isInteger(draw.number)||draw.number<1||draw.number>49){status='pending';reason='等待本期实际开奖，暂不计入资金';}
    else{status='settled';hit=numbers.includes(draw.number);stake=numbers.length*plan.stakeCents;returned=hit?Math.floor((plan.stakeCents*plan.oddsHundredths+50)/100):0;profit=returned-stake;reason=hit?'命中：按每号金额×返还倍数计入返还':'未命中：扣除本期全部模拟投入';}
   }catch(error){reason=error.message;status='blocked';numbers=[];}
  }
  const before=balance;balance+=profit;if(!Number.isSafeInteger(balance))throw Error('模拟金额超出安全计算范围');
  const basisKey=JSON.stringify([period?.id||null,period?.algorithmHash||combinationRule,sourceNumbers,numbers,draw?.number||null,status,plan.stakeCents,plan.oddsHundredths]),unchanged=old?.basisKey===basisKey;
  rows.push({year:plan.year,issue,status,reason,sourceNumbers,numbers,hit,outcome:status==='settled'?(profit>0?'profit':profit<0?'loss':'even'):null,plannedStakeCents:numbers.length*plan.stakeCents,stakeCents:stake,returnCents:returned,profitCents:profit,balanceBeforeCents:before,balanceCents:balance,actualNumber:draw?.number||null,actualZodiac:draw?.zodiac||null,evidenceMode:period?.settlement?.mode||'history',sourceResultId:period?.id||null,sourceCreatedAt:period?.createdAt||null,basisKey,firstSeen:old?.firstSeen||at,updatedAt:unchanged?old.updatedAt:at,manualSelection:Object.hasOwn(plan.overrides||{},issue)});
 }
 const settled=rows.filter(row=>row.status==='settled'),totalStakeCents=settled.reduce((sum,row)=>sum+row.stakeCents,0),totalReturnCents=settled.reduce((sum,row)=>sum+row.returnCents,0),hit=settled.filter(row=>row.hit).length;
 const stats={total:rows.length,settled:settled.length,hit,miss:settled.length-hit,profitable:settled.filter(row=>row.profitCents>0).length,losing:settled.filter(row=>row.profitCents<0).length,even:settled.filter(row=>row.profitCents===0).length,pending:rows.filter(row=>row.status==='pending').length,blocked:rows.filter(row=>row.status==='blocked').length,skipped:rows.filter(row=>row.status==='skipped').length,initialCapitalCents:plan.initialCapitalCents,totalStakeCents,totalReturnCents,profitCents:balance-plan.initialCapitalCents,balanceCents:balance,hitRate:settled.length?hit/settled.length:null,minimumBalanceCents:Math.min(plan.initialCapitalCents,...rows.map(row=>row.balanceCents)),historical:settled.filter(row=>row.evidenceMode!=='forecast').length,forecast:settled.filter(row=>row.evidenceMode==='forecast').length};
 return {ruleKey,rows,stats,lastCheckedAt:at,latestDrawIssue:drawMax?issueText(drawMax):null};
}
