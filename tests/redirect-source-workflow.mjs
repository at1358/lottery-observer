import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import path from 'node:path';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||''))throw Error('Isolated QA only');let cookie='';
async function api(route,data,status=200){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),value=await r.json();assert.equal(r.status,status,route+':'+JSON.stringify(value));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return value;}
const dir=process.env.QA_DATA_DIR,write=(name,body)=>writeFileSync(path.join(dir,name),body),db=new DatabaseSync(path.join(dir,'observer.sqlite'));
await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
write('redirect-destination.txt','https://qa-landing-one.example/_1491_.app#1491');
const html=(issue,codes,extra='')=>'<section><h2>QA 跳转入口【推荐号码】</h2><p>'+issue+'期推荐号码【'+codes+'】</p>'+extra+'</section>';
write('redirect-column.html',html(309,'02 03 06'));
const input={name:'QA 跳转入口【推荐号码】',url:'http://qa-redirect.example/',entry_mode:'redirect',entry_keyword:'',entry_line:'旧线路名称不参与跳转',kind:'号码',year:2078,sample:'309期推荐号码【02 03 06】',selector:'auto',interval:120,schedule_mode:'interval',enabled:true,collectNow:true};
await api('source',{...input,entry_keyword:'a'.repeat(101)},400);await api('source',{...input,entry_mode:'unknown'},400);
const preview=await api('preview',input);assert.equal(preview.total,1);assert.match(preview.contentUrl,/qa-landing-one/);assert.ok(preview.navigation.some(p=>p.url.includes('_1491_')));
const saved=await api('source',input);assert.equal(saved.enabled,true);assert.equal(saved.inserted,1);
let source=(await api('state')).sources.find(s=>s.id===saved.id);assert.equal(source.entry_mode,'redirect');assert.equal(source.url,input.url);assert.equal(source.entry_keyword,'');
let first=(await api('state?source='+saved.id)).rows.find(p=>p.issue==='309');
write('redirect-destination.txt','https://qa-landing-two.example/_1491_latest_.app#1491');write('redirect-column.html',html(309,'02 03 06','<p>310期推荐号码【10 11 12】</p>'));
await api('crawl',{id:saved.id});source=(await api('state')).sources.find(s=>s.id===saved.id);assert.match(source.content_url,/qa-landing-two/);assert.equal(source.url,input.url);assert.equal(source.entry_mode,'redirect');
const archive=db.prepare('SELECT raw,first_seen FROM predictions WHERE id=?').get(first.id);assert.equal(archive.raw,first.raw);assert.equal(archive.first_seen,first.first_seen);
assert.equal(db.prepare('SELECT COUNT(*) count FROM predictions WHERE source_id=?').get(saved.id).count,2);assert.equal((await api('crawl',{id:saved.id})).inserted,0);
// Failure must not silently fall back to a previously successful transient URL.
write('redirect-destination.txt','http://127.0.0.1/admin');await api('crawl',{id:saved.id},400);assert.equal(db.prepare('SELECT COUNT(*) count FROM predictions WHERE source_id=?').get(saved.id).count,2);
const after=(await api('state')).sources.find(s=>s.id===saved.id);assert.match(after.error,/内部地址/);assert.match(after.content_url,/qa-landing-two/);
write('redirect-destination.txt','https://qa-landing-two.example/_1491_latest_.app#1491');await api('crawl',{id:saved.id});
assert.ok(JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('sourceNavigation:'+saved.id).value).steps.some(s=>s.url.includes('qa-landing-two')));db.close();
console.log('PASS: redirect option without mandatory keyword or line, published HTTP jump, changed destination discovery, first archive preservation, deduplication, URL guard and recovery.');
