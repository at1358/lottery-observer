import {numberList,validateReferenceYear} from './number-reference.mjs';
import {decimalUnits,decimalText} from './simulation.mjs';

export function validateCostSettings(input){
 const initialCapitalCents=decimalUnits(input.initialCapital,{label:'初始本金'});
 const legacy=input.defaultStakePerNumber===undefined?{}:{defaultStakeCents:decimalUnits(input.defaultStakePerNumber,{min:.01,max:1000000,label:'默认每号金额'})};
 const defaultOddsHundredths=decimalUnits(input.defaultOdds,{min:1,max:10000,label:'默认返还倍数'});
 return {initialCapital:decimalText(initialCapitalCents),defaultOdds:decimalText(defaultOddsHundredths),initialCapitalCents,defaultOddsHundredths,...(legacy.defaultStakeCents===undefined?{}:{...legacy,defaultStakePerNumber:decimalText(legacy.defaultStakeCents)})};
}
export function emptyCostLedger(){return {...validateCostSettings({initialCapital:'2000',defaultOdds:'47'}),revision:null,entries:[]};}
export function costEntryText(entry){
 return entry.stakeMode==='grouped'?entry.rawText:entry.numbers.map(n=>String(n).padStart(2,'0')).join(' ')+'各'+entry.stakePerNumber;
}
export function parseCostNumbers(input){
 try{return numberList(input);}catch(error){throw Error(error.message.includes('重复')?'号码有重复，请去掉重复号码后保存':error.message);}
}
export function parseCostBets(input,stakePerNumber){
 if(typeof input==='string'&&input.length>1000)throw Error('号码内容过长');
 const grouped=typeof input==='string'&&input.normalize('NFKC').includes('各'),groups=[];
 if(grouped){
  let remaining=input.normalize('NFKC').trim();
  while(remaining){
   const match=remaining.match(/^([\s\S]*?)各\s*([+-]?\d+(?:\.\d+)?)(?:\s*元)?(?=$|[\s,;、])/);
   if(!match)throw Error('分组格式应为“12 13 19各15”，每组都要填写各多少元');
   const numbers=parseCostNumbers(match[1]);if(!numbers.length)throw Error('“各”前面须填写01–49的号码');
   const stakeCents=decimalUnits(match[2],{min:.01,max:1000000,label:'分组每号金额'});
   groups.push({numbers,stakeCents,stakePerNumber:decimalText(stakeCents)});
   remaining=remaining.slice(match[0].length).replace(/^[\s,;、]+/,'');
  }
 }else{
  if(stakePerNumber===undefined||stakePerNumber==='')throw Error('请在粘贴框内填写号码和金额，例如“12 13 19各15”');
  const numbers=parseCostNumbers(input),stakeCents=decimalUnits(stakePerNumber,{min:.01,max:1000000,label:'本期每号金额'});
  groups.push({numbers,stakeCents,stakePerNumber:decimalText(stakeCents)});
 }
 const numberStakes=groups.flatMap(g=>g.numbers.map(number=>({number,stakeCents:g.stakeCents}))).sort((a,b)=>a.number-b.number);
 const numbers=parseCostNumbers(numberStakes.map(b=>b.number));
 return {numbers,numberStakes,stakeGroups:groups,stakeMode:grouped?'grouped':'uniform',stakeCents:groups[0].stakeCents,stakePerNumber:groups[0].stakePerNumber,plannedStakeCents:numberStakes.reduce((sum,b)=>sum+b.stakeCents,0)};
}
export function validateCostEntry(input){
 const year=validateReferenceYear(input.year),issue=String(Number(input.issue)).padStart(3,'0');
 if(!/^\d{3}$/.test(issue)||+issue<1||+issue>366)throw Error('期号应为001–366');
 // Saved grouped records are re-derived from their retained text, never from client-supplied cents.
 const savedGroup=Array.isArray(input.numbers)&&input.stakeMode==='grouped';
 if(savedGroup&&(typeof input.rawText!=='string'||!input.rawText.normalize('NFKC').includes('各')))throw Error('分组金额原文缺失，请重新填写');
 const bets=parseCostBets(savedGroup?input.rawText:input.numbers,input.stakePerNumber),{numbers}=bets;if(!numbers.length)throw Error('请粘贴本期01–49的号码');
 if(savedGroup&&JSON.stringify(parseCostNumbers(input.numbers))!==JSON.stringify(numbers))throw Error('分组原文与号码不一致，请重新填写');
 const oddsHundredths=decimalUnits(input.odds,{min:1,max:10000,label:'本期返还倍数'});
 const memo=String(input.memo||'').trim();if(memo.length>300)throw Error('备注最多300字');
 return {year,issue,...bets,rawText:typeof input.numbers==='string'?input.numbers.trim():String(input.rawText||numbers.map(n=>String(n).padStart(2,'0')).join(' ')),odds:decimalText(oddsHundredths),oddsHundredths,memo};
}
export function buildCostLedger(document,draws,{at=new Date().toISOString()}={}){
 const settings=validateCostSettings(document),seen=new Set(),index=new Map(draws.map(draw=>[+draw.year+'-'+String(+draw.issue).padStart(3,'0'),draw]));
 const entries=(document.entries||[]).map(entry=>({...entry,...validateCostEntry(entry)})).sort((a,b)=>a.year-b.year||+a.issue-+b.issue);
 let balance=settings.initialCapitalCents;const rows=[];
 for(const entry of entries){
  const key=entry.year+'-'+entry.issue;if(seen.has(key))throw Error('成本账本存在重复期号，请修正后重新计算');seen.add(key);
  const draw=index.get(key),actual=draw?.number,valid=Number.isInteger(actual)&&actual>=1&&actual<=49;
  const status=entry.voidedAt?'voided':!draw?'pending':valid?'settled':'review',hit=status==='settled'?entry.numbers.includes(actual):null;
  const plannedStakeCents=entry.plannedStakeCents,stakeCents=status==='settled'?plannedStakeCents:0,winningStakeCents=hit?entry.numberStakes.find(b=>b.number===actual).stakeCents:0;
  const returnCents=hit?Math.floor((winningStakeCents*entry.oddsHundredths+50)/100):0,profitCents=returnCents-stakeCents,before=balance;
  balance+=profitCents;if(!Number.isSafeInteger(balance)||!Number.isSafeInteger(returnCents))throw Error('账本金额超出安全计算范围');
  rows.push({...entry,status,hit,plannedStakeCents,stakeCents,winningStakeCents,returnCents,profitCents,balanceBeforeCents:before,balanceCents:balance,actualNumber:valid?actual:null,actualZodiac:draw?.zodiac||null,drawnAt:draw?.drawn_at||null,reason:status==='pending'?'等待本期实际开奖，暂不扣款':status==='voided'?'记录已作废，不计入收支':status==='review'?'开奖结果不完整，暂不结算':hit?'命中，返还包含中奖号码本金':'未命中，扣除本期全部投入'});
 }
 const settled=rows.filter(row=>row.status==='settled'),hit=settled.filter(row=>row.hit).length;
 const stats={total:rows.length,settled:settled.length,hit,miss:settled.length-hit,pending:rows.filter(row=>row.status==='pending').length,review:rows.filter(row=>row.status==='review').length,voided:rows.filter(row=>row.status==='voided').length,initialCapitalCents:settings.initialCapitalCents,totalStakeCents:settled.reduce((n,r)=>n+r.stakeCents,0),totalReturnCents:settled.reduce((n,r)=>n+r.returnCents,0),profitCents:balance-settings.initialCapitalCents,balanceCents:balance,minimumBalanceCents:Math.min(settings.initialCapitalCents,...rows.map(row=>row.balanceCents))};
 const basisKey=JSON.stringify([document.revision,settings.initialCapitalCents,entries.map(e=>{const d=index.get(e.year+'-'+e.issue);return [e.id,e.revision,e.year,e.issue,e.numberStakes,e.oddsHundredths,e.voidedAt||null,d?[d.number,d.zodiac,d.drawn_at,d.updated_at]:null];})]);
 return {rows,stats,basisKey,lastCheckedAt:at};
}
