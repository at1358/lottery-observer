import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import path from 'node:path';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||''))throw Error('Isolated QA only');let cookie='';
async function api(route,data,status=200){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),value=await r.json();assert.equal(r.status,status,route+':'+JSON.stringify(value));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return value;}
const dir=process.env.QA_DATA_DIR,write=(name,body)=>writeFileSync(path.join(dir,name),body),db=new DatabaseSync(path.join(dir,'observer.sqlite'));
await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
await api('settings',{key:'drawSchedule',value:{mode:'daily',time:'21:38',enabled:true,interval:1440}});assert.equal((await api('state')).drawSchedule.time,'21:38');
write('entry-root.html','<a href="/line?v=first">线路入口①</a>');write('entry-line.html','<a href="/column?v=first">QA 固定入口资料</a>');
const content=(codes='03 04')=>'<section><h2>QA 固定入口资料</h2>'+Array.from({length:30},(_,i)=>'<p>'+String(i+1).padStart(3,'0')+'期资料【01 02】</p>').join('')+'<p>304期资料【01 02】</p><p>305期资料【'+codes+'】</p></section>';
write('entry-column.html',content());
const input={name:'QA 固定入口资料',url:'http://qa-entry.example/',entry_mode:'navigation',entry_keyword:'固定入口资料',entry_line:'',kind:'号码',year:2079,sample:'305期资料【03 04】',selector:'auto',interval:60,enabled:true,collectNow:true};
await api('source',{...input,entry_keyword:''},400);await api('source',{...input,url:'http://127.0.0.1/'},400);
const preview=await api('preview',input);assert.equal(preview.total,32);assert.equal(preview.navigation.length,3);
const source=await api('source',input);assert.equal(source.inserted,32);assert.equal(source.enabled,true);
let state=await api('state?source='+source.id),before=state.rows.find(p=>p.issue==='305');assert.ok(before);
write('entry-root.html','<a href="/line?v=second">线路入口①</a>');write('entry-line.html','<a href="/column?v=second">QA 固定入口资料</a>');
await api('crawl',{id:source.id});state=await api('state');assert.match(state.sources.find(s=>s.id===source.id).content_url,/v=second/);assert.equal(state.sources.find(s=>s.id===source.id).entry_mode,'navigation');
let plan=(await api('combinations/save',{name:'QA 逐期核对',year:2079,baseMode:'source',baseSourceId:source.id,steps:[{type:'manual',kind:'号码',values:'49',mode:'exclude'}],targetMode:'latest',calculation:{enabled:false,refreshSources:false},push:{enabled:false}})).plan;
for(const [issue,number] of [[304,1],[305,5]])await api('draw',{year:2079,issue,number,drawnAt:'2079-11-01T13:35:00Z',drawDate:'2079-11-01'});
await api('combinations/calculate',{id:plan.id});await api('combinations/calculate',{id:plan.id});
let combos=await api('combinations?plan='+plan.id);assert.equal(combos.results.length,1);assert.equal(combos.report.periods.length,32);assert.equal(combos.report.stats.history.win,1);assert.equal(combos.report.stats.history.loss,1);assert.equal(combos.report.stats.history.rate,.5);assert.equal(combos.report.stats.forecast.settled,0);
assert.deepEqual((await api('combinations?plan='+plan.id+'&issue=305')).periodResult.numbers,[3,4]);
// Later site edits are tracked but never replace original values in backtests.
write('entry-column.html',content('05 06'));await api('crawl',{id:source.id});
combos=await api('combinations?plan='+plan.id);assert.equal(combos.report.stats.history.loss,1);assert.deepEqual(combos.report.periods.find(r=>r.issue==='305').numbers,[3,4]);
const after=db.prepare('SELECT raw,first_seen FROM predictions WHERE id=?').get(before.id);assert.equal(after.raw,before.raw);assert.equal(after.first_seen,before.first_seen);
await api('draw',{year:2079,issue:305,number:3,drawnAt:'2079-11-01T13:35:00Z',drawDate:'2079-11-01'});assert.equal((await api('combinations?plan='+plan.id)).report.stats.history.rate,1);
assert.ok(db.prepare('SELECT value FROM settings WHERE key=?').get('sourceNavigation:'+source.id));
 db.prepare('INSERT INTO collection_periods(id,source_id,year,issue,deadline_at,status,reason,finalized_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),source.id,2079,'330','2079-11-26T13:35:00Z','failed','本期未采到资料',new Date().toISOString());
 combos=await api('combinations?plan='+plan.id);assert.equal(combos.report.periods.length,33);assert.equal(combos.report.periods.find(r=>r.issue==='330').settlement.status,'blocked');assert.equal(combos.report.stats.history.settled,2);db.close();
console.log('PASS: configurable 21:38 draw plan, fresh fixed-entry discovery, persisted navigation, 32 period reports, deduplicated accuracy, draw corrections and immutable original recommendations.');

