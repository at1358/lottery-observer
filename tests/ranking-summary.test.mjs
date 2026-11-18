import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRankingSummary} from '../lib/ranking-summary.mjs';
const at=Date.parse('2026-11-15T10:00:00+08:00'),expected={'2026-319':{year:2026,issue:'319',date:'2026-11-15'}},draws=[316,317,318].map(issue=>({year:2026,issue:String(issue),number:1}));
const source=(id,name,kind='号码',year=2026)=>({id,name,kind,year});
const prediction=(id,issue,status,values=[1,2],extra={})=>({source_id:id,year:2026,issue:String(issue),parsed:{valid:status!=='review',values,warnings:[]},verdict:{status},...extra});
const custom=(id,type,declaredCount,rows)=>({plan:{id,name:id,type,declaredCount,year:2026},rows:rows.map(r=>({year:2026,valid:true,killNumbers:[1,2],...r}))});
const options={at,expected,draws};
const group=(summary,id)=>summary.groups.find(g=>g.id===id);
test('classifies collected and custom recommendation sizes without mixing kills, 24/35 codes or custom36',()=>{
 const summary=buildRankingSummary({...options,sources:[source('a','白小姐【主攻⒖码】'),source('b','经典⑿码'),source('c','必中㊱码'),source('d','杀15码','杀号码'),source('e','24码','24码'),source('f','十二码'),source('g','已删除15码','15码')].map(s=>s.id==='g'?{...s,deleted_batch:'trash'}:s),materials:[custom('manual12','manual-numbers',12,[]),custom('manual15','manual-numbers',15,[]),custom('manualKill','manual-kill',15,[]),custom('manual36','manual-numbers',36,[]),custom('lag',undefined,undefined,[])]});
 assert.deepEqual(group(summary,'numbers').rows.map(r=>r.id).sort(),['a','b','f','manual12','manual15']);assert.deepEqual(group(summary,'thirtySix').rows.map(r=>r.id),['c']);assert.deepEqual(group(summary,'zodiacs').rows.map(r=>r.id),['lag']);
});
test('uses confirmed current issue for all columns instead of far future custom rows',()=>{
 const summary=buildRankingSummary({...options,sources:[source('a','15码','15码')],predictions:[prediction('a',318,'win')],materials:[custom('lag','lag-zodiac',null,[{issue:'338',killZodiac:'鼠',status:'pending'},{issue:'319',killZodiac:'猪',status:'pending'},{issue:'318',killZodiac:'狗',status:'win'}]),custom('manual','manual-numbers',15,[{issue:'365',status:'pending'},{issue:'319',status:'pending'},{issue:'318',status:'loss'}])]});
 assert.equal(summary.period.issue,'319');assert.equal(group(summary,'zodiacs').rows[0].latest.values[0],'猪');assert.equal(group(summary,'numbers').rows.find(r=>r.id==='a').latest,null);assert.equal(group(summary,'numbers').rows.find(r=>r.id==='manual').latest.issue,'319');assert.equal(group(summary,'numbers').rows.find(r=>r.id==='manual').stats.total,2);
});
test('counts all years scoped records before pagination, excludes unverified and preserves latest loss',()=>{
 const rows=Array.from({length:318},(_,i)=>prediction('a',i+1,'win'));rows[315]=prediction('a',316,'loss');rows[316]=prediction('a',317,'review');rows[317]=prediction('a',318,'collection_failed');rows.push(prediction('a',319,'pending'),prediction('a',320,'win'),prediction('a',1,'loss',[1],{year:2025}));
 const item=group(buildRankingSummary({...options,sources:[source('a','15码','15码')],predictions:rows}),'numbers').rows[0];assert.equal(item.stats.win,315);assert.equal(item.stats.loss,1);assert.equal(item.stats.settled,316);assert.equal(item.stats.total,319);assert.equal(item.stats.currentStreak,0);assert.deepEqual(item.stats.latestLoss,{year:2026,issue:'316'});assert.equal(item.stats.rate,315/316*100);
});
test('streak ends at latest actual draw, breaks for gaps/review/failure and ignores future predictions',()=>{
 for(const [statuses,want] of [[['win','win','win'],3],[['win','review','win'],1],[['win','loss','win'],1],[['win','collection_failed','win'],1],[['win',null,'win'],1],[['win','win',null],0]]){
  const records=statuses.flatMap((status,i)=>status?[prediction('a',316+i,status)]:[]);records.push(prediction('a',319,'pending'));
  const item=group(buildRankingSummary({...options,sources:[source('a','36码','36码')],predictions:records}),'thirtySix').rows[0];assert.equal(item.stats.currentStreak,want);assert.equal(item.stats.streakThrough,'318');
 }
});
test('year selection resets streak, includes historical custom stats and never advances to annual prefilled rows',()=>{
 const summary=buildRankingSummary({...options,year:'2025',draws:[...draws,{year:2025,issue:'365',number:1}],materials:[{plan:{id:'old',name:'old',year:2025,lag:1},rows:[{year:2025,issue:'365',status:'loss',killZodiac:'鼠',killNumbers:[1]}]}]});
 assert.equal(summary.period.issue,'365');const item=group(summary,'zodiacs').rows[0];assert.equal(item.stats.loss,1);assert.equal(item.stats.currentStreak,0);assert.equal(item.latest.values[0],'鼠');assert.equal(summary.year,2025);assert.throws(()=>buildRankingSummary({...options,year:'invalid'}),/排行年份/);
});
test('missing data and zero settled periods have no fabricated percentages',()=>{
 const summary=buildRankingSummary({...options,sources:[source('a','主攻15码','15码')],predictions:[prediction('a',319,'review')]});const g=group(summary,'numbers');assert.equal(g.ready,0);assert.equal(g.rows[0].stats.rate,null);assert.equal(g.rows[0].stats.latestLoss,null);
 const empty=buildRankingSummary({at});assert.equal(empty.period.issue,null);assert.ok(empty.groups.every(g=>g.rows.length===0));
});
test('first complete forecast values are retained and collection failure cannot count as ready',()=>{
 const complete=prediction('a',319,'pending',[1,2,3],{recoveredFromPlaceholder:true,initial_raw:'00'}),summary=buildRankingSummary({...options,sources:[source('a','主攻15码','15码')],predictions:[complete]});assert.deepEqual(group(summary,'numbers').rows[0].latest.values,[1,2,3]);assert.equal(group(summary,'numbers').ready,1);
 complete.verdict.status='collection_failed';assert.equal(group(buildRankingSummary({...options,sources:[source('a','15码','15码')],predictions:[complete]}),'numbers').ready,0);
});
test('latest correct issue is the newest verified win, separate from streak and latest error',()=>{
 const rows=[prediction('a',319,'pending'),prediction('a',318,'loss'),prediction('a',317,'win'),prediction('a',316,'review'),prediction('a',315,'win'),prediction('a',320,'win'),prediction('a',365,'win',[1],{year:2025})];
 const summary=buildRankingSummary({...options,sources:[source('a','主攻15码','15码')],predictions:rows,materials:[custom('lag','lag-zodiac',null,[{issue:'319',killZodiac:'鼠',status:'pending'},{issue:'318',killZodiac:'牛',status:'win'},{issue:'317',status:'loss'}])]});
 const item=group(summary,'numbers').rows[0];assert.deepEqual(item.stats.latestWin,{year:2026,issue:'317'});assert.deepEqual(item.stats.latestLoss,{year:2026,issue:'318'});assert.equal(item.stats.currentStreak,0);assert.deepEqual(group(summary,'zodiacs').rows[0].stats.latestWin,{year:2026,issue:'318'});
 const onlyLoss=group(buildRankingSummary({...options,sources:[source('b','36码','36码')],predictions:[prediction('b',318,'loss')]}),'thirtySix').rows[0];assert.equal(onlyLoss.stats.latestWin,null);
});

test('36-code complement is exactly the 13 absent numbers from the same complete current period',()=>{
 const values=Array.from({length:36},(_,i)=>i+1),record=prediction('a',319,'pending',values),before=structuredClone(record),source36=source('a','必中36码','36码');
 const build=rows=>group(buildRankingSummary({...options,sources:[source36],predictions:rows}),'thirtySix').rows[0];
 assert.deepEqual(build([record]).latest.missingNumbers,Array.from({length:13},(_,i)=>i+37));assert.deepEqual(record,before);
 assert.deepEqual(build([prediction('a',319,'win',values.map(n=>n+13))]).latest.missingNumbers,Array.from({length:13},(_,i)=>i+1));
 for(const bad of [values.slice(1),[...values.slice(0,-1),1],[0,...values.slice(1)],[50,...values.slice(1)],values.map(String)])assert.equal(build([prediction('a',319,'pending',bad)]).latest.missingNumbers,null);
 assert.equal(build([prediction('a',319,'review',values)]).latest.missingNumbers,null);assert.equal(build([prediction('a',319,'collection_failed',values)]).latest.missingNumbers,null);
 assert.equal(build([prediction('a',318,'win',values)]).latest,null);
 const fifteen=group(buildRankingSummary({...options,sources:[source('b','15码','15码')],predictions:[prediction('b',319,'pending',values.slice(0,15))]}),'numbers').rows[0];assert.ok(!Object.hasOwn(fifteen.latest,'missingNumbers'));
});
