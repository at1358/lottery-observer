import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionLifetime} from '../lib/session-policy.mjs';
test('only a complete Android app marker selects the revocable 90 day lifetime',()=>{
 assert.equal(sessionLifetime('Mozilla/5.0 (Linux; Android 15) WebView PeriodObserverAndroid/1.1.0'),90*86400);
 assert.equal(sessionLifetime('PeriodObserverAndroid/1.0.0'),90*86400);
 for(const agent of ['', 'Mozilla/5.0 Chrome', 'NotPeriodObserverAndroid/1.1.0','PeriodObserverAndroid/1.1.0evil','PeriodObserverAndroid/dev'])assert.equal(sessionLifetime(agent),43200);
});
