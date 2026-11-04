import test from 'node:test';import assert from 'node:assert/strict';
import {validateCombination,computeCombination} from '../lib/combination.mjs';
import {combinationPeriodReport} from '../lib/combination-results.mjs';
const id='10000000-0000-4000-8000-000000000001',plan=(steps,baseNumbers=[])=>validateCombination({name:'自建资料组合测试',year:2026,steps,baseMode:baseNumbers.length?'manual':'all',baseNumbers}),step={type:'custom',materialId:id,mode:'exclude'},zodiacs=Object.fromEntries(Array.from({length:49},(_,i)=>[i+1,i%12===4?'虎':'牛'])),context={year:2026,issue:'309',sources:[],predictions:[],customMaterials:[{id,name:'n−1 冲肖杀肖',kind:'杀肖',year:2026}],customRecords:[{materialId:id,year:2026,issue:'309',kind:'杀肖',raw:'309期杀虎',recordKey:'original',first_seen:'2026-11-05T01:00:00Z',parsed:{valid:true,values:['虎'],sourceRules:{zodiacs}}}]};
test('selected n-k material excludes all corresponding zodiac numbers and records its own basis',()=>{
 const result=computeCombination(plan([step]),context);assert.equal(result.status,'complete');assert.equal(result.total,45);assert.deepEqual(result.trace[0].removed,[5,17,29,41]);assert.equal(result.trace[0].customMaterialId,id);assert.equal(result.trace[0].customRecordKey,'original');assert.equal(result.trace[0].predictionId,null);assert.equal(result.trace[0].sourceId,null);
});
test('custom zodiac exclusions also work inside a manual 30-number base',()=>{
 const result=computeCombination(plan([step],Array.from({length:30},(_,i)=>i+1)),context);assert.equal(result.total,27);assert.ok(!result.numbers.includes(5)&&!result.numbers.includes(17)&&!result.numbers.includes(29));
});
test('missing custom period, missing full mapping or mismatched year block the entire result',()=>{
 for(const patch of [{customRecords:[]},{customRecords:[{...context.customRecords[0],parsed:{valid:true,values:['虎']}}]},{customMaterials:[{...context.customMaterials[0],year:2025}]}]){const result=computeCombination(plan([step]),{...context,...patch});assert.equal(result.status,'blocked');assert.deepEqual(result.numbers,[]);assert.equal(result.total,null);}
});
test('an incompatible historical zodiac table is excluded rather than reporting an inflated rate',()=>{
 const result=computeCombination(plan([step]),{...context,draw:{number:5,zodiac:'牛'}});assert.equal(result.status,'blocked');assert.match(result.errors[0],/对照与开奖管理不一致/);
});
test('manual self-created kills use the same selection path and exclude numbers directly',()=>{
 const result=computeCombination(plan([step]),{...context,customMaterials:[{...context.customMaterials[0],kind:'杀号码'}],customRecords:[{...context.customRecords[0],kind:'杀号码',parsed:{valid:true,values:[1,2,3]}}]});assert.equal(result.total,46);assert.deepEqual(result.trace[0].removed,[1,2,3]);
});
test('only complete and settled periods enter combination accuracy denominators',()=>{
 const mk=(issue,status,numbers)=>({year:2026,issue,status,numbers,total:status==='complete'?numbers.length:null,createdAt:'2026-11-05T00:00:00Z',historical:true}),report=combinationPeriodReport([mk('001','complete',[1]),mk('002','complete',[1]),mk('003','blocked',[]),mk('004','blocked',[]),mk('005','complete',[1])],[{year:2026,issue:'001',number:1},{year:2026,issue:'002',number:2},{year:2026,issue:'003',number:1}]);assert.equal(report.overall.total,5);assert.equal(report.overall.computed,3);assert.equal(report.overall.settled,2);assert.equal(report.overall.rate,.5);assert.equal(report.overall.errorRate,.5);assert.equal(report.blocked,2);assert.equal(report.pending,1);
});
