// Run after management-workflow.mjs on the isolated standalone QA server.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encryptedShell,decryptShellPayload} from '../lib/encrypted-shell.mjs';
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5273';let cookie='';
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):5\d{3}$/.test(base))throw Error('QA server must use a local test port');
async function api(path,body,expected=200){const r=await fetch(base+'/api/'+path,{headers:{cookie,'Content-Type':'application/json'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});const data=await r.json();assert.equal(r.status,expected,path+': '+JSON.stringify(data));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return data;}
await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const sources=[];
for(let i=0;i<2;i++){
 const shell=readFileSync(new URL('./fixtures/encrypted-shell-'+i+'.html',import.meta.url),'utf8'),spec=encryptedShell(shell,'https://reference.example/shell.html?page=articles/086');
 const html=decryptShellPayload(readFileSync(new URL('./fixtures/encrypted-payload-'+i+'.json',import.meta.url),'utf8'),spec.key);
 const source=await api('source',{name:i===0?'QA 绝杀一段':'QA 稳杀五码',kind:i===0?'杀段':'杀号码',year:2026,url:'',selector:'auto',interval:60,schedule_mode:'interval',enabled:false});sources.push(source);
 const collected=await api('crawl',{id:source.id,text:html});assert.equal(collected.inserted,i===0?17:77);
 const repeated=await api('crawl',{id:source.id,text:html});assert.equal(repeated.inserted,0);assert.equal(repeated.changed,0);
 const state=await api('state?source='+source.id);assert.equal(state.count,i===0?17:77);
 if(i===0){const row=state.rows.find(r=>r.issue==='303');assert.equal(Object.keys(row.parsed.sourceRules.segments).length,49);assert.equal(row.parsed.sourceRules.segments[17],3);assert.ok(!state.rows.find(r=>r.issue==='304').raw.includes('1段--'));
  await api('revise',{id:row.id,raw:'303期绝杀一段【6段】',kind:'杀段'});const revised=(await api('state?source='+source.id)).rows.find(r=>r.issue==='303');assert.equal(revised.parsed.sourceRules.segments[17],3);assert.equal(revised.verdict.status,'win');
 }else{const first=(await api('state?source='+source.id+'&from=224&to=224')).rows[0];assert.deepEqual(first.parsed.values,[1,5,25,36,49]);assert.match(first.raw,/\n【01\.05\.25\.36\.49】/);}
}
console.log('PASS: 17 segment and 77 five-number records, retained source rules, independent settlement, manual revision and repeat collection without duplicates.');
