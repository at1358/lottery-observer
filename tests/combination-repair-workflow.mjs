import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {writeFileSync} from 'node:fs';import path from 'node:path';
import {ZODIACS,emptyReference} from '../lib/number-reference.mjs';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||'')||!process.env.QA_CLOCK_FILE)throw Error('Isolated QA required');let cookie='';
async function api(route,data,status=200){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),v=await r.json();assert.equal(r.status,status,route+':'+JSON.stringify(v));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return v;}
const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite')),read=key=>JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value||'null');
writeFileSync(process.env.QA_CLOCK_FILE,'2030-01-04T22:00:00+08:00');await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const oldMap=Object.fromEntries(Array.from({length:49},(_,i)=>[i+1,ZODIACS[i%12]]));
for(let i=0;i<7;i++){const numbers=Array.from({length:7},(_,j)=>i*7+j+1),zodiacs=numbers.map(n=>oldMap[n]);await api('draw',{year:2029,issue:359+i,number:numbers[6],zodiac:zodiacs[6],numbers,zodiacs,drawDate:'2029-12-'+(25+i),drawnAt:'2029-12-'+(25+i)+'T13:38:00Z'});}
const profile=emptyReference(2030);for(let n=1;n<=49;n++)(profile.zodiacs[ZODIACS[n%12]]||=[]).push(n);profile.revision=(await api('number-reference?year=2030')).profile.revision;await api('number-reference/save',profile);
for(let issue=1;issue<=4;issue++)await api('draw',{year:2030,issue,number:issue,zodiac:oldMap[issue],drawDate:'2030-01-0'+issue,drawnAt:'2030-01-0'+issue+'T13:38:00Z'});
const nk=(await api('custom-materials/save',{name:'QA 年初历史 n−1',year:2030,lag:1})).plan;
const source=(await api('source',{name:'QA 缺失采集条件',year:2030,kind:'号码',url:'',selector:'auto',interval:60,enabled:false,text:'004期【01 02】'})).source;
// Use a source-free plan initially; then introduce a missing input and remove it.
let combo=(await api('combinations/save',{name:'QA 历史修复组合',year:2030,baseMode:'all',steps:[{type:'custom',materialId:nk.id,mode:'exclude'}],calculation:{enabled:false,refreshSources:false},push:{enabled:false}})).plan;
let report=(await api('combinations?plan='+combo.id)).report;assert.equal(report.overall.settled,4);assert.equal(report.blocked,0);
assert.ok(!report.periods.find(p=>p.issue==='001').numbers.includes(7));assert.ok(report.periods.find(p=>p.issue==='001').numbers.includes(6));
let own=await api('custom-materials?material='+nk.id);assert.deepEqual(own.rows.find(r=>r.issue==='001').killNumbers,[7,19,31,43]);
const simulation=(await api('simulations/save',{name:'QA 联动模拟',year:2030,combinationId:combo.id,initialCapital:'1000',stakePerNumber:'10',odds:'47',schedule:{enabled:true,time:'23:30'}})).plan;
// A missing historic collection must not survive after it is removed from the saved rule.
const sourceId=source?.id||(await api('state')).sources.find(s=>s.name==='QA 缺失采集条件').id;
combo=(await api('combinations/save',{...combo,steps:[...combo.steps,{type:'source',sourceId,mode:'exclude'}]})).plan;
let ledger=await api('simulations?plan='+simulation.id);assert.ok(ledger.stats.blocked>=3);
combo=(await api('combinations/save',{...combo,steps:combo.steps.filter(s=>s.type==='custom')})).plan;
ledger=await api('simulations?plan='+simulation.id);assert.equal(ledger.stats.settled,4);assert.equal(ledger.stats.blocked,0);assert.ok(ledger.archives.length>=2);
let result=await api('combinations/recalculate',{id:combo.id});assert.equal(result.overall.settled,4);assert.equal(result.simulations.checked,1);
await api('simulations/recalculate',{id:simulation.id});assert.equal((await api('simulations?plan='+simulation.id)).stats.balanceCents,ledger.stats.balanceCents);
// Operators may retain unchanged admin push settings while editing calculations.
combo=(await api('combinations/save',{...combo,push:{enabled:true,time:'19:05'}})).plan;
await api('auth/login',{username:'qa-operator',password:'Local-only-operator-Password-9276'});
combo=(await api('combinations/save',{...combo,name:'QA 操作员保留推送配置'})).plan;
await api('combinations/save',{...combo,push:{enabled:true,time:'19:06'}},400);
const deleted=await api('combinations/delete',{id:combo.id,revision:combo.revision});assert.equal(deleted.paused,1);assert.equal(read('simulationPlan:'+simulation.id).schedule.enabled,false);assert.ok(!(await api('combinations')).plans.some(p=>p.id===combo.id));
assert.equal((await api('simulations?plan='+simulation.id)).stats.balanceCents,ledger.stats.balanceCents);await api('combinations/recalculate',{id:combo.id},400);
await api('trash/restore',{id:deleted.batch});combo=(await api('combinations?plan='+combo.id)).plans.find(p=>p.id===combo.id);assert.equal(combo.calculation.enabled,false);assert.equal(combo.push.enabled,false);
const current=(await api('simulations?plan='+simulation.id)).plan;
await api('simulations/delete',{id:simulation.id,revision:simulation.revision},409);
const removed=await api('simulations/delete',{id:simulation.id,revision:current.revision});assert.ok(!(await api('simulations')).items.some(p=>p.id===simulation.id));assert.ok(read('simulationRows:'+simulation.id).rows.length);
await api('trash/restore',{id:removed.batch});assert.equal((await api('simulations?plan='+simulation.id)).plan.schedule.enabled,false);
await api('auth/login',{username:'qa-viewer',password:'Reset-local-only-password-9276'});await api('combinations/recalculate',{id:combo.id},403);await api('simulations/delete',{id:simulation.id,revision:current.revision},403);
writeFileSync(process.env.QA_CLOCK_FILE,'');db.close();console.log('PASS: historical lunar-year map, saved-source removal immediately refreshes manual and automatic ledgers, complete history recalculation, operator editing with preserved push settings, recoverable plan deletion, linked task pause, stale revisions and viewer permissions. No real group deliveries.');
