import test from 'node:test';import assert from 'node:assert/strict';
import {collectionWindowOpen,nextRecoveryAt,nextCollectionDay,nextSourceCollection} from '../lib/collection-retry.mjs';
const daily={schedule_mode:'daily',daily_time:'19:00',interval:120},defaults={mode:'interval',interval:120,time:'16:30'};
test('failed sources retry in 60 minutes regardless of their normal daily or interval plan',()=>{
 const at='2026-11-05T10:10:00+08:00';assert.equal(nextSourceCollection(daily,defaults,true,at),'2026-11-05T03:10:00.000Z');assert.equal(nextSourceCollection({schedule_mode:'interval',interval:240},defaults,true,at),'2026-11-05T03:10:00.000Z');
});
test('21:30 is a hard automatic collection boundary, with correct next business day dates',()=>{
 assert.equal(collectionWindowOpen('2026-11-05T21:29:59+08:00'),true);assert.equal(collectionWindowOpen('2026-11-05T21:30:00+08:00'),false);assert.equal(nextRecoveryAt('2026-11-05T20:30:00+08:00'),null);assert.equal(nextRecoveryAt('2026-11-05T20:29:00+08:00'),'2026-11-05T13:29:00.000Z');assert.equal(nextSourceCollection(daily,defaults,true,'2026-11-05T20:30:00+08:00'),'2026-11-06T11:00:00.000Z');assert.equal(nextCollectionDay({schedule_mode:'interval',interval:60},defaults,'2026-11-05T21:31:00+08:00'),'2026-11-05T16:00:00.000Z');
});
test('a combination earlier cutoff still applies and normal collection keeps its chosen start',()=>{
 assert.equal(nextRecoveryAt('2026-11-05T18:30:00+08:00','19:00'),null);assert.equal(nextSourceCollection(daily,defaults,false,'2026-11-05T10:00:00+08:00'),'2026-11-05T11:00:00.000Z');assert.equal(nextSourceCollection({schedule_mode:'interval',interval:120},defaults,false,'2026-11-05T20:00:00+08:00'),'2026-11-05T16:00:00.000Z');
});
