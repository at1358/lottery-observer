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

test('reading whitespace is compact while line boundaries and one blank line remain',()=>{
 const original=' \t304期:号码【01  \t02\u00a0\u00a003\u3000\u300004】 \t\r\n\u3000说明  保留\t \r\n \t\r\n\u00a0\r\u3000\r补充\t 内容\r\n\r\n结尾 \u3000';
 const row={raw:original,kind:'号码',parsed:JSON.stringify({valid:false,values:[],warnings:['待复核']}),first_seen:'2026-11-20T01:00:00Z',initial_raw:'首次占位'},before=JSON.stringify(row);
 assert.equal(collectedDisplayText(row),'304期:号码【01 02 03 04】\n说明 保留\n\n补充 内容\n\n结尾');assert.equal(JSON.stringify(row),before);
 assert.equal(collectedDisplayText({raw:' \t304期【01\t02 03】\r\n 备注\u00a0\u3000保留 ',parsed:'invalid json'}),'304期【01 02 03】\n备注 保留');
});

test('reading normalization keeps all main and defense values and the original archive',()=>{
 const original=' \t'+raw.replaceAll(' ',' \t\u00a0\u3000').replace('\n',' \t\r\n\u3000')+' \t',parsed=parsePrediction(original,'15码','暴富⑮码');
 assert.equal(parsed.valid,true);assert.equal(parsed.values.length,15);
 const row={raw:original,kind:'15码',name:'暴富⑮码',parsed,first_seen:'2026-11-20T01:00:00Z',last_seen:'2026-11-20T02:00:00Z'},before=JSON.stringify(row),display=collectedDisplayText(row);
 assert.equal(display,raw);assert.deepEqual(parsePrediction(display,row.kind,row.name),parsed);assert.equal(display.split('\n').length,2);assert.equal(JSON.stringify(row),before);
});

test('reading normalization preserves separate main and attack number groups',()=>{
 const name='诸葛孔明【主攻⑨码】',body='310期:【主攻⑨码】特开:？00准\n主:04 16 21 27 28 31 33 42 45\n攻:08 09 23 24 34 36 39 40 47',original=' \t'+body.replaceAll(' ',' \t\u00a0\u3000').replaceAll('\n',' \r\n\t')+'\r\n来源备注',parsed=parsePrediction(original,'号码',name);
 assert.equal(parsed.valid,true);assert.deepEqual(parsed.numberGroups.map(group=>[group.label,group.numbers.length]),[['主',9],['攻',9]]);
 const row={raw:original,kind:'号码',name,parsed:JSON.stringify(parsed),first_seen:'2026-11-20T01:00:00Z'},before=JSON.stringify(row),display=collectedDisplayText(row),after=parsePrediction(display,row.kind,name);
 assert.equal(display,body);assert.deepEqual(after.values,parsed.values);assert.deepEqual(after.numberGroups,parsed.numberGroups);assert.equal(JSON.stringify(row),before);
});
