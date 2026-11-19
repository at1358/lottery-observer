import test from 'node:test';
import assert from 'node:assert/strict';
import {ALL_NUMBERS,validateCombination,computeCombination,combinationMessage} from '../lib/combination.mjs';
import {quickHistoryIssues,visibleCombinationPlans} from '../lib/quick-combination.mjs';
import {combinationPeriodReport} from '../lib/combination-results.mjs';
import {parsePrediction} from '../lib/domain.mjs';
const zodiacs=[...'鼠牛虎兔龙蛇马羊猴鸡狗猪'];
const plan=(patch={})=>validateCombination({name:'快速补集',year:2026,workspace:'quick',steps:[{type:'source',sourceId:'s',mode:'include',selection:'complement'}],...patch});
const row=(kind,values)=>({id:'p',source_id:'s',year:2026,issue:'323',kind,raw:'323期【'+values.join(' ')+'】',parsed:{valid:true,values}});
const context=p=>({year:2026,issue:'323',sources:[{id:'s',year:2026,name:'原资料'}],predictions:[p],rules:{zodiacs:Object.fromEntries(ALL_NUMBERS.map((n,i)=>[n,zodiacs[i%12]]))}});
test('quick settings persist independently and ordinary plans retain their old shape',()=>{
 const p=plan({quickScope:'available',push:{enabled:false},calculation:{enabled:true,time:'10:30'}});
 assert.equal(p.workspace,'quick');assert.equal(p.quickScope,'available');assert.equal(p.steps[0].selection,'complement');assert.equal(p.push.enabled,false);
 const normal=validateCombination({...p,workspace:undefined,steps:[{...p.steps[0],selection:undefined}]});assert.equal(normal.workspace,undefined);assert.equal(normal.quickScope,undefined);assert.equal(normal.steps[0].selection,undefined);
 assert.throws(()=>plan({quickScope:'unknown'}),/计算范围/);assert.throws(()=>validateCombination({...p,workspace:undefined}),/快速计算/);
 assert.deepEqual(visibleCombinationPlans([{id:1},p]),[{id:1}]);assert.deepEqual(visibleCombinationPlans([{id:1},p],true),[p]);
});
test('36-code complement can be included, excluded, or used as a base without changing archived data',()=>{
 const ctx=context(row('36码',ALL_NUMBERS.slice(0,36))),original=JSON.stringify(ctx),p=plan();
 const included=computeCombination(p,ctx);assert.equal(included.status,'complete');assert.deepEqual(included.numbers,ALL_NUMBERS.slice(36));assert.equal(included.total,13);assert.equal(included.trace[0].inputValues.length,36);assert.equal(included.trace[0].values.length,13);
 const excluded=computeCombination(plan({steps:[{...p.steps[0],mode:'exclude'}]}),ctx);assert.deepEqual(excluded.numbers,ALL_NUMBERS.slice(0,36));
 const base=computeCombination(plan({baseMode:'source',baseSourceId:'s',baseSelection:'complement',steps:[{type:'manual',kind:'号码',values:'49',mode:'exclude'}]}),ctx);assert.equal(base.baseNumbers.length,13);assert.equal(base.total,12);assert.ok(!base.numbers.includes(49));assert.equal(JSON.stringify(ctx),original);
 assert.match(combinationMessage(p,{...included,createdAt:'2026-11-19T10:00:00Z'}),/原资料缺少的/);
});
test('nine zodiacs use the missing three with the source own mapping and never require a draw',()=>{
 const parsed=parsePrediction('323期【一国三肖】特开:？00准\n吴国:兔虎蛇 蜀国:猴羊鸡 魏国:鼠牛狗','生肖');assert.equal(parsed.valid,true);assert.equal(parsed.values.length,9);
 const record=row('生肖',parsed.values),ctx=context(record);record.parsed.sourceRules={zodiacs:Object.fromEntries(ALL_NUMBERS.map((n,i)=>[n,zodiacs[(i+1)%12]]))};
 const p=plan(),r=computeCombination(p,ctx),missing=zodiacs.filter(z=>!parsed.values.includes(z));assert.equal(missing.length,3);assert.deepEqual(r.trace[0].values,missing);assert.equal(r.status,'complete');assert.deepEqual(r.numbers,ALL_NUMBERS.filter(n=>missing.includes(record.parsed.sourceRules.zodiacs[n])));
 const excluded=computeCombination(plan({steps:[{...p.steps[0],mode:'exclude'}]}),ctx);assert.deepEqual(excluded.numbers,ALL_NUMBERS.filter(n=>!r.numbers.includes(n)));
});
test('missing, failed, partial or unsupported inputs never fabricate a complement',()=>{
 const p=plan(),ctx=context(row('36码',ALL_NUMBERS.slice(0,36)));
 for(const patch of [{predictions:[]},{failures:[{source_id:'s',year:2026,issue:'323'}]},{predictions:[{...ctx.predictions[0],parsed:{valid:false,values:[1,2]}}]},{predictions:[row('杀尾',[3])]}]){const r=computeCombination(p,{...ctx,...patch});assert.equal(r.status,'blocked');assert.deepEqual(r.numbers,[]);}
 const zodiac=context(row('生肖',zodiacs.slice(0,9)));zodiac.rules={};assert.equal(computeCombination(p,zodiac).status,'blocked');
});
test('latest-only keeps saved daily history while available scope backfills complete same-period records',()=>{
 const issues=['001','002','323'],snapshots=[{issue:'002'},{issue:'323'}];assert.deepEqual(quickHistoryIssues(plan(),issues,snapshots),['002','323']);assert.deepEqual(quickHistoryIssues(plan({quickScope:'available'}),issues,snapshots),issues);assert.deepEqual(quickHistoryIssues({},issues,snapshots),issues);
 const report=combinationPeriodReport([{year:2026,issue:'001',status:'complete',numbers:[49],historical:true},{year:2026,issue:'002',status:'complete',numbers:[49],historical:true},{year:2026,issue:'003',status:'blocked',numbers:[],historical:true},{year:2026,issue:'323',status:'complete',numbers:[49],historical:true}],[{year:2026,issue:'001',number:49},{year:2026,issue:'002',number:1},{year:2026,issue:'003',number:49}]);assert.equal(report.overall.settled,2);assert.equal(report.overall.rate,.5);assert.equal(report.pending,1);assert.equal(report.blocked,1);
});
