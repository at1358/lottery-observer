import test from 'node:test';import assert from 'node:assert/strict';
import {validatePurge,planPurgeKeys,purgedPeriodKey} from '../lib/trash-purge.mjs';
const id='01234567-89ab-cdef-0123-456789abcdef';
test('permanent deletion requires the exact confirmation and validates a bounded unique selection',()=>{
 assert.deepEqual(validatePurge({ids:[id,id],confirmation:'彻底删除'}),[id]);
 for(const input of [{ids:[id]}, {ids:[id],confirmation:true},{ids:[],confirmation:'彻底删除'},{ids:['%'],confirmation:'彻底删除'},{ids:Array(501).fill(id),confirmation:'彻底删除'}])assert.throws(()=>validatePurge(input));
});
test('owned-plan keys use exact IDs and delimited prefixes, and permanent period keys retain no content',()=>{
 const keys=planPurgeKeys('combination',id);assert.ok(keys.exact.includes('combinationPlan:'+id));assert.ok(keys.prefix.includes('combinationFailureDelivery:'+id+':'));assert.ok(keys.prefix.every(p=>p.endsWith(id+':')));assert.equal(purgedPeriodKey(id,'2026','1'),'purgedPeriod:'+id+':2026:001');assert.ok(planPurgeKeys('simulation',id).prefix.includes('simulationArchive:'+id+':'));assert.throws(()=>planPurgeKeys('simulation','*'));assert.throws(()=>planPurgeKeys('source',id));
});
