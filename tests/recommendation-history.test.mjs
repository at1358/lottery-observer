import test from 'node:test';import assert from 'node:assert/strict';
import {interpretation,compareRecommendations,afterDrawStatus} from '../lib/recommendation-history.mjs';
const compare=(a,b,kind,name='')=>compareRecommendations(interpretation(a,kind,name),interpretation(b,kind,name),kind,kind);
test('the reported segment edit changes the recommendation, but dog21 and 准/中 annotations do not',()=>{
 const first='304期:绝杀一段【4段】特开:？00准';assert.equal(compare(first,'304期:绝杀一段【3段】特开:？00准','杀段').changed,true);
 for(const end of ['狗21准','狗21中'])assert.equal(compare(first,'304期:绝杀一段【4段】特开:'+end,'杀段').changed,false);
});
test('the reported five-number multiline examples ignore result updates and detect actual number replacement',()=>{
 const first='304期:真挚情怀☯️稳杀五码☯️特开:？00中\n【03.12.15.19.27】',result=first.replace('？00','狗21');
 assert.equal(compare(first,result,'杀号码','真挚情怀稳杀五码').changed,false);
 assert.equal(compare(first,result.replace('03.12.15.19.27','03.08.01.45.22'),'杀号码','真挚情怀稳杀五码').changed,true);
 assert.equal(compare(first,result.replace('03.12.15.19.27','27、19、15、12、03'),'杀号码','真挚情怀稳杀五码').changed,false);
});
test('zodiacs, tails and elements are compared semantically instead of text formatting',()=>{
 assert.equal(compare('304期杀肖【虎兔】开？00准','304期杀肖【兔虎】开狗21中','杀肖').changed,false);
 assert.equal(compare('304期杀尾【1尾】','304期杀尾【2尾】','杀尾').changed,true);
 assert.equal(compare('304期杀行【金行】','304期杀行【木行】','杀行').changed,true);
 assert.equal(compare('304期杀行【金行】','304期杀行【金行】 特开:狗21准','杀行').changed,false);
});
test('capture metadata is not a recommendation edit; a changed explicit classification can be one',()=>{
 const before={valid:true,values:[3],sourceRules:{segments:Object.fromEntries(Array.from({length:49},(_,i)=>[i+1,i<7?3:1])),capturedAt:'old'}},after=structuredClone(before);after.sourceRules.capturedAt='new';assert.equal(compareRecommendations(before,after,'杀段','杀段').changed,false);
 after.sourceRules.segments[8]=3;assert.equal(compareRecommendations(before,after,'杀段','杀段').changed,true);
 assert.equal(compareRecommendations({valid:false,values:[]},after,'杀段','杀段').comparable,false);
});
test('after-draw status uses confirmed evidence and never invents a same-day draw timestamp',()=>{
 const draw={drawn_at:'2026-10-31T13:35:00Z'};assert.equal(afterDrawStatus(draw,'2026-10-31T13:34:59Z'),false);assert.equal(afterDrawStatus(draw,'2026-10-31T13:35:01Z'),true);
 assert.equal(afterDrawStatus(null,'2026-10-31T14:00:00Z'),false);assert.equal(afterDrawStatus({draw_date:'2026-10-31'},'2026-10-31T14:00:00Z'),null);assert.equal(afterDrawStatus({draw_date:'2026-10-31'},'2026-11-01T00:00:00Z'),true);assert.equal(afterDrawStatus({},'2026-10-31T14:00:00Z',true),true);
});
