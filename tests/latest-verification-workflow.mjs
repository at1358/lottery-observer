import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/(?:127\.0\.0\.1|localhost):5\d{3}$/.test(base||''))throw Error('Isolated localhost QA required');let cookie='';
async function api(route,data,status=200){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),v=await r.json();assert.equal(r.status,status,route+':'+JSON.stringify(v));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return v;}
await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite')),today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
// Reproduce an old stored source whose full segment table was inside its last
// original record. Its live URL now redirects, but rechecking must stay offline.
const niu=await api('source',{name:'QA 无敌牛哥离线复核',kind:'杀段',year:2026,url:'',selector:'auto',interval:60,enabled:false});
await api('crawl',{id:niu.id,text:'302期绝杀一段【七段】\n303期绝杀一段【七段】\n304期绝杀一段【二段】'});
const old=db.prepare('SELECT * FROM predictions WHERE source_id=? ORDER BY issue').all(niu.id),mapping=Array.from({length:7},(_,i)=>`${i+1}段-- `+Array.from({length:7},(_,j)=>String(i*7+j+1).padStart(2,'0')).join('.')).join('\n');
db.prepare('UPDATE predictions SET raw=? WHERE id=?').run(old[2].raw+'\n'+mapping,old[2].id);
db.prepare('UPDATE sources SET url=?,error=? WHERE id=?').run('https://qa-articles.example/unrelated.html','来源临时跳转到其他站点',niu.id);
const original=db.prepare('SELECT raw,first_seen FROM predictions WHERE id=?').get(old[2].id);
let draw=await api('draw',{year:2026,issue:302,number:45,zodiac:'狗',drawnAt:'2026-10-29T21:35:00+08:00'});
assert.equal(draw.verification.trigger,'draw');assert.ok(draw.verification.restored>=3);
let state=await api('state?source='+niu.id);assert.equal(state.rows.find(p=>p.issue==='302').verdict.status,'loss');
await api('draw',{year:2026,issue:303,number:17,zodiac:'虎',drawnAt:'2026-10-30T21:35:00+08:00'});
await api('draw',{year:2026,issue:304,number:21,zodiac:'狗',drawnAt:'2026-10-31T21:35:00+08:00'});
const report=await api('recheck',{source:niu.id});assert.equal(report.settled,3);assert.equal(report.loss,1);assert.equal(report.win,2);assert.equal(report.review,0);assert.equal(report.restored,0);
assert.deepEqual(db.prepare('SELECT raw,first_seen FROM predictions WHERE id=?').get(old[2].id),original);
draw=await api('draw',{year:2026,issue:304,number:8,zodiac:'羊',drawnAt:'2026-10-31T21:35:00+08:00'});assert.equal(draw.verification.trigger,'draw');assert.equal((await api('state?source='+niu.id)).rows.find(p=>p.issue==='304').verdict.status,'loss');
const unchanged=await api('draw',{year:2026,issue:304,number:8,zodiac:'羊',drawnAt:'2026-10-31T21:35:00+08:00'});assert.equal(unchanged.unchanged,true);assert.equal(unchanged.verification.trigger,'draw');
const config=(await api('state')).drawSource;await api('settings',{key:'drawSource',value:{enabled:false,url:'https://qa-articles.example/draws.json'}});
assert.equal((await api('draw-sync',{})).verification[0].trigger,'draw');assert.equal((await api('state?source='+niu.id)).rows.find(p=>p.issue==='302').verdict.status,'win');await api('settings',{key:'drawSource',value:config});
// Refresh two selected sources, then choose the newest collected issue. An old
// common issue cannot hide a missing current filter.
const numbers=Array.from({length:30},(_,i)=>String(i+1).padStart(2,'0')).join(' '),baseFile=path.join(process.env.QA_DATA_DIR,'latest-base.txt'),tailFile=path.join(process.env.QA_DATA_DIR,'latest-tail.txt');
const baseHtml=issues=>'<section><h2>QA 最新30码</h2>'+issues.map(i=>`<p>${i}期必中30码【${numbers}】</p>`).join('')+'</section>',tailHtml=issues=>'<section><h2>QA 最新杀尾</h2>'+issues.map(i=>`<p>${i}期绝杀一尾【1尾】</p>`).join('')+'</section>';
writeFileSync(baseFile,baseHtml([305]));writeFileSync(tailFile,tailHtml([305]));
const seed={year:2026,selector:'auto',interval:60,enabled:false,collectNow:true};
const a=await api('source',{...seed,name:'QA 最新30码',kind:'号码',url:'https://qa-articles.example/latest-base.html',sample:`305期必中30码【${numbers}】`}),b=await api('source',{...seed,name:'QA 最新杀尾',kind:'杀尾',url:'https://qa-articles.example/latest-tail.html',sample:'305期绝杀一尾【1尾】'});
const p=(await api('combinations/save',{name:'QA 采集后最新一期',year:2026,baseMode:'source',baseSourceId:a.id,steps:[{type:'source',sourceId:b.id,mode:'exclude'}],targetMode:'latest',calculation:{enabled:false,refreshSources:true}})).plan;
const expected=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='expectedDrawPeriods'").get().value);expected['2026-306']={year:2026,issue:'306',date:today};db.prepare("UPDATE settings SET value=? WHERE key='expectedDrawPeriods'").run(JSON.stringify(expected));
const schedule=db.prepare('SELECT next_run FROM sources WHERE id=?').get(a.id).next_run;
writeFileSync(baseFile,baseHtml([305,306]));let result=(await api('combinations/calculate',{id:p.id})).result;assert.equal(result.issue,'306');assert.equal(result.status,'blocked');assert.ok(result.errors.some(e=>e.includes('306')));assert.deepEqual(result.numbers,[]);
writeFileSync(tailFile,tailHtml([305,306]));result=(await api('combinations/calculate',{id:p.id})).result;assert.equal(result.issue,'306');assert.equal(result.status,'complete');assert.equal(result.total,27);assert.ok(!result.numbers.includes(1)&&!result.numbers.includes(11)&&!result.numbers.includes(21));assert.equal(result.collection.length,2);assert.ok(result.collection.every(c=>c.status==='success'));assert.equal(db.prepare('SELECT next_run FROM sources WHERE id=?').get(a.id).next_run,schedule);
// Refresh failure cannot be represented as a successful calculation from old data.
db.prepare('UPDATE sources SET url=?,content_url=? WHERE id=?').run('https://qa-articles.example/unrelated.html','',b.id);
result=(await api('combinations/calculate',{id:p.id})).result;assert.equal(result.status,'blocked');assert.deepEqual(result.numbers,[]);assert.ok(result.errors.some(e=>e.includes('跨站跳转')));
const snapshot=readFileSync(baseFile,'utf8');writeFileSync(baseFile,baseHtml([305,306,307]));
const offline=(await api('combinations/save',{...p,calculation:{...p.calculation,refreshSources:false}})).plan;
result=(await api('combinations/calculate',{id:offline.id})).result;assert.equal(result.issue,'306');assert.equal(result.status,'complete');writeFileSync(baseFile,snapshot);
// The same live refresh and latest-issue selection also run from the timer.
db.prepare('UPDATE sources SET url=? WHERE id=?').run('https://qa-articles.example/latest-tail.html',b.id);
const timed=(await api('combinations/save',{...offline,calculation:{enabled:true,time:'00:00',refreshSources:true},cutoff:'23:59'})).plan;
writeFileSync(baseFile,baseHtml([305,306,307]));writeFileSync(tailFile,tailHtml([305,306,307]));expected['2026-307']={year:2026,issue:'307',date:today};db.prepare("UPDATE settings SET value=? WHERE key='expectedDrawPeriods'").run(JSON.stringify(expected));
db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify({nextCalc:'2000-01-01T00:00:00.000Z'}),'combinationRuntime:'+timed.id);
assert.ok((await api('tick',{})).combinations.calculated>=1);const latest=(await api('combinations?plan='+p.id)).results[0];assert.equal(latest.issue,'307');assert.equal(latest.status,'complete');
await api('combinations/save',{...timed,calculation:{...timed.calculation,enabled:false}});
db.close();console.log('PASS: offline legacy-column recheck despite redirect; draw arrival/correction triggers automatic verification; refresh-before-calculation, latest-period missing-data blocking, refresh failure blocking, independent source schedule and scheduled refresh.');
