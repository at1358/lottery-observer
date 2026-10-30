import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveModule,staticDocumentWrites} from '../lib/content-resolver.mjs';
import {splitPeriods,parsePrediction,evaluate,inferKind} from '../lib/domain.mjs';
const origin='https://mvqx1n.dlxyzw.com:1734',url=origin+'/wz/bbsjs/060.html';
const fixture=name=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
const sample='263期绝杀半头【0头双3头单】开狗09准';
test('real reported page follows data script then iframe without executing JavaScript',async()=>{
 const requests=[];
 const map={
  [origin+'/wz/bbshtm/060.js']:fixture('half-head-loader.js'),
  [origin+'/wz/bbs/060.html']:fixture('half-head-content.html'),
 };
 const result=await resolveModule({url,text:fixture('half-head-shell.html')},{sample,name:'东方不败【绝杀半头】',kind:'杀半头'},async target=>{requests.push(target);if(!(target in map))throw Error('unexpected request '+target);return {url:target,text:map[target]};});
 assert.deepEqual(requests,Object.keys(map));assert.equal(result.url,origin+'/wz/bbs/060.html');
 const rows=splitPeriods(result.text);assert.ok(rows.length>30);assert.equal(rows[0].issue,'263');assert.equal(rows.at(-1).issue,'302');assert.ok(!rows.some(r=>r.issue==='303'));
 assert.equal(parsePrediction(rows[0].raw,'杀半头').valid,true);
});
test('only literal document writes are decoded, expressions are never evaluated',()=>{
 assert.equal(staticDocumentWrites('document.write("<iframe src=\"/x\"></iframe>")'),'');
 const output=staticDocumentWrites('document.writeln("<b>safe</b>");document.write("\\u4e00\\x32");document.write(runCode());');
 assert.equal(output,'<b>safe</b>\n一2');
 assert.equal(staticDocumentWrites('document.write(`unsafe ${runCode()}`)'),'');
});
test('cross-origin frames are not followed',async()=>{
 const targets=[];await assert.rejects(resolveModule({url,text:'<iframe src="http://127.0.0.1/private"></iframe><iframe src="https://other.example/a"></iframe>'},{sample,name:'东方不败',kind:'杀半头'},async target=>{targets.push(target);throw Error('forbidden');}));assert.equal(targets.length,0);
});
test('half-head means head and parity together, not an entire head',()=>{
 assert.equal(inferKind('东方不败【绝杀半头】'),'杀半头');
 const p={kind:'杀半头',parsed:parsePrediction(sample,'杀半头')};
 assert.deepEqual(p.parsed.values,['0头双','3头单']);
 for(const number of [9,38,17])assert.equal(evaluate(p,{number}).status,'win');
 for(const number of [2,4,31,39])assert.equal(evaluate(p,{number}).status,'loss');
 assert.equal(parsePrediction(sample,'杀头').valid,false);
});
