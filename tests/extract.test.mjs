import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractModule} from '../lib/extract.mjs';
const sample='097期：白小姐主攻15码 开？00准\n【01 02 03 04 05 06 07 08 09 10 11 12 13 14 15】';
const html='<html><body><section id="other"><h2>王大仙36码</h2><p>097期：36码【01 02 03】开？00准</p></section><section id="baijie"><h2>白小姐主攻15码</h2><p>098期：白小姐主攻15码 开？00准<br>【02 03 04 05 06 07 08 09 10 11 12 13 14 15 16】</p><p>'+sample.replace('\n','<br>')+'</p></section></body></html>';
test('legacy body selectors acquire an exact heading identity despite Markdown-decorated names',()=>{
 const numbers=Array.from({length:36},(_,i)=>String(i+1).padStart(2,'0')).join(' '),column='<div class="box"><div class="list-title">状元红【㊱码中特】<font>70</font><font>11</font>.com</div><table><tr><td>320期:【㊱码中特】特开:？00准<br>'+numbers+'</td></tr></table></div>',page='<div>导航</div>'+column;
 const result=extractModule(page,{name:'**状元红【㊱码中特】**7011**.com**',sample:'㊱码中特',kind:'36码',selector:'body',identityAliases:['正一真人']});assert.equal(result.identity,'状元红【㊱码中特】7011.com');assert.ok(result.selector.startsWith('title:'));assert.equal(result.relocated,true);assert.ok(!result.text.includes('导航'));
 assert.throws(()=>extractModule(page.replaceAll('状元红','另一作者'),{name:'**状元红【㊱码中特】**7011**.com**',sample:'㊱码中特',kind:'36码',selector:result.selector,identity:result.identity}),/未找到唯一|位置已变化|身份/);
});
test('one pasted issue locates matching module, excluding neighbouring authors',()=>{
 const result=extractModule(html,{sample,name:'白小姐15码',kind:'15码'});assert.equal(result.selector,'#baijie');assert.ok(result.text.includes('098期'));assert.ok(!result.text.includes('王大仙'));
});
test('stored module selector continues collecting after training issue disappears',()=>{
 const changed=html.replace(sample.replace('\n','<br>'),'099期：白小姐主攻15码<br>【02 03 04 05 06 07 08 09 10 11 12 13 14 15 16】');
 const result=extractModule(changed,{selector:'#baijie',sample,name:'白小姐15码',kind:'15码'});assert.ok(result.text.includes('099期'));assert.ok(!result.text.includes('王大仙'));
});
test('mismatched sample is rejected instead of collecting entire site',()=>{
 assert.throws(()=>extractModule(html,{sample:sample.replace('097期','123期'),name:'白小姐15码',kind:'15码'}),/没有匹配/);
 assert.equal(extractModule(html,{selector:'#missing',sample,name:'白小姐15码',kind:'15码'}).relocated,true);
 assert.throws(()=>extractModule(html,{selector:'#missing',sample,name:'白小姐15码',kind:'15码',autoRelocate:false}),/位置已变化/);
});
