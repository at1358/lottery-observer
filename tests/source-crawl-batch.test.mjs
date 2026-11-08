import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectSourceBatch} from '../lib/source-crawl-batch.mjs';
test('all sources collected sequentially including paused; failures isolated; empty URLs skipped and IDs deduplicated',async()=>{
 const input=[{id:'a',name:'正常',url:'https://a.example'},{id:'bad',name:'失败',url:'https://bad.example'},{id:'paused',name:'暂停来源',url:'https://p.example',enabled:false},{id:'empty',name:'未配置',url:''},{id:'a',name:'正常',url:'https://a.example'}],original=structuredClone(input),calls=[],snapshots=[];let active=0;
 const result=await collectSourceBatch(input,async id=>{assert.equal(active++,0);calls.push(id);await Promise.resolve();active--;if(id==='bad')throw Error('正文暂不可用');return {inserted:id==='a'?2:1,changed:1};},r=>snapshots.push(r));
 assert.deepEqual(calls,['a','bad','paused']);assert.deepEqual(input,original);assert.equal(result.total,4);assert.equal(result.finished,4);assert.equal(result.success,2);assert.equal(result.failed,1);assert.equal(result.skipped,1);assert.equal(result.inserted,3);assert.equal(result.changed,2);assert.equal(result.rows[1].message,'正文暂不可用');assert.equal(snapshots[0].rows[0].status,'queued');assert.equal(snapshots[1].rows[0].status,'running');assert.equal(snapshots.at(-1).finished,4);
});
test('empty and unconfigured sources issue no requests',async()=>{
 const collect=()=>{throw Error('Must not collect')};assert.equal((await collectSourceBatch([],collect)).total,0);const result=await collectSourceBatch([{id:'empty',url:''}],collect);assert.equal(result.skipped,1);assert.equal(result.failed,0);
});
