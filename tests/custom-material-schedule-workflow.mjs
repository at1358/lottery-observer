import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const base=process.env.QA_BASE_URL;
if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||'')||!process.env.QA_CLOCK_FILE)throw Error('Isolated clocked QA required');
let cookie='';
async function api(route,data,status=200,service=false){
 const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json',...(service?{Authorization:'Bearer '+process.env.COLLECTOR_SERVICE_TOKEN}:{})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),value=await r.json();
 assert.equal(r.status,status,route+':'+JSON.stringify(value));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return value;
}
const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite')),year=2068,clock=value=>writeFileSync(process.env.QA_CLOCK_FILE,year+'-01-'+value+':00+08:00'),put=(key,value)=>db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value)),read=key=>JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value||'null'),check=id=>api('custom-materials?material='+id),run=()=>api('service',{operation:'runCustomMaterialUpdate'},200,true);
clock('04T21:44');await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
// Exercise the custom scheduler through /tick even when every network task is paused.
const protectedSettings=db.prepare("SELECT key,value FROM settings WHERE key IN ('collectionSchedule','drawSchedule','wecomPush') OR key LIKE 'combinationPlan:%'").all();
for(const {key,value} of protectedSettings){const v=JSON.parse(value);if(key.startsWith('combinationPlan:')){v.calculation.enabled=false;v.push.enabled=false;}else v.enabled=false;put(key,v);}
put('collectionSchedule',{mode:'interval',interval:60,time:'16:30',enabled:false});put('drawSchedule',{mode:'daily',interval:60,time:'21:38',enabled:false});
put('customMaterialScheduleState',{});put('customMaterialScheduleLease',0);
await api('settings',{key:'customMaterialSchedule',value:{enabled:true,time:'21:45'}});
const n1=(await api('custom-materials/save',{year,lag:1,name:'QA 每天21:45 n−1'})).plan;
const inputs=[{name:'QA 每期自创杀6码',declaredCount:6,layout:'before-issue',sourceText:'01 03 09 003期\n01 02 03 004期'},{name:'QA 每期2023七码',declaredCount:7,referenceYear:2023,layout:'draw-seven',sourceText:'003期 01 02 03 04 05 06 + 07 马/金 003期 兔40\n004期 01 02 03 04 05 06 + 07 牛/金 004期 羊08'},{name:'QA 每期2022七码',declaredCount:7,referenceYear:2022,layout:'draw-seven',sourceText:'003期 03 04 05 06 07 08 + 09 牛/金 003期 鼠43\n004期 08 09 10 11 12 13 + 14 猴/金 004期 牛06'}];
const kills=[];for(const input of inputs)kills.push((await api('custom-materials/save',{type:'manual-kill',year,...input})).plan);
const putDraw=(issue,number,zodiac)=>api('draw',{year,issue,number,zodiac,drawnAt:year+'-01-'+String(issue).padStart(2,'0')+'T13:38:00Z',drawDate:year+'-01-'+String(issue).padStart(2,'0')});
await putDraw(1,8,'羊');await putDraw(2,2,'牛');
const first=(await check(n1.id)).rows.find(r=>r.issue==='002'),killOriginals=kills.map(p=>read('customMaterialRows:'+p.id).rows.map(r=>({issue:r.issue,raw:r.raw,rawLines:r.rawLines,firstSeen:r.firstSeen,generatedAt:r.generatedAt}))),originalPredictions=db.prepare('SELECT id,raw,first_seen FROM predictions ORDER BY id').all();
// Simulate a missed draw-arrival callback so the daily task must append and settle.
db.prepare('INSERT INTO draws(id,year,issue,number,zodiac,drawn_at,provenance,updated_at,draw_date) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),year,'003',9,'猴',year+'-01-03T13:38:00Z','isolated test draw',year+'-01-03T13:40:00Z',year+'-01-03');
assert.equal((await run()).skipped,true);assert.equal((await check(n1.id)).rows.some(r=>r.issue==='004'),false);assert.equal((await check(kills[0].id)).rows.find(r=>r.issue==='003').status,'pending');
clock('04T21:45');const attempts=await Promise.all([api('tick',{},200,true),run(),run()]),executed=attempts.map(r=>r.customMaterials||r).filter(r=>!r.skipped);assert.equal(executed.length,1);assert.equal(executed[0].failed,0);assert.ok(executed[0].added>=1);
let state=await check(n1.id);assert.equal(state.rows.find(r=>r.issue==='004').killZodiac,'虎');assert.equal(state.rows.find(r=>r.issue==='002').generatedAt,first.generatedAt);assert.equal(state.rows.find(r=>r.issue==='002').firstSeen,first.firstSeen);assert.equal(state.automation.schedule.time,'21:45');assert.equal(state.automation.nextRun,year+'-01-05T13:45:00.000Z');
for(let i=0;i<3;i++){const data=await check(kills[i].id);assert.equal(data.rows.find(r=>r.issue==='003').status,['loss','win','loss'][i]);assert.equal(data.stats.settled,1);assert.equal(data.plan.sourceText,inputs[i].sourceText);}
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE name='自建资料定时更新' AND created_at=?").get(year+'-01-04T13:45:00.000Z').n,1);
clock('04T21:46');assert.equal((await run()).skipped,true);
// Draw arrival and correction settle all three custom kills immediately, without
// waiting for the next scheduled run or trusting source-written result annotations.
clock('04T21:47');await putDraw(4,8,'羊');assert.equal((await check(n1.id)).rows.find(r=>r.issue==='005').killZodiac,'牛');
for(let i=0;i<3;i++){const data=await check(kills[i].id);assert.equal(data.rows.find(r=>r.issue==='004').status,['win','win','loss'][i]);assert.equal(data.stats.settled,2);}
await putDraw(4,2,'牛');for(let i=0;i<3;i++){const data=await check(kills[i].id);assert.equal(data.rows.find(r=>r.issue==='004').status,['loss','loss','win'][i]);assert.equal(data.displayName,kills[i].name+' · 错误'+data.stats.loss+'期');}
for(let i=0;i<3;i++)assert.deepEqual(read('customMaterialRows:'+kills[i].id).rows.map(r=>({issue:r.issue,raw:r.raw,rawLines:r.rawLines,firstSeen:r.firstSeen,generatedAt:r.generatedAt})),killOriginals[i]);
// A single damaged column must not stop the others, and retries must be delayed.
const damagedKey='customMaterialPlan:'+kills[0].id,originalPlan=read(damagedKey);put(damagedKey,{...originalPlan,records:null});clock('05T21:45');await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});const failed=await run();assert.equal(failed.failed,1);assert.ok(failed.checked>=3);assert.equal(read('customMaterialScheduleState').lastSuccessDate,year+'-01-04');assert.equal((await check(n1.id)).automation.retryAt,year+'-01-05T13:50:00.000Z');clock('05T21:49');assert.equal((await run()).skipped,true);put(damagedKey,originalPlan);clock('05T21:50');assert.equal((await run()).failed,0);assert.equal(read('customMaterialScheduleState').lastSuccessDate,year+'-01-05');assert.equal((await run()).skipped,true);
assert.deepEqual(db.prepare('SELECT id,raw,first_seen FROM predictions ORDER BY id').all(),originalPredictions);
await api('auth/login',{username:'qa-operator',password:'Local-only-operator-Password-9276'});await api('settings',{key:'customMaterialSchedule',value:{time:'10:00'}},403);await api('auth/login',{username:'qa-viewer',password:'Reset-local-only-password-9276'});assert.equal((await api('custom-materials')).automation.schedule.time,'21:45');
for(const row of protectedSettings)db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(row.key,row.value);writeFileSync(process.env.QA_CLOCK_FILE,'');db.close();
console.log('PASS: Beijing 21:45 custom-material timer via tick, paused network schedules, missed callback recovery, append/settlement, concurrency and daily deduplication, all three manual-kill draw arrivals/corrections, immutable originals, five-minute failed-column recovery and permissions.');
