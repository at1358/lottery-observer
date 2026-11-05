import test from 'node:test';
import assert from 'node:assert/strict';
import {customMaterialSchedulePlan} from '../lib/custom-material-schedule.mjs';
const at=value=>Date.parse(value+'+08:00');
test('self materials start at Beijing 09:45, independently of host timezone',()=>{
 const before=customMaterialSchedulePlan({}, {},at('2026-11-05T09:44:59'));assert.equal(before.schedule.time,'09:45');assert.equal(before.schedule.timezone,'Asia/Shanghai');assert.equal(before.due,false);assert.equal(before.nextRun,'2026-11-05T01:45:00.000Z');
 assert.equal(customMaterialSchedulePlan({}, {},at('2026-11-05T09:45:00')).due,true);
 assert.equal(customMaterialSchedulePlan({}, {},at('2026-11-05T23:00:00')).due,true);
});
test('one successful daily run, next day and year rollover',()=>{
 const runtime={lastSuccessDate:'2026-12-31'},done=customMaterialSchedulePlan({},runtime,at('2026-12-31T09:45:00'));assert.equal(done.due,false);assert.equal(done.nextRun,'2027-01-01T01:45:00.000Z');
 assert.equal(customMaterialSchedulePlan({},runtime,at('2027-01-01T09:44:59')).due,false);assert.equal(customMaterialSchedulePlan({},runtime,at('2027-01-01T09:45:00')).due,true);
});
test('failed checks wait for retry and recover, without treating partial success as done',()=>{
 const runtime={lastSuccessDate:'2026-11-04',retryAt:'2026-11-05T01:50:00Z'};
 assert.equal(customMaterialSchedulePlan({},runtime,at('2026-11-05T09:49:59')).due,false);assert.equal(customMaterialSchedulePlan({},runtime,at('2026-11-05T09:50:00')).due,true);
 assert.equal(customMaterialSchedulePlan({},runtime,at('2026-11-06T09:45:00')).due,true);
});
test('disabled plan and configurable time remain daily',()=>{
 const paused=customMaterialSchedulePlan({enabled:false},{},at('2026-11-05T10:00:00'));assert.equal(paused.due,false);assert.equal(paused.nextRun,null);
 assert.equal(customMaterialSchedulePlan({time:'10:15',mode:'interval'},{},at('2026-11-05T10:14:59')).due,false);assert.equal(customMaterialSchedulePlan({time:'10:15'},{},at('2026-11-05T10:15:00')).due,true);
 assert.throws(()=>customMaterialSchedulePlan({time:'25:00'}));assert.throws(()=>customMaterialSchedulePlan({}, {},NaN));
});
