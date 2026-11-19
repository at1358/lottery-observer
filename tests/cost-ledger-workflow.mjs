import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||'')||!process.env.QA_CLOCK_FILE)throw Error('Isolated clocked QA required');let cookie='';
async function api(route,data,status=200){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),v=await r.json();assert.equal(r.status,status,route+':'+JSON.stringify(v));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return v;}
writeFileSync(process.env.QA_CLOCK_FILE,'2092-11-08T20:00:00+08:00');await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});const admin=cookie,db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite')),get=k=>JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value||'null'),originals=db.prepare('SELECT id,raw,first_seen FROM predictions ORDER BY id').all();
assert.equal((await api('cost-ledger')).initialized,false);assert.equal(get('costLedger'),null);
let config=(await api('cost-ledger/settings',{revision:null,initialCapital:'2000',defaultOdds:'47'})).config;assert.equal(config.defaultStakePerNumber,undefined);
await api('cost-ledger/settings',{...config,revision:null},409);
const form={year:2092,issue:1,numbers:Array.from({length:20},(_,i)=>String(i+1).padStart(2,'0')).join(' '),stakePerNumber:'10',odds:'47',memo:'首次原文'};
let first=(await api('cost-ledger/entry',form)).entry,state=await api('cost-ledger');assert.equal(state.stats.balanceCents,200000);assert.equal(state.rows[0].status,'pending');assert.equal(state.rows[0].plannedStakeCents,20000);
await api('cost-ledger/entry',form,409);await api('cost-ledger/entry',{...form,issue:2,numbers:'01 01'},400);assert.equal((await api('cost-ledger')).count,1);
const draw=(issue,number)=>api('draw',{year:2092,issue,number,zodiac:'马',drawnAt:'2092-11-08T21:38:00+08:00',drawDate:'2092-11-08'});
await draw(1,5);assert.equal(get('costLedgerResult').stats.balanceCents,227000);assert.equal(get('costLedgerResult').trigger,'draw');
for(let i=0;i<2;i++)await draw(1,5);assert.equal((await api('cost-ledger')).stats.balanceCents,227000);
const second=(await api('cost-ledger/entry',{...form,issue:2})).entry;await draw(2,49);state=await api('cost-ledger');assert.equal(state.stats.balanceCents,207000);assert.equal(state.stats.settled,2);
await draw(1,49);assert.equal((await api('cost-ledger')).stats.balanceCents,160000);
first=(await api('cost-ledger/entry',{...form,id:first.id,revision:first.revision,numbers:'49',memo:'更正本期记录'})).entry;state=await api('cost-ledger');assert.equal(state.stats.balanceCents,226000);assert.equal(first.modifiedAfterDraw,true);assert.equal((await api('cost-ledger?history='+first.id)).history[0].entry.rawText,form.numbers);
await api('cost-ledger/entry',{...form,id:first.id,revision:'stale'},409);
await api('cost-ledger/void',{id:first.id,revision:first.revision,voided:true});state=await api('cost-ledger');assert.equal(state.stats.balanceCents,180000);assert.equal(state.stats.voided,1);first=state.rows.find(r=>r.id===first.id);
await api('cost-ledger/void',{id:first.id,revision:first.revision,voided:false});assert.equal((await api('cost-ledger')).stats.balanceCents,226000);
state=await api('cost-ledger');config=(await api('cost-ledger/settings',{...state.config,initialCapital:'3000',defaultStakePerNumber:'20',defaultOdds:'40'})).config;state=await api('cost-ledger');assert.equal(state.stats.balanceCents,326000);assert.equal(state.rows.find(r=>r.id===second.id).stakePerNumber,'10.00');assert.equal(state.rows.find(r=>r.id===second.id).odds,'47.00');
// Two independent inserts may race, but the period uniqueness and money remain exact.
const create=()=>fetch(base+'/api/cost-ledger/entry',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({...form,issue:3,stakePerNumber:'20',odds:'40'})});const race=await Promise.all([create(),create()]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await api('cost-ledger')).count,3);
// Simulate a missed draw callback, then let the existing minute tick repair only derived state.
db.prepare("INSERT INTO draws(id,year,issue,number,zodiac,drawn_at,updated_at,numbers,zodiacs,draw_date,provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(),2092,'003',5,'马','2092-11-08T13:38:00.000Z','2092-11-08T13:38:00.000Z','[]','[]','2092-11-08','隔离测试开奖');
await api('settings',{key:'collectionSchedule',value:{enabled:false,mode:'daily',time:'16:30',interval:60}});await api('settings',{key:'drawSchedule',value:{enabled:false,time:'21:38'}});await api('settings',{key:'historySource',value:{enabled:false,year:2092,url:'https://qa-history.example/am.html'}});
for(const p of (await api('combinations')).plans)if(p.calculation.enabled||p.push.enabled)await api('combinations/save',{...p,calculation:{...p.calculation,enabled:false},push:{...p.push,enabled:false}});
await api('tick',{});assert.equal(get('costLedgerResult').stats.settled,3);assert.equal(get('costLedgerResult').stats.balanceCents,366000);await api('cost-ledger/recalculate',{});assert.equal((await api('cost-ledger')).stats.balanceCents,366000);
assert.ok((await api('backup')).tables.settings.some(r=>r.key==='costLedger'));assert.deepEqual(db.prepare('SELECT id,raw,first_seen FROM predictions ORDER BY id').all(),originals);
for(const route of ['/?view=cost-ledger','/m?view=cost-ledger']){const r=await fetch(base+route,{headers:{cookie}});assert.equal(r.status,200);assert.match(await r.text(),/成本计算/);}
await api('auth/login',{username:'qa-operator',password:'Local-only-operator-Password-9276'});await api('cost-ledger/entry',{...form,issue:4});await api('auth/login',{username:'qa-viewer',password:'Reset-local-only-password-9276'});assert.equal((await api('cost-ledger')).count,4);await api('cost-ledger/entry',{...form,issue:5},403);await api('cost-ledger/settings',config,403);await api('cost-ledger/recalculate',{},403);cookie=admin;
const groupedText='12 13 19各15\n42 43各10\n20 16 10 40 34各6\n38 49 48 37 36 33 04 08 46各5';
let grouped=(await api('cost-ledger/entry',{...form,issue:6,numbers:groupedText,stakePerNumber:undefined,numberStakes:[{number:12,stakeCents:999999}]})).entry;
state=await api('cost-ledger');assert.equal(state.stats.balanceCents,366000);assert.equal(state.rows.find(r=>r.id===grouped.id).plannedStakeCents,14000);assert.equal(grouped.numbers.length,19);
for(const [number,returned,profit] of [[12,70500,56500],[42,47000,33000],[20,28200,14200],[38,23500,9500],[1,0,-14000]]){
 await draw(6,number);state=await api('cost-ledger');const row=state.rows.find(r=>r.id===grouped.id);assert.equal(row.returnCents,returned);assert.equal(state.stats.balanceCents,366000+profit);
}
await draw(6,42);const changed=groupedText.replace('42 43各10','42各6\n43各10').replace('20 16 10 40 34各6','20各10\n16 10 40 34各6');
grouped=(await api('cost-ledger/entry',{...grouped,numbers:changed})).entry;state=await api('cost-ledger');assert.equal(state.stats.balanceCents,380200);assert.equal(grouped.modifiedAfterDraw,true);assert.equal((await api('cost-ledger?history='+grouped.id)).history[0].entry.rawText,groupedText);
await api('cost-ledger/recalculate',{});assert.equal((await api('cost-ledger')).stats.balanceCents,380200);
for(const numbers of ['01各10\n01各5','01各0','01各10\n02'])await api('cost-ledger/entry',{...form,issue:7,numbers},400);
await api('cost-ledger/entry',{...form,issue:7,numbers:'01 02',stakePerNumber:undefined},400);
await api('cost-ledger/void',{id:grouped.id,revision:grouped.revision,voided:true});state=await api('cost-ledger');assert.equal(state.stats.balanceCents,366000);grouped=state.rows.find(r=>r.id===grouped.id);
await api('cost-ledger/void',{id:grouped.id,revision:grouped.revision,voided:false});assert.equal((await api('cost-ledger')).stats.balanceCents,380200);
assert.deepEqual(db.prepare('SELECT id,raw,first_seen FROM predictions ORDER BY id').all(),originals);
writeFileSync(process.env.QA_CLOCK_FILE,'');db.close();console.log('PASS: independent manual cost ledger, 2000 starting capital, uniform/grouped stakes, exact 19-number/140 mixed paste, winning-number stake payout, pending exclusion, draw-arrival auto settlement, corrections, unique periods, concurrency, audit history, void/restore, integer money, minute-tick recovery, backups, mobile/desktop routes, unchanged original predictions and role boundaries.');
