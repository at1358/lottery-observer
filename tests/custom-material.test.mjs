import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OPPOSITE_ZODIACS,validateCustomMaterial,shiftPeriod,buildCustomMaterial,calendarPeriods} from '../lib/custom-material.mjs';
import {parseReferencePage} from '../lib/reference-collector.mjs';
const plan=(lag=1,year=2026,extra={})=>validateCustomMaterial({year,lag,...extra});
const draw=(year,issue,zodiac,number=1,drawn_at=null)=>({year,issue:String(issue).padStart(3,'0'),number,zodiac,drawn_at,provenance:'测试已确认开奖'});
const row=(pack,issue)=>pack.rows.find(r=>+r.issue===issue);
test('all twelve supplied opposite pairs are reciprocal',()=>{
 assert.equal(Object.keys(OPPOSITE_ZODIACS).length,12);for(const [z,opposite] of Object.entries(OPPOSITE_ZODIACS)){assert.notEqual(z,opposite);assert.equal(OPPOSITE_ZODIACS[opposite],z);}assert.equal(OPPOSITE_ZODIACS.羊,'牛');assert.equal(OPPOSITE_ZODIACS.兔,'鸡');
});
test('n-1 uses the source zodiac, never the target or numeric zodiac from another year',()=>{
 const data=buildCustomMaterial(plan(),[draw(2026,1,'羊',22),draw(2026,2,'龙',37),draw(2026,3,'狗',9)]);
 assert.equal(row(data,2).killZodiac,'牛');assert.equal(row(data,2).status,'win');assert.equal(row(data,3).killZodiac,'狗');assert.equal(row(data,3).status,'loss');assert.equal(row(data,4).status,'pending');assert.equal(row(data,1).status,'review');assert.equal(data.stats.settled,2);assert.equal(data.stats.rate,50);
});
test('n-6, n-8, n-17 and n-20 match the supplied cross-year arithmetic',()=>{
 for(const [lag,source] of [[6,360],[8,358],[17,349],[20,346]]){
  const data=buildCustomMaterial(plan(lag),[draw(2025,source,'牛',29),draw(2026,1,'牛',29)]);
  assert.equal(row(data,1).sourceYear,2025);assert.equal(+row(data,1).sourceIssue,source);assert.equal(row(data,1).killZodiac,'羊');assert.equal(row(data,1).status,'win');
 }
 const data=buildCustomMaterial(plan(8),[draw(2026,5,'猪',43),draw(2026,13,'蛇',1),draw(2026,10,'兔',27),draw(2026,18,'兔',39)]);assert.equal(row(data,13).status,'loss');assert.equal(row(data,18).killZodiac,'鸡');assert.equal(row(data,18).status,'win');
});
test('a leap-year boundary and explicit 365-period year never compress missing draws',()=>{
 assert.equal(calendarPeriods(2024),366);assert.deepEqual(shiftPeriod(2025,1,-6),{year:2024,issue:'361'});assert.deepEqual(shiftPeriod(2025,1,-6,{2024:365}),{year:2024,issue:'360'});assert.deepEqual(shiftPeriod(2026,1,-366),{year:2024,issue:'366'});
 const data=buildCustomMaterial(plan(6),[draw(2026,1,'羊'),draw(2026,3,'兔'),draw(2026,8,'猪')]);assert.equal(row(data,8).sourceIssue,'002');assert.equal(row(data,8).status,'review');assert.equal(row(data,9).sourceIssue,'003');assert.equal(row(data,9).killZodiac,'鸡');
});
test('source and target missing zodiac remain unverified even if number data exist',()=>{
 const data=buildCustomMaterial(plan(),[draw(2026,1,null,1),draw(2026,2,'龙',3),draw(2026,3,null,5)]);assert.equal(row(data,2).status,'review');assert.equal(row(data,3).status,'review');assert.equal(data.stats.settled,0);assert.equal(data.stats.rate,null);
});
test('2026 killed numbers use only the matching enabled complete annual profile',()=>{
 const profile=parseReferencePage(readFileSync(new URL('./fixtures/reference-2026.html',import.meta.url),'utf8'),2026,'https://example.com/');const draws=[draw(2025,365,'牛',29)];
 assert.deepEqual(row(buildCustomMaterial(plan(),draws,[],profile),1).killNumbers,[12,24,36,48]);for(const reference of [{...profile,year:2025},{...profile,enabled:false},{...profile,zodiacs:{羊:[12]}}])assert.deepEqual(row(buildCustomMaterial(plan(),draws,[],reference),1).killNumbers,[]);
});
test('prediction snapshots retain generation times, draw correction settles again, rule edits start a new basis',()=>{
 const t1='2026-01-02T10:00:00Z',t2='2026-01-02T14:00:00Z',draws=[draw(2026,1,'羊',22,'2026-01-01T13:38:00Z')],p=plan();
 const initial=buildCustomMaterial(p,draws,[],null,null,t1),settled=buildCustomMaterial(p,[...draws,draw(2026,2,'牛',6,'2026-01-02T13:38:00Z')],[],null,initial,t2);assert.equal(row(settled,2).status,'loss');assert.equal(row(settled,2).mode,'forecast');assert.equal(row(settled,2).generatedAt,t1);assert.equal(settled.stats.modes.forecast.loss,1);
 const corrected=buildCustomMaterial(p,[...draws,draw(2026,2,'龙',3,'2026-01-02T13:38:00Z')],[],null,settled,'2026-01-02T15:00:00Z');assert.equal(row(corrected,2).status,'win');assert.equal(row(corrected,2).generatedAt,t1);
 const changed=buildCustomMaterial(plan(2),draws,[],null,settled,t2);assert.equal(row(changed,3).sourceIssue,'001');assert.equal(row(changed,3).generatedAt,t2);
});
test('historical calculations and uncertain draw times do not inflate forecast-only accuracy',()=>{
 const before=buildCustomMaterial(plan(),[draw(2026,1,'羊')],[],null,null,'2026-01-02T10:00:00Z'),data=buildCustomMaterial(plan(),[draw(2026,1,'羊'),draw(2026,2,'牛')],[],null,before,'2026-01-02T14:00:00Z');assert.equal(row(data,2).mode,'unconfirmed');assert.equal(data.stats.modes.forecast.settled,0);assert.equal(data.stats.modes.unconfirmed.loss,1);
 const history=buildCustomMaterial(plan(),[draw(2026,1,'羊'),draw(2026,2,'牛')]);assert.equal(row(history,2).mode,'history');assert.equal(history.stats.modes.history.loss,1);
});
test('unpublished years stay empty, range checks reject malformed rules and counts',()=>{
 assert.deepEqual(buildCustomMaterial(plan(),[]).rows,[]);for(const input of [{lag:0},{lag:367},{lag:1.5},{year:1999},{periodCounts:[]},{periodCounts:{2025:308}},{periodCounts:{2023:365}},{name:'x'.repeat(61)}])assert.throws(()=>plan(1,2026,input));
 const expected=buildCustomMaterial(plan(),[],[{year:2026,issue:'005'}]);assert.equal(expected.rows.length,5);assert.equal(row(expected,5).status,'review');
});
test('a newly created n-k column calculates all 001-308 history, not just the latest issue',()=>{
 const draws=[...Array.from({length:308},(_,i)=>draw(2026,i+1,'牛',29)),...Array.from({length:6},(_,i)=>draw(2025,360+i,'牛',29))];
 const data=buildCustomMaterial(plan(6),draws);assert.equal(data.stats.latestDrawIssue,'308');assert.equal(data.stats.drawn,308);assert.equal(data.stats.settled,308);assert.equal(data.stats.win,308);assert.equal(data.stats.loss,0);assert.equal(data.stats.pending,6);assert.equal(data.stats.modes.history.settled,308);assert.equal(data.rows.some(r=>r.issue==='000'),false);
 for(let i=1;i<=308;i++)assert.equal(row(data,i).status,'win');
});
