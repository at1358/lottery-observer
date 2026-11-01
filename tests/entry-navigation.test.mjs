import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationLinks,discoverEntry} from '../lib/entry-navigation.mjs';
const options={name:'无敌牛哥【绝杀一段】',kind:'杀段',keyword:'无敌牛哥',sample:'305期:绝杀一段【六段】开:？00准',selector:'auto',autoRelocate:true};
const content='<div class="column"><h2>无敌牛哥【绝杀一段】</h2><p>305期:绝杀一段【六段】开:？00准</p><p>306期:绝杀一段【四段】开:？00准</p></div>';
test('published fixed-entry JSON line list excludes unrelated portal links and respects chosen line',()=>{
 const data={quick:[{title:'线路入口①',url:'https://line1.example/'},{title:'线路入口②',url:'https://line2.example/'}]};
 const html='<a href="https://ads.example/">广告</a><script>var enter=JSON.parse(atob("'+Buffer.from(JSON.stringify(data),'utf8').toString('base64')+'"))</script>';
 assert.deepEqual(navigationLinks(html,'http://portal.example/','稳杀五码','入口②').map(l=>l.url),['https://line2.example/']);
});
test('daily public dispatcher is decoded as data without executing its eval',()=>{
 const html=`<script>function d(){return new Date().getMonth()+1}l=btoa(l);j.src="https://gn"+zzSub+atob("${btoa('.jumpcdn.net')}")+"/api.2.JS?1,"+l</script>`;
 assert.equal(navigationLinks(html,'http://3845.com/','稳杀五码','',Date.parse('2026-11-02T00:00:00Z'))[0].url,'https://gn112.jumpcdn.net/api.2.JS?1,Mzg0NS5jb20v');
 const assigned=`<script>var bajm1=atob('${btoa('window.location.href=')}');var bajm2=atob('${btoa('https://+SjFanMiao+|line|example:1348/')}');bajm2=bajm2.replace(/\+SjFanMiao\+/g,SjLet(5));eval('throw something');</script>`;
 assert.match(navigationLinks(assigned,'https://dispatcher.example/','稳杀五码')[0].url,/^https:\/\/[a-f0-9]{5}\.line\.example:1348\/$/);
});
test('entry follows selected line and a document.write navigation menu to exact column',async()=>{
 const pages={'http://entry.example/':'<a href="https://line.example/">线路入口①</a>','https://line.example/':'<script src="/wz/js/amtiezi-03.js"></script>','https://line.example/wz/js/amtiezi-03.js':`document.write('<a href="/bbs/069.html">306期：无敌牛哥【绝杀一段】</a>')`,'https://line.example/bbs/069.html':content};
 const calls=[];const result=await discoverEntry('http://entry.example/',options,async url=>{calls.push(url);assert.ok(url in pages);return {url,text:pages[url]};});
 assert.equal(result.url,'https://line.example/bbs/069.html');assert.match(result.text,/306期/);assert.equal(calls.length,4);
 assert.ok(result.navigation.some(s=>s.label.includes('无敌牛哥')));
});
test('ambiguous same-name columns stop without choosing either',async()=>{
 await assert.rejects(discoverEntry('http://entry.example/',options,async url=>({url,text:'<a href="/a">无敌牛哥</a><a href="/b">无敌牛哥</a>'})),/多个同名栏目/);
});
test('unrelated redirects cannot succeed without matching column; budget and URL validation remain enforced',async()=>{
 let count=0;await assert.rejects(discoverEntry('http://entry.example/',options,async url=>{count++;return {url,text:'广告首页'};},{maxRequests:2}),/未找到/);assert.equal(count,1);
 const links=navigationLinks('<a href="javascript:alert(1)">线路入口</a><a href="file:///etc/passwd">无敌牛哥</a>','http://entry.example/','无敌牛哥');assert.deepEqual(links,[]);
 await assert.rejects(discoverEntry('http://entry.example/',options,async url=>{if(url.includes('127.0.0.1'))throw Error('禁止内部地址');return {url,text:'<a href="http://127.0.0.1/admin">线路入口</a>'};}),/禁止内部地址/);
});
