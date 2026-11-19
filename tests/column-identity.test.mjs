import test from 'node:test';
import assert from 'node:assert/strict';
import {explicitAuthorColumn} from '../lib/column-identity.mjs';
import {extractModule} from '../lib/extract.mjs';
import {discoverEntry} from '../lib/entry-navigation.mjs';

const identity='五脏六腑【36码中特】',name='【36码中特】火爆全网作者:五脏六腑',reverse='作者：五脏六腑【36码中特】火爆全网';
const numbers=Array.from({length:36},(_,i)=>String(i+1).padStart(2,'0')).join(' '),sample='312期:【36码中特】'+numbers+' 开:？00准';
const topic=(author,id)=>`<div id="${id}"><div class="title">精华贴312期【36码中特】火爆全网</div><div class="topic-author">作者:${author}</div><div class="topic-content"><p>${sample}</p></div></div>`;

test('explicit author fields normalize either headline order without retaining promotional text',()=>{
 for(const value of [name,reverse,'【36码中特】火爆全网作者： 五脏六腑 '])assert.equal(explicitAuthorColumn(value),identity);
 assert.equal(explicitAuthorColumn('【36码中特】火爆全网作者:另一作者'),'另一作者【36码中特】');
});

test('names without one complete explicit author and column stay unchanged',()=>{
 for(const value of [identity,'【36码中特】火爆全网','【36码中特】火爆全网作者五脏六腑','作者:五脏六腑','作者:【36码中特】','【36码中特】作者:甲 作者:乙','【36码中特】【24码中特】作者:五脏六腑'])assert.equal(explicitAuthorColumn(value),value);
});

test('a full explicit author headline uniquely selects that author despite identical issue samples',()=>{
 const html=topic('另一作者','wrong')+topic('五脏六腑','correct');
 for(const configuredName of [name,reverse]){
  const result=extractModule(html,{name:configuredName,kind:'36码',sample});
  assert.equal(result.selector,'#correct');assert.equal(result.identity,identity);
 }
});

test('stored explicit author identity relocates to its canonical heading and rejects another author',()=>{
 const page='<section id="moved"><h2>'+identity+'</h2><p>'+sample+'</p></section>',options={name,kind:'36码',sample,selector:'#old',identity:reverse};
 const result=extractModule(page,options);assert.equal(result.selector,'#moved');assert.equal(result.identity,identity);assert.equal(result.relocated,true);
 assert.throws(()=>extractModule(page.replace('五脏六腑','另一作者'),options),/未找到唯一|位置已变化|身份/);
});

test('genuinely repeated author and column identities still reject identical samples',()=>{
 assert.throws(()=>extractModule(topic('五脏六腑','a')+topic('五脏六腑','b'),{name,kind:'36码',sample}),/多个栏目|重复/);
});

test('a verified topic path and author selector follow only that published path through an authorless same-title menu',async()=>{
 const entry='https://entry.example/',target='https://entry.example/topic/123.html',menu='<a href="/topic/999.html">312期【36码中特】火爆全网</a><a href="/topic/123.html">312期【36码中特】火爆全网</a>';
 const options={name,keyword:'36码中特',kind:'36码',sample,contentPath:'/topic/123.html',identity,selector:'title:'+encodeURIComponent(identity)};
 let author='五脏六腑',calls=[];
 const download=async url=>{calls.push(url);assert.ok(url===entry||url===target,'must only follow the verified published topic');return {url,text:url===entry?menu:topic(author,'')};};
 const result=await discoverEntry(entry,options,download);
 assert.equal(result.url,target);assert.equal(result.identity,identity);assert.equal(result.selector,options.selector);assert.deepEqual(calls,[entry,target]);
 author='另一作者';calls=[];
 await assert.rejects(discoverEntry(entry,options,download),/栏目|正文/);assert.deepEqual(calls,[entry,target]);
 calls=[];
 await assert.rejects(discoverEntry(entry,{...options,selector:'auto'},download),/栏目|正文/);assert.deepEqual(calls,[entry,target]);
 calls=[];
 await assert.rejects(discoverEntry(entry,{...options,contentPath:''},download),/多个同名栏目/);assert.deepEqual(calls,[entry]);
});

test('menus publishing explicit authors disambiguate canonical and full names but reject genuinely repeated identities',async()=>{
 const entry='https://entry.example/',target='https://entry.example/topic/123.html',other='<a href="/topic/999.html">【36码中特】火爆全网作者:另一作者</a>',correct='<a href="/topic/123.html">作者：五脏六腑【36码中特】火爆全网</a>';
 for(const options of [{name,keyword:'36码中特'},{name:identity,keyword:identity}]){
  const calls=[],download=async url=>{calls.push(url);assert.ok(url===entry||url===target);return {url,text:url===entry?other+correct:topic('五脏六腑','')};};
  const result=await discoverEntry(entry,{...options,kind:'36码',sample},download);
  assert.equal(result.url,target);assert.equal(result.identity,identity);assert.deepEqual(calls,[entry,target]);
 }
 const calls=[];
 await assert.rejects(discoverEntry(entry,{name:identity,keyword:identity,kind:'36码',sample},async url=>{calls.push(url);return {url,text:correct+'<a href="/topic/456.html">【36码中特】火爆全网作者:五脏六腑</a>'};}),/多个同名栏目/);
 assert.deepEqual(calls,[entry]);
});
