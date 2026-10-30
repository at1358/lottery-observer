import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWebhook,drawMessage,pushEligibility,postWecom} from '../lib/wecom-push.mjs';
import {inferKind} from '../lib/domain.mjs';
const webhook='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=qa-only-robot-key-001';
const at=Date.parse('2026-10-31T21:45:00+08:00'),config={webhook,time:'21:40',enabled:true};
const draw={year:2026,issue:'304',number:17,zodiac:'虎',numbers:[8,28,40,3,38,49,17],zodiacs:[...'猪兔兔龙蛇马虎'],draw_date:'2026-10-31'};
test('a numeric segment value in the sample does not hide its exclusion title',()=>{assert.equal(inferKind('东逃西散绝杀一段 287期:绝杀一段【4段】特开:猪08准'),'杀段');});
test('robot URL only accepts the official HTTPS endpoint and one key',()=>{
 assert.equal(validateWebhook(webhook),webhook);
 for(const url of ['http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abcdefgh','https://qyapi.weixin.qq.com.attacker.invalid/cgi-bin/webhook/send?key=abcdefgh','https://127.0.0.1/cgi-bin/webhook/send?key=abcdefgh',webhook+'&key=another-key',webhook+'&redirect=1',webhook+'#fragment','https://qyapi.weixin.qq.com:4433/cgi-bin/webhook/send?key=abcdefgh'])assert.throws(()=>validateWebhook(url));
});
test('daily push waits for complete current-day results and scheduled Beijing time',()=>{
 assert.equal(pushEligibility(config,draw,at),null);
 assert.match(pushEligibility({...config,enabled:false},draw,at),/暂停/);
 assert.match(pushEligibility(config,draw,at-10*60000),/尚未/);
 assert.match(pushEligibility(config,{...draw,draw_date:'2026-10-30'},at),/往期/);
 assert.match(pushEligibility(config,{...draw,draw_date:null},at),/往期/);
 assert.match(pushEligibility(config,{...draw,numbers:[8,28,40,3,38,49,0]},at),/完整/);
 assert.match(pushEligibility(config,{...draw,drawn_at:'2026-10-31T22:00:00+08:00'},at),/尚未/);
 assert.equal(pushEligibility(config,draw,at-10*60000,true),null);
 assert.equal(pushEligibility(config,{...draw,draw_date:null,drawn_at:'2026-10-31T13:35:00Z'},at),null);
});
test('message contains six regular numbers and special number in original order, with zodiac',()=>{
 const content=drawMessage(draw);assert.match(content,/2026 年第 304 期/);assert.match(content,/平码：08（猪）、28（兔）、40（兔）、03（龙）、38（蛇）、49（马）/);assert.match(content,/特码：17（虎）/);
 assert.throws(()=>drawMessage({...draw,numbers:[1,1,2,3,4,5,17]}),/完整/);
 assert.match(drawMessage({...draw,zodiacs:[]}),/生肖未提供/);
});
test('transport checks provider errcode, rejects redirect, and never leaks URL in errors',async()=>{
 await postWecom(webhook,drawMessage(draw),async(url,options)=>{assert.equal(url,webhook);assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.equal(body.msgtype,'text');assert.match(body.text.content,/特码/);return Response.json({errcode:0,errmsg:'ok'});});
 await assert.rejects(postWecom(webhook,'test',async()=>Response.json({errcode:93000,errmsg:webhook})),e=>e.message.includes('93000')&&!e.message.includes('key='));
 await assert.rejects(postWecom(webhook,'test',async()=>{throw Error(webhook);}),e=>!e.message.includes('key='));
 await assert.rejects(postWecom(webhook,'test',async()=>new Response('bad',{status:500})),/HTTP 500/);
});
