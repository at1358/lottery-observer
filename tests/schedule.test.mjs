import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextScheduledRun,estimatedExecution,effectiveSchedule,validateSchedule} from '../lib/schedule.mjs';
test('daily 16:30 uses Beijing time before and after cutoff',()=>{
 const schedule={mode:'daily',time:'16:30',interval:60};
 assert.equal(nextScheduledRun(schedule,'2026-10-29T08:29:00Z'),'2026-10-29T08:30:00.000Z');
 assert.equal(nextScheduledRun(schedule,'2026-10-29T08:30:00Z'),'2026-10-30T08:30:00.000Z');
 assert.equal(nextScheduledRun(schedule,'2026-10-29T10:30:00Z'),'2026-10-30T08:30:00.000Z');
});
test('midnight and year change do not use execution host timezone',()=>{
 assert.equal(nextScheduledRun({mode:'daily',time:'00:10'},'2026-12-31T15:59:00Z'),'2026-12-31T16:10:00.000Z');
 assert.equal(nextScheduledRun({mode:'daily',time:'00:10'},'2026-12-31T16:11:00Z'),'2027-01-01T16:10:00.000Z');
});
test('actual hourly checkpoint is disclosed separately from requested time',()=>{
 assert.equal(estimatedExecution('2026-10-29T08:30:00Z','2026-10-29T08:00:00Z'),'2026-10-29T08:30:00.000Z');
 assert.equal(estimatedExecution('2026-10-29T08:45:00Z','2026-10-29T08:00:00Z'),'2026-10-29T09:30:00.000Z');
});
test('source inherits global plan or explicitly overrides it',()=>{
 const global={mode:'daily',time:'16:30',interval:120,enabled:true};
 assert.equal(effectiveSchedule({schedule_mode:'inherit',interval:60},global).time,'16:30');
 const independent=effectiveSchedule({schedule_mode:'daily',daily_time:'19:30',interval:60},global);assert.equal(independent.time,'19:30');
 assert.throws(()=>validateSchedule({mode:'daily',time:'25:30'}));assert.throws(()=>validateSchedule({mode:'interval',interval:5}));
});
