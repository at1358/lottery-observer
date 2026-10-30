import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractModule} from '../lib/extract.mjs';
const sample='097期：白小姐主攻15码 开？00准\n【01 02 03 04 05 06 07 08 09 10 11 12 13 14 15】';
const html='<html><body><section id="other"><h2>王大仙36码</h2><p>097期：36码【01 02 03】开？00准</p></section><section id="baijie"><h2>白小姐主攻15码</h2><p>098期：白小姐主攻15码 开？00准<br>【02 03 04 05 06 07 08 09 10 11 12 13 14 15 16】</p><p>'+sample.replace('\n','<br>')+'</p></section></body></html>';
test('one pasted issue locates matching module, excluding neighbouring authors',()=>{
 const result=extractModule(html,{sample,name:'白小姐15码',kind:'15码'});assert.equal(result.selector,'#baijie');assert.ok(result.text.includes('098期'));assert.ok(!result.text.includes('王大仙'));
});
test('stored module selector continues collecting after training issue disappears',()=>{
 const changed=html.replace(sample.replace('\n','<br>'),'099期：白小姐主攻15码<br>【02 03 04 05 06 07 08 09 10 11 12 13 14 15 16】');
 const result=extractModule(changed,{selector:'#baijie',sample,name:'白小姐15码',kind:'15码'});assert.ok(result.text.includes('099期'));assert.ok(!result.text.includes('王大仙'));
});
test('mismatched sample is rejected instead of collecting entire site',()=>{
 assert.throws(()=>extractModule(html,{sample:sample.replace('097期','123期'),name:'白小姐15码',kind:'15码'}),/没有匹配/);
 assert.throws(()=>extractModule(html,{selector:'#missing',sample,name:'白小姐15码',kind:'15码'}),/位置已变化/);
});
