import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveNavigationSource} from '../lib/source-resolver.mjs';
import {sourceHttpError} from '../lib/source-transport.mjs';
import {clientUrl,clientName,clientRaw,clientScript} from './fixtures/client-document.mjs';
const name='008111.com【绝杀一尾】',source={url:'https://portal.example/',content_url:'https://old-line.example/tail.html',entry_mode:'navigation',entry_keyword:name,name},options={name,kind:'杀尾',sample:'289期:绝杀一尾【555尾】开:蛇38准',identity:name,selector:'auto'},body=(title=name)=>'<section><h2>'+title+'</h2><p>289期:绝杀一尾【555尾】开:蛇38准</p><p>311期:绝杀一尾【777尾】开:？00准</p></section>';
test('a temporarily broken fixed entry can use only its previously verified same-column body',async()=>{
 const calls=[];const result=await resolveNavigationSource(source,options,async url=>({url,text:'入口暂未提供栏目'}),async url=>{calls.push(url);return {url,text:body()};});assert.equal(result.entryFallback,true);assert.deepEqual(calls,[source.content_url]);assert.equal(result.identity,name);assert.match(result.navigation[1].label,/上次核验/);assert.match(result.text,/311期/);
});
test('fallback rejects another author, missing identity, missing cached URL and incomplete records',async()=>{
 for(const html of [body('其他人【绝杀一尾】'),body('009999.com【绝杀一尾】'),'<h2>'+name+'</h2><p>311期:绝杀一尾【待公布】开:？00准</p>'])await assert.rejects(resolveNavigationSource(source,options,async url=>({url,text:'入口暂未提供栏目'}),async url=>({url,text:html})),/未通过核验/);
 let calls=0;for(const [s,o] of [[{...source,content_url:''},options],[source,{...options,identity:''}]])await assert.rejects(resolveNavigationSource(s,o,async url=>({url,text:'没有栏目'}),async()=>{calls++;throw Error('must not access');}));assert.equal(calls,0);
});
test('a recovered fixed entry takes precedence over the archived body',async()=>{
 let oldCalls=0;const result=await resolveNavigationSource(source,options,async url=>({url,text:body()}),async()=>{oldCalls++;throw Error('should not use fallback');});assert.equal(oldCalls,0);assert.equal(result.entryFallback,undefined);assert.equal(result.url,source.url);
});
test('redirect-only mode and unsafe target errors do not use an old body to hide failures',async()=>{
 let calls=0;
 await assert.rejects(resolveNavigationSource({...source,entry_mode:'redirect'},options,async url=>({url,text:'无栏目'}),async()=>{calls++;return {url:source.content_url,text:body()};}));
 await assert.rejects(resolveNavigationSource(source,options,async()=>{throw Object.assign(Error('禁止内部地址'),{code:'UNSAFE_SOURCE_URL'});},async()=>{calls++;return {url:source.content_url,text:body()};}),/禁止内部地址/);
 assert.equal(calls,0);
});
test('redirect verification can use a verified public data document only, with exact retained column identity',async()=>{
 const source={url:'http://901.com/',name:clientName,entry_mode:'redirect',content_url:clientUrl},options={kind:'24码',name:clientName,sample:clientRaw,identity:clientName},blocked=async url=>({url,text:'<title>安全验证</title>请拖动滑块'});
 const result=await resolveNavigationSource(source,options,blocked,async url=>({url,text:clientScript()}));assert.equal(result.entryFallback,true);assert.equal(result.identity,clientName);
 for(const [s,o] of [[{...source,content_url:'https://other.example/a.js'},options],[source,{...options,identity:''}],[source,{...options,identity:'其他作者【经典24码】'}]])await assert.rejects(resolveNavigationSource(s,o,blocked,async url=>({url,text:clientScript()})));
 await assert.rejects(resolveNavigationSource(source,options,async()=>{throw Object.assign(Error('unsafe'),{code:'UNSAFE_SOURCE_URL'});},async url=>({url,text:clientScript()})),/unsafe/);
});
test('a redirect entry DNS failure can use only its retained verified public document',async()=>{
 const source={url:'http://901.com/',name:clientName,entry_mode:'redirect',content_url:clientUrl},options={kind:'24码',name:clientName,sample:clientRaw,identity:clientName};let attempts=0;
 const broken=async()=>{attempts++;throw Object.assign(Error('fetch failed'),{cause:{code:'ENOTFOUND'}});};
 const result=await resolveNavigationSource(source,options,broken,async url=>({url,text:clientScript()}));assert.equal(attempts,2);assert.equal(result.entryFallback,true);assert.equal(result.identity,clientName);assert.match(result.navigation[0].label,/网络暂不可用/);
 let cachedCalls=0;for(const [s,o] of [[{...source,content_url:'https://other.example/unknown.js'},options],[source,{...options,identity:''}],[source,{...options,identity:'其他作者【经典24码】'}]])await assert.rejects(resolveNavigationSource(s,o,broken,async url=>{cachedCalls++;return {url,text:clientScript()};}));assert.equal(cachedCalls,1);
 await assert.rejects(resolveNavigationSource(source,options,async()=>{throw Object.assign(Error('fetch failed'),{cause:{code:'CERT_HAS_EXPIRED'}});},async()=>{throw Error('certificate failures cannot use fallback');}));
});
test('temporary HTTP entry outage retries once then verifies the retained public column',async()=>{
 const source={url:'http://901.com/',name:clientName,entry_mode:'redirect',content_url:clientUrl},options={kind:'24码',name:clientName,sample:clientRaw,identity:clientName};let attempts=0,direct=0;
 const broken=async()=>{attempts++;throw sourceHttpError(503);};
 const result=await resolveNavigationSource(source,options,broken,async url=>{direct++;assert.equal(url,clientUrl);return {url,text:clientScript()};});
 assert.equal(attempts,2);assert.equal(direct,1);assert.equal(result.entryFallback,true);assert.equal(result.identity,clientName);assert.match(result.text,/313期/);
 await assert.rejects(resolveNavigationSource(source,{...options,identity:'其他作者【经典24码】'},broken,async url=>({url,text:clientScript()})),/未通过核验/);
 let rejectedCalls=0;for(const status of [401,403,404,429,501])await assert.rejects(resolveNavigationSource(source,options,async()=>{throw sourceHttpError(status);},async()=>{rejectedCalls++;throw Error('must not fallback');}),new RegExp('HTTP '+status));assert.equal(rejectedCalls,0);
});
test('a transient HTTP response followed by a recovered entry does not use the retained body',async()=>{
 const source={url:'https://portal.example/',name,entry_mode:'redirect',content_url:'https://old-line.example/tail.html'};let calls=0;
 const result=await resolveNavigationSource(source,options,async url=>{if(!calls++)throw sourceHttpError(502);return {url,text:body()};},async()=>{throw Error('not needed');});assert.equal(calls,2);assert.equal(result.entryFallback,undefined);assert.equal(result.url,source.url);
});
