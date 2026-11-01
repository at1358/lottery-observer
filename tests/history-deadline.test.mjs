import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHistory,historyUrl,DEFAULT_HISTORY} from '../lib/draw-history.mjs';
import {collectionOutcome,deadlineAt,DEFAULT_DRAW_SCHEDULE} from '../lib/collection-deadline.mjs';
import {statistics,validateDraw} from '../lib/domain.mjs';
import {nextScheduledRun} from '../lib/schedule.mjs';
const html=readFileSync(new URL('./fixtures/macau-history.html',import.meta.url),'utf8');
test('actual history page preserves normal-number order, special number and seven zodiac labels',()=>{
 const rows=parseHistory(html,2026);assert.equal(rows.length,3);const d=rows[0];
 assert.equal(d.issue,'302');assert.deepEqual(d.numbers,[10,2,14,13,11,12,45]);assert.deepEqual(d.zodiacs,['鸡','蛇','蛇','马','猴','羊','狗']);assert.equal(d.number,45);assert.equal(d.zodiac,'狗');assert.equal(d.drawDate,'2026-10-29');assert.equal(d.drawnAt,null);
 assert.throws(()=>parseHistory(html,2025));assert.throws(()=>parseHistory(html.replace('>10<','>02<'),2026));assert.throws(()=>parseHistory('<h1>403 Forbidden</h1>',2026));
 assert.equal(new URL(historyUrl(DEFAULT_HISTORY,2025)).pathname,'/2025.html');
});
test('incomplete arrays, duplicate numbers, shifted zodiac arrays and invalid dates are rejected',()=>{
 const d=parseHistory(html,2026)[0];
 for(const bad of [{numbers:[1,2]},{zodiacs:['狗']},{drawDate:'2026-02-30'},{numbers:[1,2,3,4,5,6,7]}])assert.throws(()=>validateDraw({...d,...bad},true));
});
const source={enabled:1,tracking_from:'2026-10-29T10:00:00.000Z',cutoff_time:'21:35'};
const valid={first_seen:'2026-10-29T11:00:00.000Z',parsed:JSON.stringify({valid:true})};
test('missing current issue remains pending until 21:35 Beijing, then fails independently of network status',()=>{
 assert.equal(collectionOutcome(source,null,'2026-10-29','2026-10-29T13:34:59Z'),null);
 const failure=collectionOutcome(source,null,'2026-10-29','2026-10-29T13:35:00Z');assert.equal(failure.status,'failed');assert.match(failure.reason,/未采集到当期资料/);
 assert.equal(collectionOutcome(source,valid,'2026-10-29','2026-10-29T13:35:00Z').status,'collected');
 assert.equal(deadlineAt('2026-10-29'),'2026-10-29T13:35:00.000Z');
});
test('late capture and incomplete parsing fail, paused sources and periods before activation are skipped',()=>{
 assert.equal(collectionOutcome(source,{...valid,first_seen:'2026-10-29T13:40:00Z'},'2026-10-29','2026-10-29T14:00:00Z').status,'failed');
 assert.equal(collectionOutcome(source,{...valid,parsed:{valid:false}},'2026-10-29','2026-10-29T14:00:00Z').status,'failed');
 assert.equal(collectionOutcome({...source,enabled:0},null,'2026-10-29','2026-10-29T14:00:00Z'),null);
 assert.equal(collectionOutcome(source,null,'2026-10-28','2026-10-29T14:00:00Z'),null);
 assert.equal(collectionOutcome({...source,tracking_from:'2026-10-29T14:00:00Z'},null,'2026-10-29','2026-10-29T14:00:00Z'),null);
});
test('failed collection is counted separately and excluded from accuracy denominator',()=>{
 const s=statistics(['win','loss','collection_failed','collection_failed'].map(status=>({verdict:{status}})));assert.equal(s.collectionFailed,2);assert.equal(s.settled,2);assert.equal(s.rate,50);assert.equal(s.errorRate,50);
 assert.equal(nextScheduledRun(DEFAULT_DRAW_SCHEDULE,'2026-10-30T13:37:00Z'),'2026-10-30T13:38:00.000Z');
 assert.equal(nextScheduledRun(DEFAULT_DRAW_SCHEDULE,'2026-10-30T13:39:00Z'),'2026-10-31T13:38:00.000Z');
 assert.equal(nextScheduledRun({mode:'daily',time:'19:00'},'2026-10-30T10:00:00Z'),'2026-10-30T11:00:00.000Z');
 assert.equal(nextScheduledRun({mode:'interval',interval:120},'2026-10-30T10:00:00Z'),'2026-10-30T12:00:00.000Z');
});
