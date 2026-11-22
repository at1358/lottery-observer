import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateProbability,forecastSchedule,forecastTarget,historicalInterval,visibleForecast,forecastSignature,numericBaseline} from '../lib/probability-forecast.mjs';
const target={year:2026,issue:'031',date:'2026-11-05'},rows=Array.from({length:30},(_,i)=>({year:2026,issue:String(i+1).padStart(3,'0'),status:i<20?'win':'loss',mode:'history'}));
test('smoothed estimate and complementary rates use actual settled outcomes only',()=>{
 const result=estimateProbability([...rows,{year:2026,issue:'031',status:'win'},{year:2026,issue:'032',status:'win'},{year:2025,issue:'001',status:'win'},...['pending','review','collection_failed'].map((status,i)=>({year:2026,issue:String(32+i),status}))],target);
 assert.equal(result.samples,30);assert.equal(result.win,20);assert.equal(result.loss,10);assert.equal(result.correct,65.6);assert.equal(result.error,34.4);assert.equal(result.correct+result.error,100);assert.equal(result.historySamples,30);
 assert.equal(result.firstIssue,'001');assert.equal(result.lastIssue,'030');assert.equal(result.excluded,6);
});
test('small samples have no fabricated forecast and all-win/all-loss histories never promise certainty',()=>{
 const result=estimateProbability(rows.slice(0,19),target);assert.equal(result.status,'insufficient');assert.equal(result.correct,null);assert.equal(result.interval,null);
 for(const status of ['win','loss']){const forecast=estimateProbability(rows.map(r=>({...r,status})),target);assert.ok(forecast.correct>0&&forecast.correct<100);assert.ok(forecast.interval[0]<=forecast.correct&&forecast.correct<=forecast.interval[1]);}
 assert.equal(estimateProbability([],target).samples,0);
});
test('conflicting duplicates are removed; same-result duplicates never increase the denominator',()=>{
 const result=estimateProbability([...rows,rows[0],{...rows[1],status:'loss'}],target);assert.equal(result.samples,29);assert.equal(result.win,19);assert.equal(result.excluded,3);
 assert.deepEqual(rows[0],{year:2026,issue:'001',status:'win',mode:'history'});
});
test('recent 120 settled issues are selected by period, independently of input order',()=>{
 const values=Array.from({length:200},(_,i)=>({year:2026,issue:String(i+1).padStart(3,'0'),status:i<80?'win':'loss'}));
 const value=estimateProbability(values.reverse(),{...target,issue:'201'});assert.equal(value.samples,120);assert.equal(value.win,0);assert.equal(value.firstIssue,'081');assert.equal(value.available,200);
});
test('Wilson historical interval remains bounded and handles zero samples',()=>{
 assert.equal(historicalInterval(0,0),null);assert.deepEqual(historicalInterval(50,100),[40.4,59.6]);assert.deepEqual(historicalInterval(0,20),[0,16.1]);assert.deepEqual(historicalInterval(20,20),[83.9,100]);
});
test('Beijing noon schedule, early manual update, retries and next-day rollover',()=>{
 const at=Date.parse('2026-11-05T12:00:00+08:00');assert.equal(forecastSchedule({},at-1).due,false);assert.equal(forecastSchedule({},at).due,true);
 const early={lastSuccessDate:'2026-11-05',lastSuccessAt:new Date(at-60000).toISOString()};assert.equal(forecastSchedule(early,at).due,true);
 const done={lastSuccessDate:'2026-11-05',lastSuccessAt:new Date(at).toISOString()};assert.equal(forecastSchedule(done,at+1).due,false);assert.equal(forecastSchedule(done,at+86400000).due,true);assert.equal(forecastSchedule(done,at).nextRun,'2026-11-06T04:00:00.000Z');
 assert.equal(forecastSchedule({retryAt:new Date(at+300000).toISOString()},at).due,false);assert.equal(forecastSchedule({closedDate:'2026-11-05'},at).due,false);
});
test('only trusted un-drawn current periods are eligible, no target guessed from source rows',()=>{
 assert.equal(forecastTarget([],{},Date.parse('2026-11-05T12:00:00+08:00')).ready,false);
 const expected={'2026-031':{year:2026,issue:'031',date:'2026-11-05'}};
 assert.equal(forecastTarget([],expected,Date.parse('2026-11-05T12:00:00+08:00')).issue,'031');
 assert.equal(forecastTarget([{year:2026,issue:'031',number:1}],expected,Date.parse('2026-11-05T12:00:00+08:00')).ready,false);
});
test('read-time status hides obsolete, already drawn and changed-rule estimates',()=>{
 const source={id:'a',year:2026,kind:'15码'},pack={items:{'collected:a':{status:'estimated',target,signature:forecastSignature(source)}}},at=Date.parse('2026-11-05T12:00:00+08:00');
 assert.equal(visibleForecast(pack,source,'collected',[],at).status,'estimated');assert.equal(visibleForecast(pack,{...source,kind:'36码'},'collected',[],at).status,'changed');
 assert.equal(visibleForecast(pack,source,'collected',[{year:2026,issue:'031'}],at).status,'closed');assert.equal(visibleForecast(pack,source,'collected',[],at+86400000).status,'stale');assert.equal(visibleForecast(null,source,'collected',[],at).status,'waiting');
});
test('uniform-number benchmark distinguishes recommendation and elimination, never treats zodiac labels as numbers',()=>{
 assert.equal(numericBaseline('15码',Array.from({length:15},(_,i)=>i+1)),30.6);assert.equal(numericBaseline('manual-kill',[1,2,3,4,5]),89.8);
 assert.equal(numericBaseline('生肖',['虎','兔']),null);assert.equal(numericBaseline('号码',[1,1]),null);assert.equal(numericBaseline('号码',[0]),null);
});
