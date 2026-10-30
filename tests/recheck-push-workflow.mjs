import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/(?:127\.0\.0\.1|localhost):5\d{3}$/.test(base||''))throw Error('Local QA required');
let cookie='';
async function api(route,data,expected=200){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),body=await r.json();assert.equal(r.status,expected,route+':'+JSON.stringify(body));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return body;}
await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});const adminCookie=cookie;
const source=await api('source',{name:'跨页复核验收',kind:'尾数',year:2026,url:'',selector:'auto',interval:60,enabled:false,collectNow:false});
await api('crawl',{id:source.id,text:Array.from({length:30},(_,i)=>`${i+1}期尾数【${i%2?2:7}尾】`).join('\n')});
assert.equal((await api('state?source='+source.id)).stats.pending,30);
for(let issue=1;issue<=30;issue++)await api('draw',{year:2026,issue,number:17,zodiac:'虎',drawnAt:`2026-09-${String(issue).padStart(2,'0')}T21:35:00+08:00`});
let state=await api('state?source='+source.id);assert.equal(state.rows.length,25);assert.equal(state.stats.win,15);assert.equal(state.stats.loss,15);
let report=await api('recheck',{source:source.id});assert.equal(report.total,30);assert.equal(report.settled,30);assert.equal(report.win,15);assert.equal(report.loss,15);
await api('draw',{year:2026,issue:1,number:18,zodiac:'牛',drawnAt:'2026-09-01T21:35:00+08:00'});
report=await api('recheck',{source:source.id});assert.equal(report.win,14);assert.equal(report.loss,16);
await api('draw',{year:2025,issue:1,number:17,zodiac:'虎',drawnAt:'2025-09-01T21:35:00+08:00'});assert.equal((await api('recheck',{source:source.id})).loss,16);
await api('recheck',{source:'no-such-source'},400);
// Backend defaults match the new-source form; editing leaves an explicitly paused source paused.
const defaults=await api('source',{name:'QA 默认绝杀一段',kind:'自动识别',year:2026,url:'https://qa-articles.example/shell.html?page=articles/086',sample:'287期:绝杀一段【4段】特开:猪08准',selector:'auto',interval:60,folder_id:null});
assert.equal(defaults.enabled,true);assert.equal(defaults.inserted,17);
const defaultSource=(await api('state?source='+defaults.id)).sources.find(s=>s.id===defaults.id);assert.ok(defaultSource.last_run);
await api('source',{...defaultSource,enabled:false,collectNow:false});const paused=(await api('state')).sources.find(s=>s.id===defaults.id);await api('source',{...paused,enabled:undefined,collectNow:false});assert.equal((await api('state')).sources.find(s=>s.id===defaults.id).enabled,0);
const webhook='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=qa-only-robot-key-001';
await api('wecom/save',{webhook:'https://127.0.0.1/hook',enabled:true,time:'21:40'},400);
let push=await api('wecom/save',{webhook,enabled:true,time:'00:00'});assert.equal(push.configured,true);assert.ok(!JSON.stringify(push).includes('qa-only-robot-key'));
const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite'));
// A past day's complete result must never be sent as today's new draw.
await api('draw',{year:2026,issue:366,number:17,zodiac:'虎',numbers:[8,28,40,3,38,49,17],zodiacs:[...'猪兔兔龙蛇马虎'],drawnAt:'2026-01-01T21:35:00+08:00'});
await api('wecom/send',{},400);
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
await api('draw',{year:2026,issue:366,number:17,zodiac:'虎',numbers:[8,28,40,3,38,49,17],zodiacs:[...'猪兔兔龙蛇马虎'],drawnAt:new Date(Date.now()-1000).toISOString(),drawDate:today});
let sends=await Promise.all([api('wecom/send',{}),api('wecom/send',{})]);assert.equal(sends.filter(r=>r.sent).length,1);assert.equal(sends.filter(r=>r.skipped).length,1);
assert.equal((await api('wecom/send',{})).skipped,true);assert.equal((await api('wecom')).deliveries[0].status,'sent');
let logs=readFileSync(process.env.QA_WECOM_LOG,'utf8').trim().split('\n').map(s=>JSON.parse(s));assert.equal(logs.length,1);assert.match(logs[0].body.text.content,/特码：17（虎）/);
await api('wecom/test',{});await api('wecom/test',{},400);
await api('wecom/save',{webhook:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=qa-only-robot-failure',enabled:true,time:'00:00'});
db.prepare("DELETE FROM settings WHERE key='wecomDelivery:2026:366'").run();
await api('wecom/send',{},400);assert.equal((await api('wecom')).deliveries[0].status,'failed');const beforeRetry=readFileSync(process.env.QA_WECOM_LOG,'utf8').trim().split('\n').length;assert.equal((await api('wecom/send',{})).skipped,true);assert.equal(readFileSync(process.env.QA_WECOM_LOG,'utf8').trim().split('\n').length,beforeRetry);
// Expired retry runs from the same background tick as production.
const value=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='wecomDelivery:2026:366'").get().value);value.retryAt='2026-01-01T00:00:00.000Z';db.prepare("UPDATE settings SET value=? WHERE key='wecomDelivery:2026:366'").run(JSON.stringify(value));
await api('wecom/save',{webhook,enabled:true,time:'00:00'});const tick=await api('tick',{});assert.equal(tick.push.sent,true);assert.equal((await api('tick',{})).push.skipped,true);
await api('auth/login',{username:'qa-operator',password:'Local-only-operator-Password-9276'});await api('wecom');await api('recheck',{source:source.id});await api('wecom/save',{time:'21:40',enabled:false},403);await api('wecom/test',{},403);await api('wecom/send',{},403);
cookie=adminCookie;await api('wecom/save',{clearWebhook:true,enabled:false,time:'21:40'});assert.equal((await api('wecom')).configured,false);
db.close();console.log('PASS: 30-row cross-page automatic/history rechecks, changed and cross-year draws, masked webhook, roles, current-day complete results, concurrent dedupe, retry lease, scheduled delivery and clearing configuration. All sends used a local mock.');
