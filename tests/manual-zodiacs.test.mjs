import test from 'node:test';import assert from 'node:assert/strict';
import {validateCustomMaterial,buildCustomMaterial,isManualMaterial} from '../lib/custom-material.mjs';
import {parseManualKill} from '../lib/manual-kill.mjs';
const input={type:'manual-zodiacs',name:'㈢肖稳赚',year:2026,declaredCount:3,sourceText:'001期: ㈢肖稳赚【蛇兔鸡】牛 29 错误\n002期: ㈢肖稳赚【龙牛马】猴 22 错误\n003期: ㈢肖稳赚【鼠牛狗】\n004期: ㈢肖稳赚【马鸡虎】'};
test('manual recommended zodiac parsing preserves originals, extracts only bracketed recommendations and validates counts',()=>{
 const plan=validateCustomMaterial(input);assert.ok(isManualMaterial(plan));assert.deepEqual(plan.records[0].values,['蛇','兔','鸡']);assert.equal(plan.records[0].claimedZodiac,'牛');assert.equal(plan.sourceText,input.sourceText);assert.equal(plan.importSummary.valid,4);
 const p=parseManualKill('001期: 三肖【龍 雞 豬】兔27中\n001期: 三肖【猪鸡龙】\n002期: 三肖【鼠鼠鼠】\n003期: 三肖【蛇兔牛猴】\n004期: 三肖【鼠兔X】',{layout:'issue-brackets',declaredCount:3,valueKind:'zodiacs'});assert.equal(p.records[0].valid,true);assert.equal(p.records[0].conflict,false);assert.equal(p.records[0].rawLines[0].raw,'001期: 三肖【龍 雞 豬】兔27中');assert.ok(p.records.slice(1).every(r=>!r.valid));assert.throws(()=>validateCustomMaterial({...input,declaredCount:13}),/1–12肖/);
});
test('zodiac review uses actual draw zodiac independent of printed claims and number mappings',()=>{
 const plan=validateCustomMaterial(input),draws=[{year:2026,issue:'001',number:29,zodiac:'鸡'},{year:2026,issue:'002',number:22,zodiac:'羊'},{year:2026,issue:'003',number:1,zodiac:''},{year:2025,issue:'004',number:1,zodiac:'马'}];
 const result=buildCustomMaterial(plan,draws);assert.equal(result.stats.win,1);assert.equal(result.stats.loss,1);assert.equal(result.stats.settled,2);assert.equal(result.stats.review,1);assert.equal(result.stats.pending,1);assert.equal(result.stats.rate,50);const row=result.rows.find(r=>r.issue==='001');assert.deepEqual(row.recommendedZodiacs,['蛇','兔','鸡']);assert.deepEqual(row.killNumbers,[]);assert.equal(row.claimMismatch,true);assert.equal(row.status,'win');assert.equal(result.rows.find(r=>r.issue==='003').status,'review');
 const corrected=buildCustomMaterial(plan,[...draws.filter(d=>d.issue!=='002'),{year:2026,issue:'002',number:22,zodiac:'龙'}],[],null,result);assert.equal(corrected.stats.win,2);assert.equal(corrected.rows.find(r=>r.issue==='001').firstSeen,row.firstSeen);assert.equal(corrected.rows.find(r=>r.issue==='001').raw,row.raw);
});
test('numeric recommendation and kill semantics remain opposite for the same numbers',()=>{
 const text='001期: 绝稳砍５码【27 29 33 36 44】牛 29 错误\n002期: 绝稳砍５码【47 48 30 19 29】猴 22 正确',draws=[{year:2026,issue:'001',number:29,zodiac:'牛'},{year:2026,issue:'002',number:22,zodiac:'猴'}];
 for(const type of ['manual-kill','manual-numbers']){const plan=validateCustomMaterial({type,name:'五号码',year:2026,declaredCount:5,layout:'issue-brackets',sourceText:text}),result=buildCustomMaterial(plan,draws);assert.equal(result.stats.win,1);assert.equal(result.rows.find(r=>r.issue==='001').status,type==='manual-kill'?'loss':'win');assert.equal(result.rows.find(r=>r.issue==='002').status,type==='manual-kill'?'win':'loss');}
});
