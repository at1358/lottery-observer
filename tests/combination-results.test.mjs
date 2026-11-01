import test from 'node:test';import assert from 'node:assert/strict';
import {combinationPeriodReport} from '../lib/combination-results.mjs';
const draw={year:2026,issue:'305',number:17,zodiac:'虎',drawn_at:'2026-11-01T13:35:00Z'};
const result=(patch={})=>({year:2026,issue:'305',status:'complete',numbers:[1,17],createdAt:'2026-11-01T11:00:00Z',historical:false,...patch});
test('new draws settle stored candidate numbers and calculate rate without rerunning collection',()=>{
 const report=combinationPeriodReport([result(),result({issue:'304',numbers:[1]})],[draw,{...draw,issue:'304'}]);assert.equal(report.stats.forecast.win,1);assert.equal(report.stats.forecast.loss,1);assert.equal(report.stats.forecast.rate,.5);assert.equal(report.periods[0].settlement.number,17);
});
test('one period counts once and its earliest complete forecast wins over a later successful edit',()=>{
 const report=combinationPeriodReport([result({numbers:[1]}),result({createdAt:'2026-11-01T12:00:00Z'}),result({createdAt:'2026-11-01T14:00:00Z',historical:true})],[draw]);assert.equal(report.periods.length,1);assert.equal(report.stats.forecast.loss,1);assert.equal(report.stats.forecast.win,0);assert.equal(report.periods[0].snapshotCount,3);
});
test('backtests, known late calculations, pending results and blocked periods do not inflate forecast accuracy',()=>{
 const report=combinationPeriodReport([result({backtest:true,historical:true}),result({issue:'304',createdAt:'2026-11-01T15:00:00Z'}),result({issue:'306'}),result({issue:'307',status:'blocked',numbers:[]})],[draw,{...draw,issue:'304'}]);assert.equal(report.stats.forecast.settled,0);assert.equal(report.stats.history.win,2);assert.equal(report.pending,1);assert.equal(report.blocked,1);
});
test('date-only draws remain separately unconfirmed; draw correction updates settlement',()=>{
 assert.equal(combinationPeriodReport([result()],[{...draw,drawn_at:null}]).stats.unconfirmed.win,1);assert.equal(combinationPeriodReport([result()],[{...draw,number:2}]).stats.forecast.loss,1);
});
