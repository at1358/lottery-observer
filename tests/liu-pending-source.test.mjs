import test from'node:test';import assert from'node:assert/strict';import{incompleteCollectionMessage,collectionOutcome}from'../lib/collection-deadline.mjs';import{navigationLinks,discoverEntry}from'../lib/entry-navigation.mjs';import{extractModule}from'../lib/extract.mjs';
test('unpublished current period is distinguished from invalid current numbers without borrowing a headline issue',()=>{
 const source={year:2026,enabled:true,tracking_from:'2026-11-19T00:00:00Z',cutoff_time:'21:35'},rows=[{issue:'323',parsed:{valid:true}},{issue:'324',explicitYear:2025,parsed:{valid:true}}],original=structuredClone(rows),message=incompleteCollectionMessage(source,'324',rows);assert.match(message,/待源站更新：.*第 324 期独立资料.*最新完整为第 323 期/);assert.deepEqual(rows,original);
 assert.match(incompleteCollectionMessage(source,'324',[...rows,{issue:'324',parsed:{valid:false,warnings:['标注36码，识别到24个号码']}}]),/第 324 期资料尚不完整.*识别到24个号码/);
 assert.match(incompleteCollectionMessage(source,'324',[]),/尚未识别到/);
 const outcome=collectionOutcome(source,null,'2026-11-20',Date.parse('2026-11-20T21:36:00+08:00'));assert.equal(outcome.status,'failed');assert.match(outcome.reason,/未采集到当期资料/);
});
test('Liu public expert directory is followed while unrelated scripts remain excluded',async()=>{
 const root='https://line.example/',sample='320期：15码中特【04.05.06.18.19.20.21.22.36.37.38.39.40.45.46】开猪20中',body='<header><h1>刘半仙论坛（79576.com）高手帖</h1></header><div class="big-tit"><h1>15码中特</h1><div class="big-tits">作者：失宠的猫</div></div><div class="h10"></div><div class="big-con">'+sample+'<br>'+sample.replace('320期','324期')+'</div>',pages={[root]:'<script src="/cjlbx/gsb01.js"></script><script src="/cjlbx/ads.js"></script>',[root+'cjlbx/gsb01.js']:"document.write('<a href=\"/gsb/035.html\">324期: 刘半仙论坛【15码中特】火爆全网</a>')",[root+'gsb/035.html']:body},options={name:'刘半仙15码中特',keyword:'15码中特',kind:'15码',sample};
 const result=await discoverEntry(root,options,async url=>{assert.ok(url in pages,url);return {url,text:pages[url]};});assert.equal(result.identity,'失宠的猫【15码中特】');assert.equal(result.url,root+'gsb/035.html');assert.ok(result.selector.startsWith('title:'));assert.match(result.text,/324期/);assert.ok(!result.text.includes('高手帖'));
 const moved='<aside>new navigation</aside>'+body.replaceAll('320期','321期'),again=extractModule(moved,{...options,selector:result.selector,identity:result.identity});assert.equal(again.identity,result.identity);
 assert.throws(()=>extractModule(body.replace('失宠的猫','其他作者'),{...options,selector:result.selector,identity:result.identity}),/位置已变化|未找到|身份/);
 assert.deepEqual(navigationLinks('<script src="/cjlbx/ads.js"></script><script src="https://other.example/cjlbx/gsb01.js"></script>',root,'15码中特'),[]);
});
