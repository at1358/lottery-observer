import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSimulation,buildSimulationLedger,decimalUnits} from '../lib/simulation.mjs';
import {buildCustomMaterial,customMaterialStats} from '../lib/custom-material.mjs';
const combo='11111111-1111-4111-8111-111111111111',numbers=Array.from({length:20},(_,i)=>i+1),plan=patch=>validateSimulation({name:'模拟账本',combinationId:combo,year:2026,initialCapital:'35',stakePerNumber:'10',odds:'47',...patch}),period=(issue,patch={})=>({id:'result:'+issue,year:2026,issue:String(issue).padStart(3,'0'),status:'complete',numbers,settlement:{mode:'history'},...patch}),draw=(issue,number)=>({year:2026,issue:String(issue).padStart(3,'0'),number,zodiac:'牛'});
test('20 numbers at 10 each return 470 on a hit; losses continue through a negative balance',()=>{
 const result=buildSimulationLedger(plan(),{periods:[period(1),period(2),period(3)]},[draw(1,49),draw(2,48),draw(3,5)]);
 assert.deepEqual(result.rows.map(r=>r.balanceCents),[-16500,-36500,-9500]);assert.equal(result.rows[2].stakeCents,20000);assert.equal(result.rows[2].returnCents,47000);assert.equal(result.rows[2].profitCents,27000);assert.equal(result.stats.totalStakeCents,60000);assert.equal(result.stats.totalReturnCents,47000);assert.equal(result.stats.profitCents,-13000);assert.equal(result.stats.balanceCents,-9500);
});
test('missing results, pending draws and empty selections do not deduct money',()=>{
 const result=buildSimulationLedger(plan(),{periods:[period(2,{status:'blocked',errors:['缺少资料']}),period(3),period(4,{numbers:[]})]},[draw(1,49),draw(2,48),draw(4,47)]);
 assert.deepEqual(result.rows.map(r=>r.status),['blocked','blocked','pending','skipped']);assert.equal(result.stats.balanceCents,3500);assert.equal(result.stats.totalStakeCents,0);assert.equal(result.stats.settled,0);assert.equal(result.rows[2].plannedStakeCents,20000);
});
test('manual number pool intersects each combination; per-period selection can override or abstain',()=>{
 const value=plan({selectionMode:'pool',selectedNumbers:[1,49],overrides:{'002':[2,3],'003':[]}}),result=buildSimulationLedger(value,{periods:[period(1),period(2),period(3)]},[draw(1,49),draw(2,2),draw(3,5)]);
 assert.deepEqual(result.rows.map(r=>r.numbers),[[1],[2,3],[]]);assert.equal(result.rows[1].profitCents,45000);assert.equal(result.rows[2].status,'skipped');
 const invalid=buildSimulationLedger(plan({overrides:{'001':[49]}}),{periods:[period(1)]},[draw(1,49)]);assert.equal(invalid.rows[0].status,'blocked');assert.equal(invalid.stats.totalStakeCents,0);
});
test('hitting a number can still lose money when total stakes exceed payout',()=>{
 const result=buildSimulationLedger(plan(),{periods:[period(1,{numbers:Array.from({length:49},(_,i)=>i+1)})]},[draw(1,49)]);assert.equal(result.rows[0].hit,true);assert.equal(result.rows[0].profitCents,-2000);assert.equal(result.rows[0].outcome,'loss');assert.equal(result.stats.hit,1);assert.equal(result.stats.profitable,0);assert.equal(result.stats.losing,1);
});
test('repeated recalculation is deterministic; draw corrections recalculate later balances',()=>{
 const p=plan(),report={periods:[period(1),period(2)]},draws=[draw(1,1),draw(2,49)],first=buildSimulationLedger(p,report,draws,{at:'2026-01-03T00:00:00Z'}),again=buildSimulationLedger(p,report,draws,{previous:first,at:'2026-01-04T00:00:00Z'});
 assert.equal(again.stats.balanceCents,10500);assert.deepEqual(again.rows.map(r=>r.firstSeen),first.rows.map(r=>r.firstSeen));assert.deepEqual(again.rows.map(r=>r.updatedAt),first.rows.map(r=>r.updatedAt));
 const corrected=buildSimulationLedger(p,report,[draw(1,48),draw(2,49)],{previous:again});assert.equal(corrected.stats.balanceCents,-36500);assert.equal(corrected.rows[1].balanceBeforeCents,-16500);
});
test('integer-cent money validation, decimal rounding and year/period isolation',()=>{
 assert.equal(decimalUnits('0.01'),1);assert.throws(()=>decimalUnits('1.001'));assert.throws(()=>plan({stakePerNumber:'0'}));assert.throws(()=>plan({odds:'0'}));assert.throws(()=>plan({selectionMode:'pool',selectedNumbers:[]}));assert.throws(()=>plan({overrides:{'1':[1],'001':[2]}}));
 const rounded=buildSimulationLedger(plan({stakePerNumber:'0.01',odds:'1.50'}),{periods:[period(1,{numbers:[1]})]},[draw(1,1)]);assert.equal(rounded.rows[0].returnCents,2);
 assert.throws(()=>buildSimulationLedger(plan(),{periods:[period(1),period(1)]},[draw(1,1)]));
 const isolated=buildSimulationLedger(plan(),{periods:[period(1,{year:2025}),period(365)]},[draw(1,49)]);assert.equal(isolated.rows.length,1);assert.equal(isolated.rows[0].status,'blocked');
});
test('latest loss metadata sorts by period and retreats when a draw is corrected',()=>{
 const rows=[{year:2026,issue:'001',status:'loss',actualNumber:1},{year:2026,issue:'020',status:'win'},{year:2026,issue:'013',status:'loss',actualNumber:13,actualZodiac:'马'}];assert.deepEqual(customMaterialStats(rows).latestLoss,{year:2026,issue:'013',number:13,zodiac:'马'});rows[2].status='win';assert.equal(customMaterialStats(rows).latestLoss.issue,'001');rows[0].status='win';assert.equal(customMaterialStats(rows).latestLoss,null);
});
test('n-minus-six fills all first six 2026 periods from actual 2025 tail draws',()=>{
 const tails=['牛','马','羊','龙','马','龙'],opposites=['羊','鼠','牛','狗','鼠','狗'],draws=tails.map((zodiac,i)=>({year:2025,issue:String(360+i),number:i+1,zodiac}));for(let i=1;i<=6;i++)draws.push({year:2026,issue:String(i).padStart(3,'0'),number:i+10,zodiac:'虎'});
 const result=buildCustomMaterial({year:2026,name:'n−6',lag:6,periodCounts:{}},draws);for(let i=1;i<=6;i++){const row=result.rows.find(r=>+r.issue===i);assert.equal(row.sourceYear,2025);assert.equal(+row.sourceIssue,359+i);assert.equal(row.killZodiac,opposites[i-1]);assert.equal(row.status,'win');}
 assert.equal(result.stats.settled,6);assert.equal(result.stats.review,0);
});
