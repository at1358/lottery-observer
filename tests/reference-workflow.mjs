// Run after management-workflow.mjs against its isolated local QA server.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseReferencePage} from '../lib/reference-collector.mjs';
const base='http://127.0.0.1:5273';let cookie='';
async function api(path,data,expected=200){const r=await fetch(base+'/api/'+path,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});const value=await r.json();assert.equal(r.status,expected,path+': '+JSON.stringify(value));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return value;}
await api('number-reference?year=2026',undefined,401);
await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const profile=parseReferencePage(readFileSync(new URL('./fixtures/reference-2026.html',import.meta.url),'utf8'),2026);
let saved=await api('number-reference/save',profile);assert.equal(saved.coverage.zodiacs.count,49);assert.ok(saved.years.includes(2026));
await api('number-reference/save',profile,409);
const concurrent=await Promise.all(['A','B'].map(title=>fetch(base+'/api/number-reference/save',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({...saved.profile,title:'Concurrent '+title})})));
assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
saved=await api('number-reference?year=2026');assert.notEqual(saved.profile.revision,null);
await api('number-reference?year=0',undefined,400);
await api('number-reference/save',{...saved.profile,waves:{红波:[1],蓝波:[1]}},400);
await api('number-reference/save',{...saved.profile,url:'http://127.0.0.1/private'},400);
const noYear=await api('number-reference?year=2025');assert.equal(noYear.coverage.zodiacs.count,0);
for(const year of [2025,2026]){
 const s=await api('source',{name:'QA 年度波色 '+year,url:'',kind:'波色',year,selector:'auto',interval:60,enabled:false,schedule_mode:'interval'});
 await api('crawl',{id:s.id,text:'360期波色【绿波】'});
 await api('draw',{year,issue:'360',number:17,drawnAt:year+'-10-30T21:35:00+08:00'});
 const state=await api('state?source='+s.id);assert.equal(state.rows[0].verdict.status,year===2026?'win':'review');
}
let backup=await api('backup');assert.ok(backup.tables.settings.some(s=>s.key==='numberReference:2026'));
await api('auth/login',{username:'qa-viewer',password:'Reset-local-only-password-9276'});
assert.equal((await api('number-reference?year=2026')).coverage.elements.count,49);
await api('number-reference/save',saved.profile,403);await api('number-reference/preview',{year:2026,url:'https://reference.example'},403);
await api('auth/login',{username:'qa-operator',password:'Local-only-operator-Password-9276'});
await api('number-reference/save',saved.profile,403);
console.log('PASS: annual reference persistence, concurrent-edit protection, range and URL validation, role enforcement, year isolation, settlement integration and migration backups.');
