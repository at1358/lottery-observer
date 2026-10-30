// Local Worker only. The fixture source deadline-e2e is seeded in the local D1 test database.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function api(path,data){const r=await fetch(base+'/api/'+path,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;}
const first=await api('history-sync',{year:2026});assert.ok(first.count>=302);
const before=await api('state?source=deadline-e2e&from=302&to=302');assert.equal(before.count,1);assert.equal(before.rows[0].verdict.status,'collection_failed');assert.equal(before.stats.settled,0);
const draw=before.draws.find(d=>d.year===2026&&d.issue==='302');assert.deepEqual(draw.numbers,[10,2,14,13,11,12,45]);assert.deepEqual(draw.zodiacs,['鸡','蛇','蛇','马','猴','羊','狗']);assert.equal(draw.draw_date,'2026-10-29');assert.equal(draw.drawn_at,null);assert.ok(before.draws.length>100);
await api('crawl',{id:'deadline-e2e',text:'302期尾数【3尾】'});
const after=await api('state?source=deadline-e2e&from=302&to=302');assert.equal(after.count,1);assert.match(after.rows[0].raw,/3尾/);assert.equal(after.rows[0].verdict.status,'collection_failed');assert.equal(after.stats.collectionFailed,1);assert.equal(after.stats.settled,0);
const repeat=await api('history-sync',{year:2026});assert.equal(repeat.changed,0);
const again=await api('state?source=deadline-e2e&from=302&to=302');assert.equal(again.count,1);assert.equal(again.rows[0].verdict.status,'collection_failed');
await api('source-toggle',{id:'deadline-e2e',enabled:false});
console.log('PASS: real 302-period history, all seven zodiac labels, date precision, more than 100 records, missing issue persisted, late data preserves failure, repeat history is idempotent.');
