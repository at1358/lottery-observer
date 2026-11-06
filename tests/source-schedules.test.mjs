import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSourceScheduleBatch} from '../lib/source-schedules.mjs';
test('batch schedule validation requires an explicit valid time or interval and deduplicates IDs',()=>{
 const daily=validateSourceScheduleBatch({ids:['one','one','two'],schedule:{mode:'daily',time:'19:00',enabled:false}});assert.deepEqual(daily.ids,['one','two']);assert.equal(daily.schedule.time,'19:00');assert.equal(daily.schedule.timezone,'Asia/Shanghai');
 assert.equal(validateSourceScheduleBatch({ids:['one'],schedule:{mode:'interval',interval:120}}).schedule.interval,120);assert.equal(validateSourceScheduleBatch({ids:['one'],schedule:{mode:'inherit'}}).schedule.mode,'inherit');
 for(const schedule of [{},{mode:'daily'},{mode:'daily',time:'24:00'},{mode:'daily',time:'7:30'},{mode:'interval'},{mode:'interval',interval:''},{mode:'interval',interval:59},{mode:'interval',interval:60.5},{mode:'unknown'}])assert.throws(()=>validateSourceScheduleBatch({ids:['one'],schedule}));
 for(const ids of [null,[],[''],[null],Array.from({length:501},(_,i)=>'id'+i)])assert.throws(()=>validateSourceScheduleBatch({ids,schedule:{mode:'inherit'}}));
});
