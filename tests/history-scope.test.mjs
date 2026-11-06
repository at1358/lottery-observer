import test from 'node:test';import assert from 'node:assert/strict';
import {collectedSourceIds,selectCombinationHistory} from '../lib/combination-periods.mjs';
import {validateCombination} from '../lib/combination.mjs';
import {validateSimulation,buildSimulationLedger} from '../lib/simulation.mjs';
const plan={year:2026,historyScope:'collected-common',baseMode:'source',baseSourceId:'a',steps:[{type:'source',sourceId:'b'},{type:'source',sourceId:'a'},{type:'custom',materialId:'own'}]},sources=[{id:'a'},{id:'b'}],row=(source_id,issue,extra={})=>({source_id,year:2026,issue,parsed:{valid:true,values:[1,2,3],warnings:[]},...extra}),predictions=[row('a','001'),row('a','002'),row('a','003'),row('b','002'),row('b','003'),row('b','004')],issues=['001','002','003','004','005'];
test('history uses the intersection of complete collected periods including a collected base, ignoring self-created coverage',()=>{
 assert.deepEqual(collectedSourceIds(plan),['a','b']);const selection=selectCombinationHistory(plan,issues,predictions,sources);assert.deepEqual(selection.issues,['002','003']);assert.equal(selection.scope.excluded,3);assert.equal(selection.scope.sourceCount,2);
 assert.deepEqual(selectCombinationHistory({...plan,baseMode:'custom',steps:[plan.steps[0]]},issues,predictions,sources).issues,['002','003','004']);
});
test('failed, invalid, deleted and differently dated collections never enter the common history',()=>{
 const invalid=predictions.map(p=>p.source_id==='b'&&p.issue==='003'?{...p,parsed:{valid:false,values:[1]}}:p);assert.deepEqual(selectCombinationHistory(plan,issues,invalid,sources).issues,['002']);
 assert.deepEqual(selectCombinationHistory(plan,issues,predictions,sources,[{source_id:'a',year:2026,issue:'002',status:'failed'}]).issues,['003']);
 assert.deepEqual(selectCombinationHistory(plan,issues,predictions.map(p=>({...p,year:2025})),sources).issues,[]);assert.deepEqual(selectCombinationHistory(plan,issues,predictions,[sources[0],{...sources[1],deleted_batch:'trash'}]).issues,[]);
 assert.deepEqual(selectCombinationHistory(plan,issues,predictions.map(p=>({...p,deleted_batch:'trash'})),sources).issues,[]);
});
test('all-history remains the default and a source-free plan retains its own available periods',()=>{
 assert.deepEqual(selectCombinationHistory({...plan,historyScope:'all'},issues,predictions,sources).issues,issues);const own=selectCombinationHistory({...plan,baseMode:'all',steps:[{type:'custom',materialId:'own'}]},issues,predictions,sources);assert.deepEqual(own.issues,issues);assert.equal(own.scope.active,false);
 const input={name:'期数范围',year:2026,baseMode:'manual',baseNumbers:[1],steps:[]};assert.equal(validateCombination(input).historyScope,'all');assert.equal(validateCombination({...input,historyScope:'collected-common'}).historyScope,'collected-common');assert.throws(()=>validateCombination({...input,historyScope:'invalid'}),/范围/);
});
test('a scoped virtual ledger omits excluded periods and never deducts their stakes',()=>{
 const p=validateSimulation({name:'范围账本',year:2026,combinationId:'11111111-1111-1111-1111-111111111111',initialCapital:'1000',stakePerNumber:'10',odds:'47',selectionMode:'all',schedule:{enabled:false}}),report={periods:[{year:2026,issue:'002',status:'complete',numbers:[1,2,3],settlement:{mode:'history'}}],historyScope:{active:true,eligibleIssues:['002']}},draws=[{year:2026,issue:'001',number:49},{year:2026,issue:'002',number:1},{year:2026,issue:'003',number:49}],ledger=buildSimulationLedger(p,report,draws);
 assert.deepEqual(ledger.rows.map(r=>r.issue),['002']);assert.equal(ledger.stats.settled,1);assert.equal(ledger.stats.blocked,0);assert.equal(ledger.stats.totalStakeCents,3000);assert.equal(ledger.stats.balanceCents,144000);
});
