import test from 'node:test';import assert from 'node:assert/strict';import {currentCombinationPeriod} from '../lib/combination-periods.mjs';
const at=Date.parse('2026-11-08T19:00:00+08:00'),draw={year:2026,issue:'311',draw_date:'2026-11-07',drawn_at:null};
test('pre-draw combinations confirm the adjacent current issue without requiring its result or announcement',()=>{
 const p=currentCombinationPeriod(2026,[draw],{},at);assert.equal(p.issue,'312');assert.equal(p.date,'2026-11-08');assert.equal(p.drawn,false);assert.match(p.basis,/上期实际开奖/);
 assert.equal(currentCombinationPeriod(2026,[draw],{x:{year:2026,issue:'313',date:'2026-11-09'}},at).issue,'312');
 assert.equal(currentCombinationPeriod(2026,[draw],{x:{year:2026,issue:'312',date:'2026-11-08'}},at).issue,'312');
});
test('stale, undated, future and cross-year mismatched records cannot label old or arbitrary issues as current',()=>{
 for(const d of [{...draw,draw_date:'2026-11-06'},{...draw,draw_date:null},{...draw,drawn_at:'2026-11-09T21:38:00+08:00'},{...draw,year:2025}])assert.equal(currentCombinationPeriod(2026,[d],{},at).issue,null);
 assert.equal(currentCombinationPeriod(2025,[draw],{x:{year:2025,issue:'312',date:'2026-11-08'}},at).issue,null);
 const known={...draw,issue:'312',draw_date:'2026-11-08'};assert.equal(currentCombinationPeriod(2026,[draw,known],{},at).drawn,true);assert.equal(currentCombinationPeriod(2026,[draw,known],{},at).issue,'312');
 assert.equal(currentCombinationPeriod(2026,[draw,{...known,draw_date:null}],{},at).issue,null);
});
test('new-year combinations use the actual dated year end and do not require a current-year result',()=>{
 const p=currentCombinationPeriod(2027,[{year:2026,issue:'365',draw_date:'2026-12-31'}],{},Date.parse('2027-01-01T10:00:00+08:00'));assert.equal(p.issue,'001');assert.equal(p.drawn,false);assert.equal(p.date,'2027-01-01');
});
