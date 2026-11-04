import test from 'node:test';import assert from 'node:assert/strict';
import {parseManualKill} from '../lib/manual-kill.mjs';
import {validateCustomMaterial,buildCustomMaterial,customMaterialLabel} from '../lib/custom-material.mjs';
const plan=(sourceText,extra={})=>validateCustomMaterial({type:'manual-kill',name:'绝杀6码',year:2026,declaredCount:6,layout:'before-issue',sourceText,...extra});
const draw=(issue,number,zodiac='牛')=>({year:2026,issue:String(issue).padStart(3,'0'),number,zodiac});
test('manual six-code records retain duplicate and short raw data, while exclusions use distinct numbers',()=>{
 const p=plan('01 + 02 02 + 03 04 + 05 001期 牛29错误\n33 + 43 365期');assert.equal(p.records.length,2);assert.deepEqual(p.records[0].rawNumbers,[1,2,2,3,4,5]);assert.deepEqual(p.records[0].values,[1,2,3,4,5]);assert.equal(p.records[1].values.length,2);assert.equal(p.importSummary.short,2);
 const result=buildCustomMaterial(p,[draw(1,29)]);assert.equal(result.stats.win,1);assert.equal(result.stats.loss,0);assert.equal(result.stats.pending,1);assert.equal(result.stats.rate,100);assert.equal(result.rows.find(r=>r.issue==='001').claimedError,true);
});
test('the user-confirmed 216-to-215 correction changes only the key, preserving both originals',()=>{
 const raw='19 + 49 05 + 47 47 + 03 216期',text=raw+'\n20 + 36 16 + 25 35 + 17 216期';
 const conflict=parseManualKill(text);assert.equal(conflict.summary.conflicts,1);assert.equal(conflict.records[0].rawLines.length,2);assert.equal(conflict.records[0].valid,false);
 const p=plan(text,{issueCorrections:[{raw,issue:'215',note:'用户确认'}]});assert.deepEqual(p.records.map(r=>r.issue),['215','216']);assert.equal(p.records[0].raw,raw);assert.equal(p.records[0].originalIssue,'216');assert.equal(p.importSummary.corrected,1);
});
test('historical seven-code syntax does not consume appended target number or zodiac into exclusions',()=>{
 const p=plan('001期 01 02 03 04 05 06 + 07 虎/金 001期 牛29错误\n002期 08 09 10 11 12 13 + 14 蛇/木 002期',{declaredCount:7,layout:'draw-seven',referenceYear:2023});assert.deepEqual(p.records[0].values,[1,2,3,4,5,6,7]);assert.equal(p.records[0].claimedNumber,29);assert.equal(p.records[0].referenceZodiac,'虎');assert.equal(p.records[1].claimedNumber,null);
 const result=buildCustomMaterial(p,[draw(1,7),draw(2,49)]);assert.equal(result.stats.loss,1);assert.equal(result.stats.win,1);assert.equal(result.stats.rate,50);assert.equal(customMaterialLabel(p,result.stats),'绝杀6码 · 错误1期');
});
test('invalid numbers and conflicting periods are retained as review and excluded from the denominator',()=>{
 const p=plan('00 02 03 04 05 50 001期\n01 02 03 04 05 06 002期\n07 08 09 10 11 12 002期\n11 + 12 003期');const result=buildCustomMaterial(p,[draw(1,2),draw(2,1),draw(3,49)]);assert.equal(result.stats.review,2);assert.equal(result.stats.settled,1);assert.equal(result.stats.rate,100);assert.equal(result.stats.loss,0);assert.equal(result.stats.modes.history.settled,1);
});
test('draw corrections dynamically change title/count without altering raw recommendations or generation time',()=>{
 const p=plan('01 + 02 03 + 04 05 + 06 001期 牛29'),first=buildCustomMaterial(p,[draw(1,29)],[],null,null,'2026-11-05T01:00:00Z'),next=buildCustomMaterial(p,[draw(1,6)],[],null,first,'2026-11-05T02:00:00Z');assert.equal(next.stats.loss,1);assert.equal(customMaterialLabel(p,next.stats),'绝杀6码 · 错误1期');assert.equal(next.rows[0].raw,first.rows[0].raw);assert.equal(next.rows[0].generatedAt,first.rows[0].generatedAt);assert.equal(next.rows[0].claimMismatch,true);
});
test('manual layouts enforce range and preserve target-issue mismatch for confirmation',()=>{
 assert.throws(()=>plan('没有期资料'));assert.throws(()=>plan('01 001期',{declaredCount:50}));const p=plan('001期 01 02 03 04 05 06 + 07 虎/金 002期 牛29',{declaredCount:7,layout:'draw-seven'});assert.equal(p.records[0].valid,false);assert.match(p.records[0].warnings[0],/目标期不一致/);
});
