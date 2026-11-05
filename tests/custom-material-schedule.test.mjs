import test from 'node:test';
import assert from 'node:assert/strict';
import {customMaterialSchedulePlan} from '../lib/custom-material-schedule.mjs';
const at=value=>Date.parse(value+'+08:00');
test('self materials start at Beijing 21:45, independently of host timezone',()=>{
 const before=customMaterialSchedulePlan({}, {},at('2026-11-05T21:44:59'));assert.equal(before.schedule.time,'21:45');assert.equal(before.schedule.timezone,'Asia/Shanghai');assert.equal(before.due,false);assert.equal(before.nextRun,'2026-11-05T13:45:00.000Z');
 assert.equal(customMaterialSchedulePlan({}, {},at('2026-11-05T21:45:00')).due,true);
 assert.equal(customMaterialSchedulePlan({}, {},at('2026-11-05T23:00:00')).due,true);
});
test('one successful daily run, next day and year rollover',()=>{
 const runtime={lastSuccessDate:'2026-12-31'},done=customMaterialSchedulePlan({},runtime,at('2026-12-31T21:45:00'));assert.equal(done.due,false);assert.equal(done.nextRun,'2027-01-01T13:45:00.000Z');
 assert.equal(customMaterialSchedulePlan({},runtime,at('2027-01-01T21:44:59')).due,false);assert.equal(customMaterialSchedulePlan({},runtime,at('2027-01-01T21:45:00')).due,true);
});
test('moving a completed morning schedule to the evening still runs tonight',()=>{
 const morning={lastSuccessDate:'2026-11-05',lastSuccessAt:'2026-11-05T01:58:25.309Z'};
 const next=customMaterialSchedulePlan({},morning,at('2026-11-05T10:00:00'));assert.equal(next.due,false);assert.equal(next.nextRun,'2026-11-05T13:45:00.000Z');
 assert.equal(customMaterialSchedulePlan({},morning,at('2026-11-05T21:45:00')).due,true);
 const evening={...morning,lastSuccessAt:'2026-11-05T13:46:00Z'};assert.equal(customMaterialSchedulePlan({},evening,at('2026-11-05T21:47:00')).due,false);assert.equal(customMaterialSchedulePlan({},evening,at('2026-11-05T21:47:00')).nextRun,'2026-11-06T13:45:00.000Z');
});
test('failed checks wait for retry and recover, without treating partial success as done',()=>{
 const runtime={lastSuccessDate:'2026-11-04',retryAt:'2026-11-05T13:50:00Z'};
 assert.equal(customMaterialSchedulePlan({},runtime,at('2026-11-05T21:49:59')).due,false);assert.equal(customMaterialSchedulePlan({},runtime,at('2026-11-05T21:50:00')).due,true);
 assert.equal(customMaterialSchedulePlan({},runtime,at('2026-11-06T21:45:00')).due,true);
});
test('disabled plan and configurable time remain daily',()=>{
 const paused=customMaterialSchedulePlan({enabled:false},{},at('2026-11-05T10:00:00'));assert.equal(paused.due,false);assert.equal(paused.nextRun,null);
 assert.equal(customMaterialSchedulePlan({time:'10:15',mode:'interval'},{},at('2026-11-05T10:14:59')).due,false);assert.equal(customMaterialSchedulePlan({time:'10:15'},{},at('2026-11-05T10:15:00')).due,true);
 assert.throws(()=>customMaterialSchedulePlan({time:'25:00'}));assert.throws(()=>customMaterialSchedulePlan({}, {},NaN));
});
