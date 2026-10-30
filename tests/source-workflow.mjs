import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function api(path,data,expected=200){const response=await fetch(base+'/api/'+path,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));return value;}
const initial=await api('state');const plan=initial.collectionSchedule;
try{
 const source={name:'验收 · 东方不败【绝杀半头】',url:'https://mvqx1n.dlxyzw.com:1734/wz/bbsjs/060.html',text:'263期绝杀半头【0头双3头单】开狗09准',year:2026,kind:'杀头',selector:'auto',enabled:false,interval:60,schedule_mode:'daily',daily_time:'16:30',collectNow:true};
 const preview=await api('preview',source);assert.equal(preview.kind,'杀半头');assert.ok(preview.total>30);assert.equal(preview.contentUrl,'https://mvqx1n.dlxyzw.com:1734/wz/bbs/060.html');
 const saved=await api('source',source);assert.ok(!saved.warning);assert.equal(saved.kind,'杀半头');assert.ok(saved.inserted>30);assert.ok(saved.nextRun.endsWith('08:30:00.000Z'));
 const detail=await api('state?source='+saved.id+'&from=263&to=263');assert.equal(detail.count,1);assert.deepEqual(detail.rows[0].parsed.values,['0头双','3头单']);
 const pause=await api('source-toggle',{id:saved.id,enabled:false});assert.equal(pause.enabled,false);
 const resume=await api('source-toggle',{id:saved.id,enabled:true});assert.ok(resume.nextRun.endsWith('08:30:00.000Z'));
 await api('source-toggle',{id:saved.id,enabled:false});
 const draft=await api('source',{name:'验收 · 待识别配置',url:'https://example.com/',text:source.text,year:2026,kind:'杀半头',selector:'auto',enabled:true,interval:60,schedule_mode:'inherit'});
 assert.ok(draft.warning);assert.equal(draft.enabled,false);
 const draftState=await api('state?source='+draft.id);const retained=draftState.sources.find(s=>s.id===draft.id);assert.equal(retained.sample,source.text);assert.ok(retained.error.startsWith('待识别'));assert.equal(draftState.count,0);
 await api('source-toggle',{id:draft.id,enabled:false});await api('source-toggle',{id:draft.id,enabled:true},400);
 await api('settings',{key:'collectionSchedule',value:{mode:'daily',time:'18:30',interval:60,enabled:true}});
 const daily=await api('state');assert.equal(daily.collectionSchedule.time,'18:30');assert.ok(daily.sources.find(s=>s.id===draft.id).next_run.endsWith('10:30:00.000Z'));assert.ok(daily.sources.find(s=>s.id===saved.id).next_run.endsWith('08:30:00.000Z'));
 console.log('PASS: real dynamic page, half-head auto correction, retained drafts, pause/resume without recapture, daily plans, inherited and independent times.');
}finally{await api('settings',{key:'collectionSchedule',value:plan});}
