import test from 'node:test';import assert from 'node:assert/strict';
import {publicEntryTransports} from '../lib/entry-transports.mjs';import {navigationLinks,discoverEntry} from '../lib/entry-navigation.mjs';import {extractModule} from '../lib/extract.mjs';import {parsePrediction,splitPeriods} from '../lib/domain.mjs';import {collectedDisplayText} from '../lib/collected-display.mjs';
const dateFunction="function getDatePrefix() {var now = new Date();var month = now.getMonth() + 1;var day = now.getDate();return month + '-' + day;}",at=Date.parse('2026-11-19T16:30:00Z');
test('dated public entrance uses Beijing date and only its published literal template',()=>{
 const script=dateFunction+'function openUrl(index){const domain = "date.example";const url = `https://${getDatePrefix()}.${domain}:808/index.html#/#${index}`;return url}window.location.href=openUrl(2);throw new Error("must never run");',html='<script>'+script+'</script>';
 assert.equal(navigationLinks(html,'http://entry.example/','36码','',at)[0].url,'https://11-20.date.example:808/index.html#/#2');
 assert.deepEqual(publicEntryTransports(html.replace('"date.example"','document.cookie'),'http://entry.example/',at),[]);
 assert.deepEqual(publicEntryTransports(html.replace('now.getDate()','readSecret()'),'http://entry.example/',at),[]);
 const buttons='<button onclick="openUrl1()">线路入口</button><script>'+dateFunction+'var _ = `https://${getDatePrefix()}.date.example:8443/#2026`;function openUrl1(){window.open(_);}</script>';
 assert.equal(publicEntryTransports(buttons,'https://entry.example/',at)[0].url,'https://11-20.date.example:8443/#2026');
 for(const h of [buttons.replace('openUrl1()">','unrelated()">'),buttons.replace('var _ =','var uu="unknown";var _ =')])assert.deepEqual(publicEntryTransports(h,'https://entry.example/',at),[]);
});
test('origin bridge encodes the public source URL and path without forwarding browser state',()=>{
 const html='<a href="" id="hao123"></a><script>var strU="https://bridge.example/?u="+window.location+"&p="+window.location.pathname+window.location.search;hao123.href=strU;document.getElementById("hao123").dispatchEvent(e);</script>',source='http://entry.example/article?q=1&name=two';
 const [link]=publicEntryTransports(html,source),u=new URL(link.url);assert.equal(u.origin,'https://bridge.example');assert.deepEqual(Object.fromEntries(u.searchParams),{u:source,p:'/article?q=1&name=two'});
 assert.deepEqual(publicEntryTransports(html.replace('+window.location+','+document.cookie+'),source),[]);
});
const binary=text=>[...text].map(c=>c.charCodeAt(0).toString(2).padStart(8,'0')).join('');
const binaryPage=value=>'<script>const level3urlBinary="'+value+'";const byte=level3urlBinary.substring(i, i + 8);level3url += String.fromCharCode(parseInt(byte, 2));window.location.href=urls[0].url;</script>';
const binaryList=values=>'<script>var urlArray = '+JSON.stringify(values)+';var selectedUrl = urlArray[randomIndex];var str=selectedUrl.substr(i, 8);var n=parseInt(str, 2);StrHex=StrHex+String.fromCharCode(n);window.location.href = _;</script>';
test('published binary byte URLs are decoded without countdown execution, expressions or credentials',()=>{
 assert.equal(publicEntryTransports(binaryPage(binary('https://route.example/two')),'https://entry.example/')[0].url,'https://route.example/two');
 assert.deepEqual(publicEntryTransports(binaryList([binary('https://a.example/'),binary('https://b.example/')]),'https://entry.example/').map(l=>l.url),['https://a.example/','https://b.example/']);
 for(const h of [binaryPage('111'),binaryPage(binary('javascript:alert(1)')),binaryPage(binary('https://user:pass@route.example/')),binaryPage(binary('https://route.example/')).replace('parseInt(byte, 2)','readSecret()'),binaryList(Array(9).fill(binary('https://route.example/')))])assert.deepEqual(publicEntryTransports(h,'https://entry.example/'),[]);
});
test('literal escaped redirects and narrowly named directory scripts reach a public article',async()=>{
 const target='https://body.example/',hex=JSON.stringify(target).replace(/[a-z:/\.]/gi,c=>'\\x'+c.charCodeAt(0).toString(16).padStart(2,'0'));
 const pages={'http://entry.example/':'<script>window.location='+hex+'</script>',[target]:'<script src="/ldcd2.js"></script>',[target+'ldcd2.js']:"document.write('<a href=\"/article\">作者【12码】</a>')",[target+'article']:'<section><h2>作者【12码】</h2><p>323期12码【01 02 03 04 05 06 07 08 09 10 11 12】</p></section>'};
 const r=await discoverEntry('http://entry.example/',{name:'作者【12码】',keyword:'作者',kind:'号码',sample:'323期12码【01 02 03 04 05 06 07 08 09 10 11 12】'},async url=>{assert.ok(url in pages,url);return {url,text:pages[url]};});assert.equal(r.url,target+'article');
 const links=navigationLinks('<script src="/zy/zy.js"></script><script src="/ldcd2.js"></script><script src="/analytics.js"></script><script src="https://ads.example/ldcd2.js"></script>','https://body.example/','作者');assert.deepEqual(links.map(l=>l.url),['https://body.example/zy/zy.js','https://body.example/ldcd2.js']);
});
const numbers=Array.from({length:36},(_,i)=>String(i+1).padStart(2,'0')).join(' '),raw='323期【36码中特】开？00准\n'+numbers;
const article=(author='千钧一发',body=raw)=>'<div><div class="big-tit"><h2>澳彩资源【36码中特】→免费发表</h2><p>作者：'+author+'</p></div><div class="big-con"><p>'+body.replaceAll('\n','<br>')+'</p></div></div>';
test('sibling article author and heading provide a stable identity that rejects a changed author',()=>{
 const options={name:'澳彩资源【36码中特】作者：千钧一发',kind:'36码',sample:raw},first=extractModule(article(),options);assert.equal(first.identity,'千钧一发【36码中特】');assert.ok(first.selector.startsWith('title:'));
 const next=extractModule('<aside>new menu</aside>'+article('千钧一发',raw.replace('323期','324期')),{...options,selector:first.selector,identity:first.identity});assert.match(next.text,/324期/);assert.ok(!next.text.includes('new menu'));
 assert.throws(()=>extractModule(article('其他作者'),{...options,selector:first.selector,identity:first.identity}),/位置已变化|未找到|身份/);
});
test('nested published article heading survives outer layout movement and keeps its own records',()=>{
 const title='南馆潇湘【36码特围】',body=raw.replaceAll('36码中特','原创36码特围'),html='<div class="box pad"><div class="big-con"><div class="big-tit"><h1>'+title+'资料已公开</h1><p>不保留大量往期记录</p></div><p>'+body.replaceAll('\n','<br>')+'</p></div></div>',options={name:title,kind:'36码',sample:body},first=extractModule(html,options);
 assert.equal(first.identity,title);assert.ok(first.selector.startsWith('title:'));assert.match(extractModule('<div>menu moved</div>'+html,{...options,selector:first.selector,identity:first.identity}).text,/323期/);
});
test('published three-head numbers keep group lines and genuine duplicates or zero placeholders stay invalid',()=>{
 const good='314期【天线宝宝独家心水】开\n鼠31\n准\n【三头15码】\n4头:41.40.43.42.45\n3头:33.31.32.35.36\n2头:22.20.21.23.25',p=parsePrediction(good,'15码','澳门天线宝宝【三头15码】');assert.equal(p.valid,true);assert.equal(p.values.length,15);assert.ok(!p.values.includes(4));
 const bad='313期【三头15码】开鼠43准\n3头:30.31.23.34.35\n2头:20.21.23.24.28\n4头:42.41.43.40.46';assert.equal(parsePrediction(bad,'15码').valid,false);
 assert.equal(parsePrediction('324期必出36码开發00准\n'+Array(36).fill('00').join('.'),'36码').valid,false);
 const formatted=collectedDisplayText({raw:good.replaceAll('\n','\n\n\n\n'),parsed:p,kind:'15码',name:'三头15码'});assert.ok(!formatted.includes('\n\n\n'));assert.match(formatted,/4头:41.40.43.42.45/);assert.equal(splitPeriods(formatted).length,1);
});
test('entity-encoded issue headers are recognized before looking for navigation links',async()=>{
 const raw='314期【三头15码】开鼠31准\n4头:41.40.43.42.45\n3头:33.31.32.35.36\n2头:22.20.21.23.25',body='<section><h2>天线宝宝【三头15码】</h2><p>'+raw.replaceAll('\n','<br>')+'</p></section>',encoded=body.replace(/[0-9期]/g,c=>'&#'+c.charCodeAt(0)+';');let calls=0;
 const r=await discoverEntry('https://body.example/',{name:'天线宝宝【三头15码】',keyword:'三头15码',kind:'15码',sample:raw},async url=>{calls++;return {url,text:encoded};});assert.equal(calls,1);assert.equal(parsePrediction(splitPeriods(r.text)[0].raw,'15码').values.length,15);
});
test('public frame ID is carried from its own holder and only used by the exact same-site loader',async()=>{
 const loader='function init(name){var iframeId=generateIframeId(name),path = name.endsWith(".html") ? name : name + ".html";loadIframe(iframeId, path);}function loadIframe(id,url){el && (el.src = url);}function bootIframe(){var el=document.querySelector(".i_con");if (el) init(el.id);}',body='<section><h2>作者【36码中特】</h2><p>'+raw.replaceAll('\n','<br>')+'</p></section>',pages={'https://entry.example/':'<div class="i_con" id="index1"></div><script src="/ldcd2.js"></script>','https://entry.example/ldcd2.js':loader,'https://entry.example/index1.html':'<a href="/column">作者【36码中特】</a>','https://entry.example/column':body};
 const r=await discoverEntry('https://entry.example/',{name:'作者【36码中特】',keyword:'作者',kind:'36码',sample:raw},async url=>{assert.ok(url in pages,url);return {url,text:pages[url]};});assert.equal(r.url,'https://entry.example/column');
 assert.deepEqual(navigationLinks('<script>'+loader+'</script>','https://entry.example/','作者'),[]);assert.deepEqual(navigationLinks('<script>'+loader+'</script>','https://entry.example/','作者','',at,true,'../../private'),[]);
 const directories=navigationLinks('<script src="/cjjgf/gsb03.js"></script><script src="/cjjgf/ads.js"></script>','https://entry.example/','作者');assert.deepEqual(directories.map(l=>l.url),['https://entry.example/cjjgf/gsb03.js']);
});
test('text-only article heading and anonymous published forum headline retain stable column identities',()=>{
 const title='沧笙踏歌【36码中特】',page='<div><div class="big-tit">沧笙踏歌<font>【36码中特】</font></div><div class="qingchu">不保留大量往期记录</div><div class="neirong-txt"><p>'+raw.replaceAll('\n','<br>')+'</p></div></div>',first=extractModule(page,{name:title,kind:'36码',sample:raw});assert.equal(first.identity,title);assert.ok(first.selector.startsWith('title:'));assert.equal(extractModule(page.replace('323期','324期'),{name:title,kind:'36码',sample:raw,selector:first.selector,identity:first.identity}).identity,title);
 const forum='<div class="detail_info_forum2_item"><div class="forum-head">324期:熊出没〖36码中特〗彩民推荐</div><div class="forum-body"><div class="container"><div class="top"><div class="top-right"><div class="author">发表于 <span class="time">11月20日</span></div></div></div><div class="buttom"><div class="content"><p>'+raw.replaceAll('\n','<br>')+'</p></div></div></div></div></div>',r=extractModule(forum,{name:'熊出没【36码中特】',kind:'36码',sample:raw});assert.equal(r.identity,'熊出没【36码中特】');assert.ok(r.selector.startsWith('title:'));
 assert.throws(()=>extractModule(forum.replace('熊出没','另一作者'),{name:'熊出没【36码中特】',kind:'36码',sample:raw,selector:r.selector,identity:r.identity}),/位置已变化|未找到|身份/);
});
