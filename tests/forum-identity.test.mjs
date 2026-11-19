import test from 'node:test';
import assert from 'node:assert/strict';
import {extractModule} from '../lib/extract.mjs';

const author='机神传说',column='15码中特',identity=author+'【'+column+'】',numbers='07.45.17.43.47.30.06.22.26.23.31.35.03.28.40';
const raw=issue=>issue+'期:〖'+column+'〗开:??准\n'+numbers,sample=raw('324');
const forum=({name=author,issue='324',titleColumn='【'+column+'】',rows=[sample,raw('323')]}={})=>'<div class="detail_info_forum2_item"><div class="forum-head">'+issue+'期'+titleColumn+'已公开</div><div class="forum-body"><div class="container"><div class="top"><div class="top-right"><div class="author">'+name+' 发表于 <span class="time">11月19日 22:46:16</span></div></div></div><div class="buttom"><div class="content">'+rows.map(row=>'<p>'+row.replace('\n','</p><p>')+'</p>').join('')+'</div></div></div></div></div>';
const options={name:identity,kind:'15码',sample};

test('the exact forum structure learns a stable author title selector from one sample',()=>{
 for(const titleColumn of ['【'+column+'】','〖'+column+'〗']){
  const result=extractModule(forum({titleColumn}),options);
  assert.equal(result.identity,identity);assert.equal(result.selector,'title:'+encodeURIComponent(identity));
  assert.ok(result.text.includes('324期'));assert.ok(result.text.includes('323期'));assert.ok(!result.text.includes('已公开'));
 }
});

test('forum title identity survives a new issue, removed training sample, and a moved body',()=>{
 const first=extractModule(forum(),options),page='<section><div>新导航</div><article>'+forum({issue:'325',rows:[raw('325')]})+'</article></section>';
 const next=extractModule(page,{...options,selector:first.selector,identity:first.identity});
 assert.equal(next.identity,identity);assert.equal(next.selector,first.selector);assert.ok(next.text.includes('325期'));assert.ok(!next.text.includes('324期'));
 const relocated=extractModule(page,{...options,selector:'#old-location',identity:first.identity});
 assert.equal(relocated.identity,identity);assert.equal(relocated.selector,first.selector);assert.equal(relocated.relocated,true);
});

test('a forum with another author cannot reuse a previously verified identity',()=>{
 const first=extractModule(forum(),options),page=forum({name:'另一作者'});
 for(const selector of [first.selector,'auto'])assert.throws(()=>extractModule(page,{...options,selector,identity:first.identity}),/栏目|正文|身份/);
});

test('genuinely repeated forum identities still refuse automatic or stored-title selection',()=>{
 const first=extractModule(forum(),options),page=forum()+forum();
 assert.throws(()=>extractModule(page,options),/多个栏目|重复/);
 assert.throws(()=>extractModule(page,{...options,selector:first.selector,identity:first.identity}),/重复|重名/);
});

test('incomplete or ambiguous forum structures do not fabricate a confirmed author identity',()=>{
 const html=forum(),confirmed={...options,selector:'title:'+encodeURIComponent(identity),identity};
 const malformed=[html.replace('class="content"','class="other"'),html.replace('<span class="time">','<span class="other">'),html.replace('机神传说 发表于','机神传说 更新于'),html.replace('【15码中特】','【广告推荐】'),html.replace('机神传说 发表于','甲'.repeat(41)+' 发表于'),html.replace('<div class="forum-head">','<div class="forum-head">其他</div><div class="forum-head">')];
 for(const page of malformed)assert.throws(()=>extractModule(page,confirmed),/栏目|正文|身份/);
});
