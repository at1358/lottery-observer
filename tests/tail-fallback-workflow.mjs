import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||''))throw Error('Isolated QA required');let cookie='';
async function api(route,data,status=200){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),v=await r.json();assert.equal(r.status,status,route+':'+JSON.stringify(v));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return v;}
await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const name='008111.com【绝杀一尾】',file=(name,text)=>writeFileSync(path.join(process.env.QA_DATA_DIR,name),text),body=(tail='777',heading=name)=>'<section><h2>'+heading+'</h2><p>289期:绝杀一尾【555尾】开:蛇38准</p><p>311期:绝杀一尾【'+tail+'尾】开:？00准</p></section>';
file('tail-fallback-entry.html','<iframe src="/body.html"></iframe>');file('tail-fallback-body.html',body());
const initial=await api('source',{name,year:2090,kind:'杀尾',url:'https://qa-tail-fallback.example/',entry_mode:'direct',sample:'289期:绝杀一尾【555尾】开:蛇38准',selector:'auto',interval:60,enabled:false,collectNow:true});
let state=await api('state?source='+initial.id),source=state.sources.find(s=>s.id===initial.id),originals=state.rows.map(r=>[r.id,r.raw,r.first_seen]);assert.equal(source.content_url,'https://qa-tail-fallback.example/body.html');assert.equal(source.locator_identity,name);
file('tail-fallback-entry.html','<p>入口维护，没有公布栏目链接</p>');source={...source,entry_mode:'navigation',entry_keyword:name,collectNow:true};const saved=await api('source',source);assert.equal(saved.warning,null);assert.equal(saved.inserted,0);
const preview=await api('preview',source);assert.equal(preview.total,2);assert.match(preview.navigation.at(-1).label,/上次核验/);assert.equal(preview.rows.at(-1).parsed.values[0],7);
assert.equal((await api('crawl',{id:source.id})).changed,0);state=await api('state?source='+source.id);assert.deepEqual(state.rows.map(r=>[r.id,r.raw,r.first_seen]),originals);const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite'));assert.ok(db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE source_id=? AND message LIKE '%同栏目正文%'").get(source.id).n);db.close();
file('tail-fallback-body.html',body('777','冒名人【绝杀一尾】'));await api('crawl',{id:source.id},400);
file('tail-fallback-body.html',body('777','009999.com【绝杀一尾】'));await api('crawl',{id:source.id},400);
file('tail-fallback-body.html',body());file('tail-fallback-entry.html',body());const recovered=await api('preview',source);assert.equal(recovered.navigation.length,1);assert.equal(recovered.contentUrl,source.url);
console.log('PASS: fixed-entry outage with a previously verified live body, identity guards, clear navigation/audit trail, recovered entry preference and immutable repeat capture.');
