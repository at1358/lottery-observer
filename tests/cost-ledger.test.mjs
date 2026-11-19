import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCostLedger,validateCostSettings,validateCostEntry,buildCostLedger,parseCostNumbers,parseCostBets} from '../lib/cost-ledger.mjs';
const entry=(issue,patch={})=>({...validateCostEntry({year:2026,issue,numbers:Array.from({length:20},(_,i)=>i+1),stakePerNumber:'10',odds:'47',...patch}),id:'entry-'+issue,revision:'r-'+issue});
const doc=(entries,patch={})=>({...emptyCostLedger(),revision:'v1',entries,...patch});
const draw=(issue,number,year=2026)=>({year,issue:String(issue).padStart(3,'0'),number,zodiac:'马'});
test('a 2000 capital ledger applies 200 cost, 470 gross return and 270 net profit',()=>{
 const r=buildCostLedger(doc([entry(1)]),[draw(1,5)]);assert.equal(r.rows[0].stakeCents,20000);assert.equal(r.rows[0].returnCents,47000);assert.equal(r.rows[0].profitCents,27000);assert.equal(r.stats.balanceCents,227000);assert.equal(r.stats.hit,1);
});
test('pending and voided periods never debit money and losses allow a negative balance',()=>{
 const d=doc([entry(1),entry(2),entry(3),entry(4,{voidedAt:'ignored'})],{...validateCostSettings({initialCapital:'35',defaultStakePerNumber:'10',defaultOdds:'47'})});d.entries[3].voidedAt='2026-01-01';
 const r=buildCostLedger(d,[draw(1,49),draw(2,48),draw(4,1)]);assert.deepEqual(r.rows.map(r=>r.balanceCents),[-16500,-36500,-36500,-36500]);assert.equal(r.stats.pending,1);assert.equal(r.stats.voided,1);assert.equal(r.stats.totalStakeCents,40000);
 const again=buildCostLedger(d,[draw(1,49),draw(2,48),draw(4,1)]);assert.deepEqual(again.stats,r.stats);
});
test('draw corrections and late earlier draws rebuild chronological balances across years',()=>{
 const d=doc([entry(2),entry(365,{year:2025}),entry(1)]),draws=[draw(365,49,2025),draw(2,5)];
 let r=buildCostLedger(d,draws);assert.deepEqual(r.rows.map(r=>[r.year,r.issue]),[[2025,'365'],[2026,'001'],[2026,'002']]);assert.equal(r.stats.balanceCents,207000);
 r=buildCostLedger(d,[...draws,draw(1,5)]);assert.equal(r.stats.balanceCents,234000);assert.equal(r.rows[2].balanceBeforeCents,207000);
 r=buildCostLedger(d,[draw(365,49,2025),draw(1,5),draw(2,49)]);assert.equal(r.stats.balanceCents,187000);
});
test('per-period stakes and odds survive changed defaults, and changing capital shifts balance',()=>{
 const entries=[entry(1),entry(2,{stakePerNumber:'20',odds:'40'})],d=doc(entries,{...validateCostSettings({initialCapital:'3000',defaultStakePerNumber:'100',defaultOdds:'30'})});
 const r=buildCostLedger(d,[draw(1,5),draw(2,5)]);assert.equal(r.rows[0].stakePerNumber,'10.00');assert.equal(r.rows[0].odds,'47.00');assert.equal(r.rows[1].returnCents,80000);assert.equal(r.stats.balanceCents,367000);
});
test('money rounds in integer cents and a hit is not automatically a profitable period',()=>{
 let r=buildCostLedger(doc([entry(1,{numbers:[1],stakePerNumber:'0.03',odds:'1.50'})]),[draw(1,1)]);assert.equal(r.rows[0].returnCents,5);assert.equal(r.rows[0].profitCents,2);
 r=buildCostLedger(doc([entry(1,{numbers:Array.from({length:49},(_,i)=>i+1)})]),[draw(1,1)]);assert.equal(r.rows[0].hit,true);assert.equal(r.rows[0].profitCents,-2000);
});
test('invalid or missing results are excluded, and duplicate period records are refused',()=>{
 const r=buildCostLedger(doc([entry(1)]),[{...draw(1,50)}]);assert.equal(r.rows[0].status,'review');assert.equal(r.stats.balanceCents,200000);assert.equal(r.stats.settled,0);
 assert.throws(()=>buildCostLedger(doc([entry(1),entry(1)]),[]),/重复期号/);
});
test('number input retains exact pasted text but rejects duplicates and incomplete labels',()=>{
 const e=validateCostEntry({year:2026,issue:'003',numbers:'０１，０２\n０３',stakePerNumber:'10',odds:'47',stakeCents:999});assert.deepEqual(e.numbers,[1,2,3]);assert.equal(e.rawText,'０１，０２\n０３');assert.equal(e.stakeCents,1000);
 assert.throws(()=>parseCostNumbers('01 01'),/重复/);assert.throws(()=>parseCostNumbers('01 50'),/01–49/);assert.throws(()=>parseCostNumbers('323期【01 02】'),/号码/);
});
test('invalid monetary and period settings fail before any settlement',()=>{
 for(const patch of [{initialCapital:'-1'},{defaultStakePerNumber:'0'},{defaultOdds:'.5'},{initialCapital:'1.001'}])assert.throws(()=>validateCostSettings({initialCapital:'2000',defaultStakePerNumber:'10',defaultOdds:'47',...patch}));
 for(const patch of [{issue:0},{issue:367},{numbers:[]},{stakePerNumber:'1e2'},{odds:'0'},{year:1900}])assert.throws(()=>entry(1,patch));
});
const groupedText='12 13 19各15\n42 43各10\n20 16 10 40 34各6\n38 49 48 37 36 33 04 08 46各5';
test('grouped paste retains all 19 numbers, individual stakes and the exact 140 total',()=>{
 const e=entry(1,{numbers:groupedText,stakePerNumber:'999',numberStakes:[{number:12,stakeCents:999999}]});
 assert.equal(e.numbers.length,19);assert.equal(e.plannedStakeCents,14000);assert.equal(e.rawText,groupedText);assert.equal(e.stakeMode,'grouped');
 assert.deepEqual(e.stakeGroups.map(g=>[g.numbers.length,g.stakeCents]),[[3,1500],[2,1000],[5,600],[9,500]]);
 assert.equal(e.numberStakes.find(b=>b.number===12).stakeCents,1500);assert.ok(!e.numbers.includes(15));
 const r=buildCostLedger(doc([e]),[]);assert.equal(r.rows[0].plannedStakeCents,14000);assert.equal(r.stats.balanceCents,200000);
});
test('each winning group uses its own stake and a miss loses the entire mixed total',()=>{
 for(const [number,returned,profit] of [[12,70500,56500],[42,47000,33000],[20,28200,14200],[38,23500,9500],[1,0,-14000]]){
  const r=buildCostLedger(doc([entry(1,{numbers:groupedText})]),[draw(1,number)]);
  assert.equal(r.rows[0].stakeCents,14000);assert.equal(r.rows[0].returnCents,returned);assert.equal(r.rows[0].profitCents,profit);assert.equal(r.stats.balanceCents,200000+profit);
 }
});
test('grouped decimals, full-width characters, same-line groups and currency units are unambiguous',()=>{
 const e=entry(1,{numbers:'０１，０２各０.０３元；０３各0.10',stakePerNumber:undefined,odds:'1.50'});
 assert.deepEqual(e.numbers,[1,2,3]);assert.equal(e.plannedStakeCents,16);assert.equal(buildCostLedger(doc([e]),[draw(1,1)]).rows[0].returnCents,5);
 assert.equal(parseCostBets('01 02各15 03各10','0').plannedStakeCents,4000);
});
test('grouped records revalidate from retained text and ignore forged derived cents',()=>{
 const e=entry(1,{numbers:groupedText});const again=validateCostEntry({...e,numberStakes:[{number:12,stakeCents:1}],plannedStakeCents:1});
 assert.deepEqual(again.numberStakes,e.numberStakes);assert.equal(again.plannedStakeCents,14000);
 assert.throws(()=>validateCostEntry({...e,numbers:[1]}),/不一致/);assert.throws(()=>validateCostEntry({...e,rawText:'01 02'}),/原文缺失/);
});
test('invalid grouped amounts and overlapping numbers fail rather than silently changing the purchase',()=>{
 for(const numbers of ['01各10\n01各5','01 01各10','01各0','01各-2','01各1.001','01各1e2','01各10\n02','01各','各10','50各10','01各10元元','01各1000001'])assert.throws(()=>entry(1,{numbers}));
});
test('changing a grouped winning stake invalidates the cached basis even with unchanged numbers and total',()=>{
 const e=entry(1,{numbers:groupedText}),a=buildCostLedger(doc([e]),[draw(1,42)]),changed=groupedText.replace('42 43各10','42各6\n43各10').replace('20 16 10 40 34各6','20各10\n16 10 40 34各6');
 const b=buildCostLedger(doc([{...e,...validateCostEntry({...e,numbers:changed})}]),[draw(1,42)]);
 assert.deepEqual(a.rows[0].numbers,b.rows[0].numbers);assert.equal(a.rows[0].plannedStakeCents,b.rows[0].plannedStakeCents);assert.notEqual(a.basisKey,b.basisKey);assert.equal(a.rows[0].returnCents,47000);assert.equal(b.rows[0].returnCents,28200);
});
