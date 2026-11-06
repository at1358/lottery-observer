import test from 'node:test';import assert from 'node:assert/strict';
import {collectedDisplayText} from '../lib/collected-display.mjs';
import {extractModule} from '../lib/extract.mjs';import {parsePrediction,splitPeriods} from '../lib/domain.mjs';
const title='澳门管家婆 13349.com【暴富⑮码】',sample='307期:✈主【10 34 44】✈特开:牛42准\n防:02 06 09 14 18 21 26 30 33 38 42 45',raw='311期:✈主【04 12 48】✈特开:？00准\n防:01 02 06 13 14 18 25 26 30 37 38 49',html='<div>广告</div><div class="bfswm p-all"><div class="bg br-12"><div class="pb-head bfswm-head"><div class="pb-tit bfswm-tit">澳门管家婆 <b>13349.com</b>【暴富⑮码】</div></div><div class="bonp10"><ul class="pb-content bfswm-content br-12"><li>'+raw.replace('\n','<br>')+'</li></ul></div></div></div>';
test('a removed training issue and nested column heading recover a stable author/title selector, keeping all main and defense numbers',()=>{
 const result=extractModule(html,{selector:'#old-position',name:'暴富⑮码',kind:'15码',sample,identityAliases:[title]});assert.equal(result.identity,title);assert.ok(result.selector.startsWith('title:'));assert.equal(result.sourceRules,null);const rows=splitPeriods(result.text);assert.equal(rows.length,1);assert.equal(rows[0].issue,'311');assert.equal(parsePrediction(rows[0].raw,'15码','暴富⑮码').values.length,15);
 const again=extractModule('<div>新广告</div>'+html,{selector:result.selector,name:'暴富⑮码',kind:'15码',sample,identity:result.identity});assert.equal(again.identity,title);assert.equal(splitPeriods(again.text)[0].raw,raw);
 assert.throws(()=>extractModule(html+html,{selector:'#old-position',name:'暴富⑮码',kind:'15码',sample,identityAliases:[title]}),/重复|重名/);
});
test('auto identification may use an explicitly supplied full column identity after the sample disappears',()=>{
 const result=extractModule(html,{selector:'auto',name:'暴富⑮码',kind:'15码',sample,identityAliases:[title]});assert.equal(result.identity,title);assert.throws(()=>extractModule(html,{selector:'auto',name:'暴富⑮码',kind:'15码',sample}),/匹配/);
});
test('legacy table whitespace and verified reference footers are folded for reading without changing the archive',()=>{
 const original='             304期:绝杀一行【土行】特开:？00准\n'+ '\n'.repeat(1235)+'金：04 05 12 13 26 27 34 35 42 43\n土：06 07 20 21 28 29 36 37\n来源页脚';
 const row={raw:original,kind:'杀行',name:'全年无错【绝杀一行】',parsed:{valid:true,values:['土']}},before=JSON.stringify(row);assert.equal(collectedDisplayText(row),'304期:绝杀一行【土行】特开:？00准');assert.equal(JSON.stringify(row),before);
 assert.equal(collectedDisplayText({raw:' 305期:绝杀一行【金行】特开:？00准',kind:'杀行',parsed:{valid:true,values:['金']}}),'305期:绝杀一行【金行】特开:？00准');
 const rawWithNumbers='304期:号码【01 02 03】\n'+ '\n'.repeat(30)+'补充内容仍保留';assert.ok(collectedDisplayText({raw:rawWithNumbers,kind:'号码',parsed:{valid:true,values:[1,2,3]}}).includes('补充内容仍保留'));assert.ok(!collectedDisplayText({raw:rawWithNumbers}).includes('\n\n\n'));
});
