import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statistics,evaluate,parsePrediction} from '../lib/domain.mjs';
const row=(year,issue,status)=>({year,issue,verdict:{status}});
test('latest verified loss uses year and numeric issue, independently of input order',()=>{
 const rows=[row(2026,'9','loss'),row(2025,'365','loss'),row(2026,'101','win'),row(2026,'10','loss'),row(2026,'311','collection_failed'),row(2026,'312','review'),row(2026,'313','pending')],original=structuredClone(rows);
 const stats=statistics(rows);assert.deepEqual(stats.latestLoss,{year:2026,issue:'010'});assert.equal(stats.loss,3);assert.equal(stats.settled,4);assert.deepEqual(rows,original);
});
test('no verified loss has no latest loss, including missing period metadata',()=>{
 for(const rows of [[],[row(2026,'001','win')],[row(2026,'002','pending'),row(2026,'003','collection_failed')],[{verdict:{status:'loss'}}]])assert.equal(statistics(rows).latestLoss,null);
});
test('latest loss refreshes when a matching draw is added or corrected, ignoring the page claim',()=>{
 const p={year:2026,issue:'305',kind:'号码',parsed:parsePrediction('305期:号码【01 02】特开:狗21准','号码')};
 const report=draw=>statistics([{...p,verdict:evaluate(p,draw)}]);
 assert.equal(report(null).latestLoss,null);assert.deepEqual(report({number:21}).latestLoss,{year:2026,issue:'305'});assert.equal(report({number:2}).latestLoss,null);
});

test('latest correct period uses verified wins, numeric issue and year without changing rates',()=>{
 const rows=[row(2025,'365','win'),row(2026,'9','win'),row(2026,'10','win'),row(2026,'011','loss'),row(2026,'312','pending'),row(2026,'313','review'),row(2026,'314','collection_failed')],before=structuredClone(rows),s=statistics(rows);
 assert.deepEqual(s.latestWin,{year:2026,issue:'010'});assert.equal(s.win,3);assert.equal(s.loss,1);assert.equal(s.rate,75);assert.deepEqual(rows,before);
 for(const invalid of [row(2026,'0','win'),row(2026,'367','win'),row(1999,'365','win'),{verdict:{status:'win'}}])assert.equal(statistics([invalid]).latestWin,null);
 assert.equal(statistics([row(2026,'001','loss')]).latestWin,null);assert.equal(statistics([]).latestWin,null);
});

test('latest correct period responds to actual draw arrival and correction independently of claimed result',()=>{
 const p={year:2026,issue:'305',kind:'号码',parsed:parsePrediction('305期:号码【01 02】特开:狗21准','号码')},report=draw=>statistics([{...p,verdict:evaluate(p,draw)}]);
 assert.equal(report(null).latestWin,null);assert.deepEqual(report({number:2}).latestWin,{year:2026,issue:'305'});assert.equal(report({number:21}).latestWin,null);
});
