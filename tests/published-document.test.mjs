import test from 'node:test';import assert from 'node:assert/strict';
import {staticDocumentWrites,materializeDocumentWrites,publishedDocumentScripts,resolveModule} from '../lib/content-resolver.mjs';
import {discoverEntry} from '../lib/entry-navigation.mjs';import {splitPeriods,parsePrediction} from '../lib/domain.mjs';
const encode=text=>`document.writeln(utf8to16(strdecode(${JSON.stringify(Buffer.from(text).toString('base64'))})));`;
const shell=(scripts)=>'<script src="https://cdn.example/static/label/label-com4-0730.js"></script><div class="cgi-body">'+scripts.map(url=>'<script src="'+url+'"></script>').join('')+'</div>';
const topic=(author,column,raw,issue='312')=>'<div><div class="title">精华贴'+issue+'期【'+column+'】火爆全网</div><div class="topic-author">作者:'+author+'</div><div class="topic-content">'+raw.split('\n').map(line=>'<p>'+line+'</p>').join('')+'</div></div>';
const raw='312期[12码中特]【10 06 30 16 14 49 01 02 04 46 29 44】开：00准',identity='再劫难逃【12码中特】';
test('published base64 writes decode UTF-8 and retain mixed literal order without executing expressions',()=>{
 assert.equal(staticDocumentWrites('document.write("<p>");'+encode('澳门白虎 🐯')+'document.write("</p>");throw new Error("never run");'),'<p>澳门白虎 🐯\n</p>');
 assert.equal(staticDocumentWrites('document.write(utf8to16(strdecode(document.cookie)));document.write(eval("throw 1"));'), '');
 assert.equal(staticDocumentWrites('document.write(utf8to16(strdecode("//8=")));'),'');
 assert.ok(materializeDocumentWrites('<script>'+encode('<p>'+raw+'</p>')+'</script>').endsWith('<p>'+raw+'</p>\n'));
});
test('only announced encoded-document scripts in the published container are followed, not analytics assets',()=>{
 const html=shell(['https://cdn.example/upload/script/11/abc123.js','https://ads.example/analytics.js','https://user:password@cdn.example/upload/script/11/abc123.js'])+'<script src="https://cdn.example/upload/script/11/def456.js"></script>';
 assert.deepEqual(publishedDocumentScripts(html,'https://site.example/').map(v=>v.url),['https://cdn.example/upload/script/11/abc123.js']);assert.deepEqual(publishedDocumentScripts(html.replace('label-com4-0730','unknown-library'),'https://site.example/'),[]);
});
test('fixed entry follows its public CDN, line menu and verified topic path; author identity survives issue and host changes',async()=>{
 let host='first.example',issue='312',calls=[];
 const download=async url=>{calls.push(url);if(url==='https://entry.example/')return {url,text:shell(['https://cdn.example/upload/script/11/aaa.js'])};if(url==='https://cdn.example/upload/script/11/aaa.js')return {url,text:encode('<a href="https://'+host+'/">线路①点击进入</a>')};if(url==='https://'+host+'/')return {url,text:shell(['https://cdn.example/upload/script/11/bbb.js'])};if(url==='https://cdn.example/upload/script/11/bbb.js')return {url,text:encode('<a href="/topic/999.html">312期【12码中特】</a><a href="/topic/123.html">312期【12码中特】</a>')};if(url==='https://'+host+'/topic/123.html')return {url,text:shell(['https://cdn.example/upload/script/11/ccc.js'])};if(url==='https://cdn.example/upload/script/11/ccc.js')return {url,text:encode(topic('再劫难逃','12码中特',raw.replace('312期',issue+'期'),issue))};throw Error('Unannounced or wrong-author URL: '+url);};
 const options={name:'12码中特澳门白虎',kind:'号码',keyword:'12码中特',sample:raw,contentPath:'/topic/123.html',identity,selector:'auto'};
 const first=await discoverEntry('https://entry.example/',options,download);assert.equal(first.identity,identity);assert.equal(first.url,'https://first.example/topic/123.html');assert.ok(first.selector.startsWith('title:'));assert.equal(splitPeriods(first.text).length,1);assert.equal(parsePrediction(splitPeriods(first.text)[0].raw,'号码',options.name).values.length,12);assert.ok(calls.every(url=>!url.includes('999')));
 host='second.example';issue='313';calls=[];const next=await discoverEntry('https://entry.example/',{...options,selector:first.selector},download);assert.equal(next.identity,identity);assert.equal(splitPeriods(next.text)[0].issue,'313');assert.equal(next.url,'https://second.example/topic/123.html');
 await assert.rejects(discoverEntry('https://entry.example/',{...options,contentPath:'/topic/777.html'},download),/未找到/);assert.ok(calls.every(url=>!url.includes('/topic/777.html')));
});
test('same-title topics with a different author are rejected after collection identity is stored',async()=>{
 const html=topic('其他作者','12码中特',raw),url='https://site.example/topic/123.html';
 await assert.rejects(resolveModule({url,text:html},{name:'12码中特澳门白虎',kind:'号码',sample:raw,selector:'title:'+encodeURIComponent(identity),identity,identityAliases:['12码中特']},()=>{throw Error('Unexpected resource');}),/栏目|正文/);
});
test('ordinary sites retain strict ambiguity refusal without a verified topic path',async()=>{
 await assert.rejects(discoverEntry('https://site.example/',{name:'12码中特',keyword:'12码中特',kind:'号码',sample:raw},async url=>({url,text:'<a href="/topic/1.html">12码中特</a><a href="/topic/2.html">12码中特</a>'})),/多个同名栏目/);
});
