export function settleCombination(result,draw){
 const created=Date.parse(result.createdAt),drawn=Date.parse(draw?.drawn_at);
 const mode=result.backtest||result.historical||result.drawn?'history':draw&&!Number.isFinite(drawn)?'unconfirmed':draw&&(!Number.isFinite(created)||created>=drawn)?'history':'forecast';
 const status=result.status!=='complete'?'blocked':!draw?'pending':result.numbers.includes(draw.number)?'win':'loss';
 return {...result,settlement:{status,mode,number:draw?.number??null,zodiac:draw?.zodiac||null,drawnAt:draw?.drawn_at||null}};
}
export function combinationPeriodReport(results,draws){
 const byDraw=new Map(draws.map(d=>[d.year+'-'+d.issue,d])),groups=new Map();
 for(const r of results){const key=r.year+'-'+r.issue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(settleCombination(r,byDraw.get(key)));}
 const periods=[];
 for(const group of groups.values()){
  // One period is one sample. Preserve its first complete forecast, even if a
  // later recomputation happens to match the actual result.
  group.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
  const result=group.find(r=>r.status==='complete'&&r.settlement.mode==='forecast')||group.find(r=>r.status==='complete'&&!r.backtest)||group.find(r=>r.status==='complete')||group[0];
  periods.push({...result,snapshotCount:group.filter(r=>!r.backtest).length});
 }
 periods.sort((a,b)=>b.year-a.year||Number(b.issue)-Number(a.issue));
 const stats={};for(const mode of ['forecast','history','unconfirmed']){const rows=periods.filter(r=>r.settlement.mode===mode),win=rows.filter(r=>r.settlement.status==='win').length,loss=rows.filter(r=>r.settlement.status==='loss').length;stats[mode]={win,loss,settled:win+loss,rate:win+loss?win/(win+loss):null};}
 return {periods,stats,pending:periods.filter(r=>r.settlement.status==='pending').length,blocked:periods.filter(r=>r.settlement.status==='blocked').length};
}
