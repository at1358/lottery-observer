import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
const base=process.env.QA_BASE_URL;
if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||'')||!process.env.QA_CLOCK_FILE)throw Error('Isolated local QA required');
const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite'));
const clock=value=>writeFileSync(process.env.QA_CLOCK_FILE,'2026-11-05T'+value+':00+08:00');
const put=(key,value)=>db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
const read=key=>JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value||'null');
let cookie='';
async function api(route,data,expected=200,auth=cookie,service=false){
 const response=await fetch(base+'/api/'+route,{headers:{cookie:auth,'Content-Type':'application/json',...(service?{Authorization:'Bearer '+process.env.COLLECTOR_SERVICE_TOKEN}:{})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),value=await response.json();
 assert.equal(response.status,expected,route+':'+JSON.stringify(value));if(response.headers.get('set-cookie')&&auth===cookie)cookie=response.headers.get('set-cookie').split(';')[0];return value;
}
clock('11:59');await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const numbers=Array.from({length:15},(_,i)=>String(i+1).padStart(2,'0')).join(' '),raw=Array.from({length:30},(_,i)=>`${String(i+1).padStart(3,'0')}期 主攻15码【${numbers}】`).join('\n');
const source=await api('source',{name:'QA 概率15码',kind:'15码',year:2026,url:'',enabled:false,interval:60,selector:'auto'}),small=await api('source',{name:'QA 样本不足15码',kind:'15码',year:2026,url:'',enabled:false,interval:60,selector:'auto'});
await api('crawl',{id:source.id,text:raw});
for(let i=1;i<=30;i++)await api('draw',{year:2026,issue:String(i).padStart(3,'0'),number:i<=20?1:49,zodiac:'马',drawnAt:`2026-01-${String(i).padStart(2,'0')}T21:38:00+08:00`});
const custom=(await api('custom-materials/save',{type:'manual-numbers',name:'QA 自创概率15码',year:2026,declaredCount:15,sourceText:raw})).plan;
put('expectedDrawPeriods',{'2026-350':{year:2026,issue:'350',date:'2026-11-05'}});
const protectedQueries={sources:'SELECT * FROM sources ORDER BY id',originals:'SELECT * FROM predictions ORDER BY id',draws:'SELECT * FROM draws ORDER BY year,issue',plans:"SELECT key,value FROM settings WHERE key NOT LIKE 'probabilityForecast%' ORDER BY key"};
const protectedState=()=>Object.fromEntries(Object.entries(protectedQueries).map(([key,sql])=>[key,db.prepare(sql).all()]));
const before=protectedState(),run=()=>api('service',{operation:'runProbabilityForecasts'},200,'',true);
assert.equal((await run()).skipped,true);assert.equal(read('probabilityForecastCurrent'),null);
const manual=await api('probability-forecasts/refresh',{});assert.ok(manual.calculated>=3);
let pack=read('probabilityForecastCurrent'),row=pack.items['collected:'+source.id],self=pack.items['custom:'+custom.id];
assert.equal(row.samples,30);assert.equal(row.correct,65.6);assert.equal(row.error,34.4);assert.equal(self.correct,row.correct);assert.equal(self.historySamples,30);
assert.equal(pack.items['collected:'+small.id].status,'insufficient');assert.equal(pack.target.issue,'350');const manualRevision=pack.revision;
// An early manual preview cannot suppress the required noon job.
clock('12:00');const automated=await Promise.all([run(),run(),run()]);assert.equal(automated.filter(r=>r.calculated).length,1);
pack=read('probabilityForecastCurrent');assert.notEqual(pack.revision,manualRevision);const revision=pack.revision;
assert.equal((await run()).skipped,true);assert.equal(read('probabilityForecastCurrent').revision,revision);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'probabilityForecastHistory:%'").get().n,2);
assert.deepEqual(protectedState(),before);
// The actual minute-tick path also runs the forecast, independently of collection timing.
put('probabilityForecastRuntime',{});const tick=await api('tick',{},200,'',true);assert.ok(tick.probabilityForecasts.calculated>=3);
const sourceState=await api('state?view=sources');assert.equal(sourceState.sources.find(s=>s.id===source.id).probabilityForecast.correct,65.6);assert.equal(sourceState.forecastAutomation.time,'12:00');
const ranking=await api('state?view=ranking');assert.equal(ranking.rankingSummary.groups.find(g=>g.id==='numbers').rows.find(r=>r.id===source.id).probabilityForecast.correct,65.6);
assert.equal(ranking.ranking.find(r=>r.id===source.id).probabilityForecast.correct,65.6);assert.equal(row.targetDataAvailable,false);
const customState=await api('custom-materials?material='+custom.id);assert.equal(customState.probabilityForecast.correct,65.6);assert.equal(customState.items.find(p=>p.id===custom.id).probabilityForecast.samples,30);
const adminCookie=cookie;await api('users/create',{username:'probability-viewer',name:'概率只读',password:'Forecast-viewer-password-9276',role:'viewer'});
await api('auth/login',{username:'probability-viewer',password:'Forecast-viewer-password-9276'});await api('state?view=sources');await api('probability-forecasts/refresh',{},403);cookie=adminCookie;
// Failed collection history is excluded; unrelated tables stay untouched.
db.prepare('INSERT INTO collection_periods(id,source_id,year,issue,deadline_at,status,reason,finalized_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),source.id,2026,'001','2026-01-01T13:35:00.000Z','failed','QA original collection failed','2026-01-01T13:36:00.000Z');
await api('probability-forecasts/refresh',{});row=read('probabilityForecastCurrent').items['collected:'+source.id];assert.equal(row.samples,29);assert.equal(row.win,19);
// Lease contention never allows an unowned task to overwrite a forecast.
put('probabilityForecastLease',Date.parse('2026-11-05T12:10:00+08:00'));assert.equal((await api('probability-forecasts/refresh',{})).skipped,true);put('probabilityForecastLease',0);
const original=read('probabilityForecastCurrent');
await api('draw',{year:2026,issue:'350',number:1,zodiac:'马',drawnAt:'2026-11-05T12:00:00+08:00',drawDate:'2026-11-05'});
const closed=await api('state?view=sources');assert.equal(closed.sources.find(s=>s.id===source.id).probabilityForecast.status,'closed');
assert.equal((await api('probability-forecasts/refresh',{})).skipped,true);assert.deepEqual(read('probabilityForecastCurrent'),original);
// Probability refresh itself sends no messages and makes no remote model calls.
assert.equal(readFileSync(process.env.QA_WECOM_LOG,'utf8'),'');
db.close();console.log('PASS: consistent source/custom/ranking probability estimates, no future results, honest insufficient samples, noon schedule and early-manual behavior, concurrency/dedupe, original-data preservation, failed-period exclusion, read-only roles, immutable daily snapshots and post-draw expiry. No external AI or robot calls.');
