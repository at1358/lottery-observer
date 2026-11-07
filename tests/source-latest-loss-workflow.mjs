import assert from 'node:assert/strict';
const base=process.env.QA_BASE_URL;
if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||''))throw Error('Isolated local QA required');
let cookie='';
async function api(route,data){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),value=await r.json();assert.equal(r.status,200,route+':'+JSON.stringify(value));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return value;}
await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const source=await api('source',{name:'QA 最近错误期数',year:2088,kind:'号码',url:'',selector:'auto',interval:60,enabled:false,collectNow:false});
await api('crawl',{id:source.id,text:Array.from({length:30},(_,i)=>`${String(i+1).padStart(3,'0')}期:号码【01 03 05】特开:？00准`).join('\n')});
for(const issue of ['001','010','030'])await api('draw',{year:2088,issue,number:2,drawnAt:'2088-01-30T21:38:00+08:00'});
const get=extra=>api('state?source='+source.id+(extra||''));
let state=await get(),stats=state.sources.find(s=>s.id===source.id).stats;
assert.equal(stats.loss,3);assert.deepEqual(stats.latestLoss,{year:2088,issue:'030'});
state=await get('&page=2&from=1&to=5&status=pending');assert.deepEqual(state.sources.find(s=>s.id===source.id).stats,stats);
state=await get();const latest=state.rows.find(r=>r.issue==='030'),removed=await api('records/delete',{ids:[latest.id]});
assert.deepEqual((await get()).sources.find(s=>s.id===source.id).stats.latestLoss,{year:2088,issue:'010'});
await api('trash/restore',{id:removed.batch});assert.deepEqual((await get()).sources.find(s=>s.id===source.id).stats.latestLoss,{year:2088,issue:'030'});
await api('recheck',{source:source.id,year:2088});assert.deepEqual((await get()).sources.find(s=>s.id===source.id).stats.latestLoss,{year:2088,issue:'030'});
console.log('PASS: source latest loss follows verified history, ignores table filters/pagination, and updates after removal, restore and recheck.');
