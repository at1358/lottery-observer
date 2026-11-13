import test from 'node:test';import assert from 'node:assert/strict';
import {effectivePrediction,firstCompleteObservation} from '../lib/complete-prediction.mjs';
import {evaluate} from '../lib/domain.mjs';import {collectionOutcome} from '../lib/collection-deadline.mjs';
import {computeCombination,validateCombination} from '../lib/combination.mjs';import {selectCombinationHistory} from '../lib/combination-periods.mjs';
const parsed={valid:true,values:[1,2],warnings:[]},row={id:'p',source_id:'s',year:2026,issue:'317',kind:'号码',raw:'317期【更新中】',parsed:JSON.stringify({valid:false,values:[],warnings:['尚未公布']}),first_seen:'2026-11-13T08:00:00.000Z',last_seen:'2026-11-13T11:00:00.000Z',latest_version:0};
const completed={...row,first_complete_raw:'317期推荐号码【01 02】',first_complete_parsed:JSON.stringify(parsed),first_complete_kind:'号码',first_complete_seen_at:'2026-11-13T11:00:00.000Z'};
test('first complete recommendation is distinct from the immutable initial placeholder',()=>{
 const effective=effectivePrediction(completed);assert.equal(effective.raw,completed.first_complete_raw);assert.equal(effective.initial_raw,row.raw);assert.equal(effective.first_seen,completed.first_complete_seen_at);assert.equal(effective.initial_first_seen,row.first_seen);assert.deepEqual(JSON.parse(effective.parsed),parsed);assert.equal(row.raw,'317期【更新中】');assert.equal(effectivePrediction(effective),effective);
});
test('an originally valid forecast never switches to a later or recovered recommendation',()=>{
 const original={...completed,parsed:JSON.stringify(parsed),latest_parsed:JSON.stringify({...parsed,values:[49]}),first_complete_parsed:JSON.stringify({...parsed,values:[49]})};assert.equal(effectivePrediction(original),original);assert.equal(evaluate(original,{number:49}).status,'loss');assert.equal(evaluate(completed,{number:1}).status,'win');assert.equal(evaluate({...completed,latest_parsed:JSON.stringify({...parsed,values:[49]})},{number:49}).status,'loss');
});
test('recovery uses the earliest retained complete observation and rejects ambiguous edited legacy data',()=>{
 const observation={raw:'317期推荐号码【01 02】',parsed,kind:'号码',at:'2026-11-13T11:30:00.000Z'};assert.equal(firstCompleteObservation(row,observation),observation);
 const legacy={...row,latest_raw:observation.raw,latest_parsed:JSON.stringify(parsed),latest_kind:'号码'};assert.equal(firstCompleteObservation(legacy,observation).at,row.last_seen);assert.equal(firstCompleteObservation({...legacy,latest_version:1},observation),null);assert.equal(firstCompleteObservation(completed,observation),null);assert.equal(firstCompleteObservation(row,{...observation,at:'2020-01-01T00:00:00Z'}),null);assert.equal(firstCompleteObservation(row,{...observation,parsed:{valid:false}}),null);
});
test('deadline is assessed at first complete capture, never at placeholder capture',()=>{
 const source={enabled:1,tracking_from:'2026-11-13T00:00:00Z',cutoff_time:'21:35'},at=Date.parse('2026-11-13T14:00:00Z');assert.equal(collectionOutcome(source,completed,'2026-11-13',at).status,'collected');
 const late={...completed,first_complete_seen_at:'2026-11-13T13:36:00.000Z'};assert.equal(collectionOutcome(source,late,'2026-11-13',at).status,'failed');assert.match(collectionOutcome(source,late,'2026-11-13',at).reason,/开奖后才采集/);
});
test('combination bases and collected-period intersection use first complete values without bypassing deadline failures',()=>{
 const plan=validateCombination({name:'恢复占位基准',year:2026,baseMode:'source',baseSourceId:'s',steps:[],historyScope:'collected-common'}),sources=[{id:'s',name:'推荐号码',year:2026,kind:'号码'}],context={year:2026,issue:'317',sources,predictions:[completed]};
 assert.deepEqual(computeCombination(plan,context).numbers,[1,2]);assert.deepEqual(selectCombinationHistory(plan,['317'],[completed],sources).issues,['317']);assert.equal(computeCombination(plan,{...context,failures:[{source_id:'s',year:2026,issue:'317'}]}).status,'blocked');assert.deepEqual(selectCombinationHistory(plan,['317'],[completed],sources,[{source_id:'s',year:2026,issue:'317'}]).issues,[]);
});
