import test from 'node:test';import assert from 'node:assert/strict';
import {load} from 'cheerio/slim';
import {clientDocumentRoute,dynamicClientDocument,decodeClientResponse} from '../lib/client-document.mjs';
import {resolveModule} from '../lib/content-resolver.mjs';import {splitPeriods,parsePrediction} from '../lib/domain.mjs';
import {clientUrl,baoteUrl,clientName,clientRaw,clientScript,baotePayload,encryptedClientResponse} from './fixtures/client-document.mjs';
test('public literal column document preserves complete multiline numbers and rejects executable html',async()=>{
 const result=await resolveModule({url:clientUrl,text:clientScript()},{name:clientName,kind:'24码',sample:clientRaw},()=>{throw Error('no extra fetch');});
 assert.equal(result.identity,clientName);const rows=splitPeriods(result.text);assert.equal(parsePrediction(rows[0].raw,result.kind,clientName).values.length,24);assert.equal(parsePrediction(rows[1].raw,result.kind,clientName).valid,false);assert.match(result.text,/12】\n【13/);
 assert.throws(()=>dynamicClientDocument(clientScript().replace('G_dynamic_2031909','G_dynamic_999'),clientUrl),/格式/);
 const script="var G_dynamic_2031909_1 = JSON.parse(__ras(atob('"+Buffer.from(JSON.stringify({html:'(()=>{throw 1})()'})).toString('base64')+"')));";assert.throws(()=>dynamicClientDocument(script,clientUrl),/静态/);
});
test('moving issue in public column heading does not create an extra fake period',()=>{
 const html=dynamicClientDocument(clientScript('<div><div class="ny_tit">313期【神秘㉔码】资料已公开</div><p>'+clientRaw.replaceAll('\n','<br>')+'</p></div>'),clientUrl);assert.equal(load(html)('h2').text(),'【神秘㉔码】资料已公开');
});
test('public AES widget data retains two twelve-number lines and original displayed draw annotations',async()=>{
 const data=encryptedClientResponse(),html=decodeClientResponse(data.text,baoteUrl,data.iv),result=await resolveModule({url:baoteUrl,text:html},{kind:'24码',name:'1903兔年【24码爆特】精彩好料',sample:'313期【24码爆特】开【？00】中\n'+Array.from({length:24},(_,i)=>i+1).join(' ')},()=>{throw Error('no fetch');});
 assert.equal(splitPeriods(result.text).length,2);assert.match(result.text,/312期:【24码爆特】开【猴23】中/);assert.match(result.text,/313期:【24码爆特】开【？00】中/);for(const row of splitPeriods(result.text))assert.equal(parsePrediction(row.raw,'24码','').values.length,24);
});
test('only known public transports decode; wrong widget, incomplete data and malformed key fail closed',()=>{
 assert.equal(clientDocumentRoute('https://h8.wanpz.com.evil.example/script/901/dynamic_2031909_1.js'),null);assert.equal(clientDocumentRoute(clientUrl.replace('https:','http:')),null);assert.equal(dynamicClientDocument(clientScript(),'https://other.example/data.js'),null);assert.equal(decodeClientResponse('unchanged','https://other.example/api',''), 'unchanged');
 const encrypted=encryptedClientResponse();assert.throws(()=>decodeClientResponse(encrypted.text,baoteUrl,''),/格式/);
 for(const change of [p=>p.data[0].widgetId=99,p=>p.data[0].data.ruleId='other',p=>p.data[0].data.data[0].g.v1.pop(),p=>p.data[0].data.data[0].issue=2026312]){const p=baotePayload();change(p);const bad=encryptedClientResponse(p);assert.throws(()=>decodeClientResponse(bad.text,baoteUrl,bad.iv));}
});
