import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractModule} from '../lib/extract.mjs';
import {predictionNumberGroups} from '../lib/prediction-number-groups.mjs';
const rules=name=>extractModule(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'),{kind:name.includes('segments')?'杀段':'杀行'}).sourceRules;
test('the reported 305 segment and metal group expand from each archived column table',()=>{
 const segment={kind:'杀段',raw:'305期:绝杀一段【3段】特开:？00准',parsed:{valid:true,values:[3],sourceRules:rules('source-segments.html')}},metal={kind:'杀行',raw:'305期:绝杀一行【金行】特开:？00准',parsed:{valid:true,values:['金'],sourceRules:rules('source-elements.html')}};
 const before=JSON.stringify([segment,metal]);assert.deepEqual(predictionNumberGroups(segment).groups,[{label:'3段',numbers:[15,16,17,18,19,20,21]}]);assert.deepEqual(predictionNumberGroups(metal).groups,[{label:'金行',numbers:[4,5,12,13,26,27,34,35,42,43]}]);assert.equal(JSON.stringify([segment,metal]),before);
});
test('a column with different segment boundaries is displayed using its own table',()=>{
 const segments=Object.fromEntries(Array.from({length:49},(_,i)=>[i+1,i<5?3:1]));
 assert.deepEqual(predictionNumberGroups({kind:'杀段',parsed:{valid:true,values:[3],sourceRules:{segments}}}).groups[0].numbers,[1,2,3,4,5]);
});
test('multiple selected groups produce separate lines, including stored JSON interpretation',()=>{
 const result=predictionNumberGroups({kind:'杀行',parsed:JSON.stringify({valid:true,values:['金','木'],sourceRules:rules('source-elements.html')})});assert.deepEqual(result.groups.map(g=>g.label),['金行','木行']);assert.deepEqual(result.groups[1].numbers,[8,9,16,17,24,25,38,39,46,47]);
});
test('missing or partial definitions never invent numbers; unrelated and failed records stay unchanged',()=>{
 assert.ok(predictionNumberGroups({kind:'杀段',parsed:{valid:true,values:[3],sourceRules:{segments:{15:3}}}}).warning);
 assert.equal(predictionNumberGroups({kind:'杀尾',parsed:{valid:true,values:[3]}}),null);assert.equal(predictionNumberGroups({kind:'杀段',parsed:{valid:false,values:[3]}}),null);assert.equal(predictionNumberGroups({kind:'杀段',synthetic:true,parsed:{valid:true,values:[3]}}),null);
});
