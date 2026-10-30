import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptedShell,decryptShellPayload} from '../lib/encrypted-shell.mjs';
import {resolveModule} from '../lib/content-resolver.mjs';
import {splitPeriods,parsePrediction,inferKind,evaluate} from '../lib/domain.mjs';
import {sourceSegmentRules} from '../lib/source-rules.mjs';
const fixture=name=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
const urls=['https://4rh2fm.haccinsv.com/shell.html?page=articles/086','https://4monjs.3845hi.app:3854/shell.html?page=articles/031'];
const samples=['287期:绝杀一段 【4段】 特开:猪08准','224期:真挚情怀☯️稳杀五码☯️特开:狗09中\n【01.05.25.36.49】'];
const names=['东逃西散【绝杀一段】','真挚情怀【稳杀五码】'];
const shell=i=>fixture('encrypted-shell-'+i+'.html'),payload=i=>fixture('encrypted-payload-'+i+'.json');
test('both reported encrypted article formats resolve only their declared same-origin JSON',async()=>{
 for(let i=0;i<2;i++){
  const spec=encryptedShell(shell(i),urls[i]),requests=[];
  assert.ok(spec);assert.equal(spec.dataUrl,new URL(i===0?'enc/articles/086.json':'enc/articles/031.json',urls[i]).href);
  const r=await resolveModule({url:urls[i],text:shell(i)},{sample:samples[i],name:names[i],kind:'自动识别'},async url=>{requests.push(url);assert.equal(url,spec.dataUrl);return {url,text:payload(i)};});
  assert.deepEqual(requests,[spec.dataUrl]);assert.equal(r.url,urls[i]);
  const rows=splitPeriods(r.text);assert.equal(rows.length,i===0?17:77);assert.equal(rows[0].issue,i===0?'287':'224');assert.equal(rows.at(-1).issue,'304');assert.equal(r.kind,i===0?'杀段':'杀号码');
  assert.ok(rows.every(row=>parsePrediction(row.raw,r.kind,names[i]).valid));
  if(i===0){assert.equal(Object.keys(r.sourceRules.segments).length,49);assert.equal(r.sourceRules.segments[17],3);assert.equal(r.sourceRules.segments[45],7);assert.ok(!rows.at(-1).raw.includes('1段--'));}
  else{assert.deepEqual(parsePrediction(rows[0].raw,r.kind,names[i]).values,[1,5,25,36,49]);assert.ok(rows[0].raw.includes('\n【01.05.25.36.49】'));}
  const again=await resolveModule({url:r.url,text:shell(i)},{selector:r.selector,sample:'001期不存在的样本',name:names[i],kind:r.kind},async url=>({url,text:payload(i)}));assert.equal(splitPeriods(again.text).length,rows.length);
 }
});
test('decode failures are reported without executing source code or accepting arbitrary paths',()=>{
 const spec=encryptedShell(shell(0),urls[0]);
 assert.throws(()=>decryptShellPayload(payload(0),'incorrect public passphrase'),/解码失败/);
 for(const invalid of ['not json','{"data":"not-base64!"}','{"data":12}','{"data":"QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE="}'])assert.throws(()=>decryptShellPayload(invalid,spec.key),/解码失败/);
 assert.throws(()=>encryptedShell(shell(0),'https://example.com/shell.html?page=../../private'),/栏目参数/);
 assert.throws(()=>encryptedShell(shell(0),'https://example.com/shell.html?page=https://internal.local/secret'),/栏目参数/);
 assert.equal(encryptedShell(shell(0).replace('const key = "MySecretKey_ChangeMe";','const key = runCode();'),urls[0]),null);
 assert.equal(globalThis.executedUntrustedScript,undefined);
});
test('samples must match the recommendation on their own issue, not another row or the footer',async()=>{
 const spec=encryptedShell(shell(0),urls[0]);
 await assert.rejects(resolveModule({url:urls[0],text:shell(0)},{sample:'287期绝杀一段【5段】',kind:'杀段',name:names[0]},async url=>({url,text:payload(0)})),/没有匹配/);
 assert.equal(inferKind(names[1]),'杀号码');
 assert.equal(parsePrediction(samples[1],'杀号码',names[1]).valid,true);
 assert.equal(parsePrediction(samples[1].replace('.49',''),'杀号码',names[1]).valid,false);
});
test('segment verdicts use only the explicitly captured complete source partition',()=>{
 const html=decryptShellPayload(payload(0),encryptedShell(shell(0),urls[0]).key);
 const footer=html.replace(/<[^>]+>/g,'\n');const found=sourceSegmentRules(footer);assert.ok(found);
 const p={kind:'杀段',parsed:{...parsePrediction('303期绝杀一段【6段】','杀段'),sourceRules:found.rules}};
 assert.equal(evaluate(p,{number:17}).status,'win');assert.equal(evaluate(p,{number:38}).status,'loss');
 assert.equal(evaluate({...p,parsed:parsePrediction('303期绝杀一段【6段】','杀段')},{number:17}).status,'review');
 assert.equal(sourceSegmentRules(footer.replace('48.49','48.48')),null);assert.equal(sourceSegmentRules(footer.replace('7段--','其他--')),null);
});
