import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {DEFAULT_SCHEDULE} from '../lib/schedule.mjs';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||'')||!process.env.QA_CLOCK_FILE)throw Error('Isolated QA required');let cookie='';
async function api(route,data,status=200){const response=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),value=await response.json();assert.equal(response.status,status,route+':'+JSON.stringify(value));if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return value;}
writeFileSync(process.env.QA_CLOCK_FILE,'2089-01-01T10:00:00+08:00');await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite')),ids=[];
for(let i=0;i<3;i++)ids.push((await api('source',{name:'QA 批量时间 '+i,year:2089,kind:'杀尾',url:'',sample:'001期:绝杀一尾【555尾】开:？00准',selector:'auto',interval:60+i*60,enabled:i!==1,schedule_mode:'interval',daily_time:'16:30',cutoff_time:'21:30',collectNow:false})).id);
const read=()=>db.prepare('SELECT * FROM sources WHERE id IN (?,?,?) ORDER BY id').all(...ids),before=read(),originals=db.prepare('SELECT id,raw,first_seen FROM predictions ORDER BY id').all(),fetches=existsSync(process.env.QA_FETCH_LOG)?readFileSync(process.env.QA_FETCH_LOG,'utf8'):'';
const fields=['name','url','kind','year','selector','sample','content_url','enabled','last_run','error','tracking_from','cutoff_time','locator_identity','auto_relocate','folder_id','entry_mode','entry_keyword'];
const assertPreserved=()=>{const after=read();for(const old of before){const current=after.find(row=>row.id===old.id);for(const field of fields)assert.equal(current[field],old[field],field);}assert.deepEqual(db.prepare('SELECT id,raw,first_seen FROM predictions ORDER BY id').all(),originals);};
let result=await api('sources/schedule',{ids:[ids[0],ids[1],ids[0]],schedule:{mode:'daily',time:'19:00'}});assert.equal(result.count,2);assert.equal(result.nextRun,'2089-01-01T11:00:00.000Z');
for(const id of ids.slice(0,2)){const row=read().find(row=>row.id===id);assert.equal(row.schedule_mode,'daily');assert.equal(row.daily_time,'19:00');assert.equal(row.enabled,before.find(row=>row.id===id).enabled);}
assert.deepEqual(read().find(row=>row.id===ids[2]),before.find(row=>row.id===ids[2]));assertPreserved();
result=await api('sources/schedule',{ids:ids.slice(0,2),schedule:{mode:'interval',interval:120}});assert.equal(result.nextRun,'2089-01-01T04:00:00.000Z');for(const row of read().filter(row=>row.id!==ids[2])){assert.equal(row.interval,120);assert.equal(row.daily_time,'19:00');}assertPreserved();
const globalBefore=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='collectionSchedule'").get()?.value||'null')||DEFAULT_SCHEDULE;await api('settings',{key:'collectionSchedule',value:{mode:'daily',time:'16:30',interval:60,enabled:false}});
result=await api('sources/schedule',{ids:ids.slice(0,2),schedule:{mode:'inherit'}});assert.equal(result.nextRun,'2089-01-01T08:30:00.000Z');assert.equal(JSON.parse(db.prepare("SELECT value FROM settings WHERE key='collectionSchedule'").get().value).enabled,false);assertPreserved();
const stable=read(),jobs=db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE name='批量采集时间'").get().count;
for(const body of [{ids:[ids[0],'missing'],schedule:{mode:'daily',time:'18:00'}},{ids:[],schedule:{mode:'inherit'}},{ids:[ids[0]],schedule:{mode:'interval',interval:10}},{ids:[ids[0]],schedule:{mode:'daily',time:''}}])await api('sources/schedule',body,400);
assert.deepEqual(read(),stable);assert.equal(db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE name='批量采集时间'").get().count,jobs);
db.exec(`CREATE TRIGGER qa_block_schedule BEFORE UPDATE OF schedule_mode ON sources WHEN OLD.id='${ids[1]}' BEGIN SELECT RAISE(ABORT,'QA temporary schedule failure'); END;`);
await api('sources/schedule',{ids:ids.slice(0,2),schedule:{mode:'daily',time:'18:00'}},400);assert.deepEqual(read(),stable);db.exec('DROP TRIGGER qa_block_schedule');assert.equal(db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE name='批量采集时间'").get().count,jobs);
const removed=await api('sources/delete',{ids:[ids[1]]});await api('sources/schedule',{ids:ids.slice(0,2),schedule:{mode:'daily',time:'18:00'}},400);assert.deepEqual(read().find(row=>row.id===ids[0]),stable.find(row=>row.id===ids[0]));await api('trash/restore',{id:removed.batch});
await api('auth/login',{username:'qa-operator',password:'Local-only-operator-Password-9276'});await api('sources/schedule',{ids:[ids[0]],schedule:{mode:'daily',time:'18:00'}});
await api('auth/login',{username:'qa-viewer',password:'Reset-local-only-password-9276'});await api('sources/schedule',{ids:[ids[0]],schedule:{mode:'daily',time:'17:00'}},403);
assert.equal(existsSync(process.env.QA_FETCH_LOG)?readFileSync(process.env.QA_FETCH_LOG,'utf8'):'',fetches);await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});await api('settings',{key:'collectionSchedule',value:globalBefore});writeFileSync(process.env.QA_CLOCK_FILE,'');db.close();
console.log('PASS: selected-source daily/interval/inherited scheduling, Beijing next-run times, deduplicated selection, paused/global-pause preservation, no collection or archive changes, atomic rollback, deleted/missing validation, audit counts and operator/viewer permissions.');
