import {test} from 'node:test';
import assert from 'node:assert/strict';
import {descendants,validateParent,folderPath} from '../lib/directory.mjs';
import {hashPassword,verifyPassword,passwordPolicy} from '../lib/password.mjs';
import {estimatedExecution} from '../lib/schedule.mjs';
test('directory paths preserve nesting, prevent cycles and reject missing parents',()=>{const f=[{id:'a',name:'36码',parent_id:null},{id:'b',name:'作者',parent_id:'a'},{id:'c',name:'另一目录',parent_id:null}];assert.deepEqual([...descendants(f,'a')],['a','b']);assert.equal(folderPath(f,'b'),'36码 / 作者');assert.throws(()=>validateParent(f,'a','b'));assert.throws(()=>validateParent(f,'a','missing'));validateParent(f,'b','c');});
test('password salts vary and verification rejects wrong passwords and malformed hashes',async()=>{const a=await hashPassword('Local-only-testing-password'),b=await hashPassword('Local-only-testing-password');assert.notEqual(a,b);assert.equal(await verifyPassword('Local-only-testing-password',a),true);assert.equal(await verifyPassword('wrong',a),false);assert.equal(await verifyPassword('anything','bad'),false);assert.throws(()=>passwordPolicy('short'));});
test('Linux minute timer does not inherit the hosted hourly offset',()=>{assert.equal(estimatedExecution('2026-10-30T11:00:00Z','2026-10-30T10:00:00Z','standalone'),'2026-10-30T11:00:00.000Z');assert.equal(estimatedExecution('2026-10-30T11:00:01Z','2026-10-30T10:00:00Z','standalone'),'2026-10-30T11:01:00.000Z');});

test('folder depth includes the folder being created or moved',()=>{const f=Array.from({length:8},(_,i)=>({id:String(i),name:String(i),parent_id:i?String(i-1):null}));assert.throws(()=>validateParent(f,null,'7'));validateParent(f,null,'6');});
