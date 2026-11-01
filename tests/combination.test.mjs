import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {extractModule} from '../lib/extract.mjs';import {splitPeriods,parsePrediction,evaluate} from '../lib/domain.mjs';import {sourceDefinitions} from '../lib/source-rules.mjs';
import {validateCombination,computeCombination,ALL_NUMBERS,combinationMessage} from '../lib/combination.mjs';
const fixture=n=>readFileSync(new URL('./fixtures/'+n,import.meta.url),'utf8');
const whiteSample='304期:【主攻15码】开:？00准\n❤【01 08 09 10 13 21】❤\n【24 25 26 28 29 33 39 40 45】';
const elements=extractModule(fixture('source-elements.html'),{kind:'杀行'}).sourceRules,segments=extractModule(fixture('source-segments.html'),{kind:'杀段'}).sourceRules;
const sources=[{id:'sx',name:'绝杀二肖'},{id:'tail',name:'绝杀一尾'},{id:'element',name:'绝杀一行'},{id:'segment',name:'绝杀一段'},{id:'white',name:'白小姐15码'}];
function row(source_id,kind,raw,rules){return {id:source_id,source_id,year:2026,issue:'305',kind,raw,parsed:{...parsePrediction(raw,kind),...rules?{sourceRules:rules}:{}},first_seen:'2026-11-01T11:00:00Z'};}
const predictions=[row('sx','杀肖','305期绝杀二肖【蛇虎】'),row('tail','杀尾','305期绝杀一尾【3尾】'),row('element','杀行','305期绝杀一行【土行】',elements),row('segment','杀段','305期绝杀一段【4段】',segments),row('white','15码','305期【主攻15码】\n【04 06 07 08 10 14 17 20 23 32 35 39 44 47 48】')];
const annual={zodiacs:Object.fromEntries(ALL_NUMBERS.map(n=>[n,n%2?'蛇':'鼠'])),elements:Object.fromEntries(ALL_NUMBERS.map(n=>[n,'土'])),segments:Object.fromEntries(ALL_NUMBERS.map(n=>[n,7]))};
const plan=(ids,patch={})=>validateCombination({name:'验收组合',year:2026,steps:ids.map(sourceId=>({type:'source',sourceId,mode:'auto'})),...patch});
test('latest-period mode and refresh-before-calculation are explicit persisted settings',()=>{
 const latest=plan(['white'],{targetMode:'latest'});assert.equal(latest.targetMode,'latest');assert.equal(latest.calculation.refreshSources,true);
 assert.equal(plan(['white'],{calculation:{refreshSources:false}}).calculation.refreshSources,false);
 assert.throws(()=>plan(['white'],{targetMode:'unknown'}),/期数选择方式/);
});
test('White 305 recovers a changed numeric path and retains a stable title selector',()=>{
 const result=extractModule(fixture('white-305.html'),{name:'白小姐 1491.com【主攻15码】',kind:'15码',sample:whiteSample,selector:'html:nth-of-type(1) > div:nth-of-type(34) > div:nth-of-type(2)'});
 assert.match(result.selector,/^title:/);const rows=splitPeriods(result.text);assert.deepEqual(rows.map(r=>r.issue),['304','305']);assert.deepEqual(parsePrediction(rows[1].raw,'15码').values,[4,6,7,8,10,14,17,20,23,32,35,39,44,47,48]);
 const moved='<div>新广告位</div><section><h2>白小姐1491.com【主攻15码】</h2><div class="changed-layout"><p>305期:【主攻15码】开:？00准<br>【04 06 07 08 10 14 17 20 23 32 35 39 44 47 48】</p></div></section>';
 assert.deepEqual(splitPeriods(extractModule(moved,{selector:result.selector,kind:'15码',sample:whiteSample}).text).map(r=>r.issue),['305']);
});
test('captures the source element and segment partitions, keeping them outside prediction text',()=>{
 assert.equal(Object.keys(elements.elements).length,49);assert.equal(elements.elements[4],'金');assert.equal(elements.elements[6],'土');assert.ok(elements.definitions.some(e=>e.label==='土'&&e.numbers.includes(6)));assert.equal(Object.keys(segments.segments).length,49);
 const last=splitPeriods(extractModule(fixture('source-elements.html'),{kind:'杀行'}).text).at(-1);assert.ok(!last.raw.includes('4,5,12'));assert.ok(last.raw.length<150);
});
test('source classifications take priority over the annual table for each selected source',()=>{
 const p=plan(['sx','tail','element','segment']),result=computeCombination(p,{year:2026,issue:'305',predictions,sources,rules:annual});
 const expected=ALL_NUMBERS.filter(n=>annual.zodiacs[n]!=='蛇'&&n%10!==3&&elements.elements[n]!=='土'&&segments.segments[n]!==4);
 assert.deepEqual(result.numbers,expected);assert.equal(result.status,'complete');assert.ok(result.trace[2].origin.includes('栏目自带'));
 assert.equal(evaluate(predictions[2],{number:4,element:'土'},annual).status,'win');
});
test('15-code inclusion intersects filters, supports manual exclusions and a legitimate zero result',()=>{
 const p=plan(['white','tail','element','segment']),r=computeCombination(p,{year:2026,issue:'305',predictions,sources,rules:annual});
 assert.deepEqual(r.numbers,[4,8,10,14,17,32,35,39,44,47,48]);
 const zero=plan([],{baseNumbers:'01',steps:[{type:'manual',kind:'号码',values:'01',mode:'exclude'}]});assert.deepEqual(computeCombination(zero,{year:2026,issue:'305',predictions:[],sources:[]}).numbers,[]);
});
test('a manually selected 30-code source is the base pool, and killing tiger removes only tiger numbers in that pool',()=>{
 const thirty=Array.from({length:30},(_,i)=>i+1),numbers=thirty.map(n=>String(n).padStart(2,'0')).join(' '),p=plan([],{baseMode:'source',baseSourceId:'thirty',steps:[{type:'manual',kind:'生肖',values:'虎',mode:'exclude'}]}),tigers=[5,17,29,41],zodiacs=Object.fromEntries(ALL_NUMBERS.map(n=>[n,tigers.includes(n)?'虎':'兔']));
 const r=computeCombination(p,{year:2026,issue:'305',sources:[{id:'thirty',name:'必中30码',year:2026}],predictions:[row('thirty','号码','305期必中30码\n【'+numbers+'】')],rules:{zodiacs}});
 assert.deepEqual(r.baseNumbers,thirty);assert.equal(r.total,27);assert.deepEqual(r.numbers,thirty.filter(n=>!tigers.includes(n)));assert.deepEqual(r.trace[1].matched,tigers);assert.deepEqual(r.trace[1].removed,[5,17,29]);
 const fortyNine=computeCombination(plan([],{baseMode:'all',steps:p.steps}),{year:2026,issue:'305',sources:[],predictions:[],rules:{zodiacs}});assert.equal(fortyNine.total,45);
});
test('an already archived source table can be used directly without changing collected records',()=>{
 const text=elements.definitions.map(d=>d.raw).join('\n'),legacy=row('element','杀行','305期绝杀一行【土行】\n'+text),original=JSON.stringify(legacy);
 const r=computeCombination(plan(['element']),{year:2026,issue:'305',predictions:[legacy],sources,rules:annual});assert.equal(r.status,'complete');assert.equal(r.trace[0].origin,'栏目自带对照');assert.equal(JSON.stringify(legacy),original);assert.ok(!r.numbers.includes(21));
});
test('missing, failed, deleted or differently dated inputs block final output',()=>{
 const p=plan(['white','tail']);for(const context of [{predictions:predictions.filter(p=>p.source_id!=='tail')},{predictions:predictions.map(p=>p.source_id==='tail'?{...p,issue:'304'}:p)},{sources:sources.filter(s=>s.id!=='tail')},{failures:[{source_id:'tail',year:2026,issue:'305'}]}]){const r=computeCombination(p,{year:2026,issue:'305',predictions,sources,rules:annual,...context});assert.equal(r.status,'blocked');assert.deepEqual(r.numbers,[]);}
 assert.throws(()=>computeCombination(p,{year:2025,issue:'305',predictions,sources,rules:annual}),/年份/);
});
test('partial or overlapping source tables are retained and block silent annual substitution',()=>{
 const definition=sourceDefinitions('金：01 02\n木：02 03');assert.equal(definition.entries.length,2);assert.equal(definition.rules.elements,undefined);assert.ok(definition.warnings.length);
 const bad=predictions.map(p=>p.source_id==='element'?{...p,parsed:{...p.parsed,sourceRules:{...definition.rules,definitions:definition.entries}}}:p);
 const result=computeCombination(plan(['element']),{year:2026,issue:'305',predictions:bad,sources,rules:annual});assert.equal(result.status,'blocked');
 const invalid=sourceDefinitions('金：50 51');assert.equal(invalid.entries.length,1);assert.equal(invalid.entries[0].invalid,true);assert.ok(invalid.warnings.length);assert.equal(invalid.rules.elements,undefined);
});
test('manual half-head, tail, sum and zodiac constraints use number-level attributes',()=>{
 const p=plan([],{steps:[{type:'manual',kind:'尾数',values:'2尾',mode:'include'},{type:'manual',kind:'头数',values:'0头',mode:'exclude'}]}),r=computeCombination(p,{year:2026,issue:'305',predictions:[],sources:[]});assert.deepEqual(r.numbers,[12,22,32,42]);
 const content=combinationMessage(p,{...r,createdAt:'2026-11-01T11:00:00Z'});assert.match(content,/剩余候选 4 个/);assert.match(content,/2026 年第 305 期/);
 assert.throws(()=>validateCombination({name:'bad',year:2026,steps:p.steps,calculation:{enabled:true,time:'22:00'}}),/截止/);
 assert.throws(()=>computeCombination(p,{year:2026,issue:'wrong',predictions:[],sources:[]}),/有效/);
});
