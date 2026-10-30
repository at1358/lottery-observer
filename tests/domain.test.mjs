import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inferKind,parsePrediction,splitPeriods,evaluate,statistics,validateDraw,parseMacauSocket} from '../lib/domain.mjs';
const p=(raw,kind,title=kind)=>({kind,parsed:parsePrediction(raw,kind,title)});
test('multiline numbers exclude period, source draw annotation and preserve source text',()=>{
 const raw='097期：24码中特 开鼠43准\n【01.02.03.04.05.06.07.08.09.10.11.12】\n【13.14.15.16.17.18.19.20.21.22.23.24】';
 const r=p(raw,'24码');assert.equal(r.parsed.valid,true);assert.equal(r.parsed.values.length,24);assert.ok(!r.parsed.values.includes(43));assert.equal(evaluate(r,{number:43}).status,'loss');
});
test('numeric anomalies are not silently repaired',()=>{
 assert.equal(p('097期：36码\n01 02 3941 04','36码').parsed.valid,false);
 assert.equal(p('097期：号码【01.01.50】','号码').parsed.valid,false);
 assert.equal(p('097期错误错误','36码').parsed.valid,false);
});
test('killing tails reverses membership and supports zero and compact digits',()=>{
 const r=p('097期绝杀三尾【360尾】开？00准','杀尾');assert.equal(r.parsed.valid,true);assert.deepEqual(r.parsed.values,[3,6,0]);
 assert.equal(evaluate(r,{number:43}).status,'loss');assert.equal(evaluate(r,{number:49}).status,'win');assert.equal(evaluate(r,{number:40}).status,'loss');
});
test('head classification uses tens digit, including zero',()=>{
 assert.equal(evaluate(p('097期杀头【0头】开？00准','杀头'),{number:9}).status,'loss');
 assert.equal(evaluate(p('097期头数【4头】','头数'),{number:49}).status,'win');
});
test('zodiac and five element use authoritative attributes',()=>{
 assert.equal(evaluate(p('097期绝杀二肖【鼠牛】开？00准','杀肖'),{number:43,zodiac:'鼠'}).status,'loss');
 assert.equal(evaluate(p('097期生肖【鼠龙马】','生肖'),{number:43}).status,'review');
 assert.equal(evaluate(p('097期绝杀一行【金】开？00准','杀行'),{number:43,element:'木'}).status,'win');
 assert.equal(evaluate(p('097期绝杀一行【金】','杀行'),{number:43}).status,'review');
});
test('odd-even and explicit grouping mappings',()=>{
 assert.equal(evaluate(p('097期单双【单单单】开？00准','单双'),{number:43}).status,'win');
 assert.equal(evaluate(p('097期绝杀一段【2段】','杀段'),{number:9}).status,'review');
 assert.equal(evaluate(p('097期绝杀一段【2段】','杀段'),{number:9},{segments:{9:2}}).status,'loss');
});
test('source kind derives from primary title, not attached commentary',()=>{
 assert.equal(inferKind('富彩秘笈【必中㊱码】不要作为杀13码'),'36码');
 assert.equal(inferKind('全年无错【绝杀一行】'),'杀行');
 assert.equal(inferKind('春风拂面【绝杀二肖】'),'杀肖');
 assert.equal(inferKind('主攻⑮码'),'15码');
});
test('period splitting handles year and reverse chronological order',()=>{
 const r=splitPeriods('标题\n2025-097期：资料【1尾】\n正文\n096期：资料【2尾】');
 assert.equal(r.length,2);assert.equal(r[0].explicitYear,2025);assert.equal(r[0].issue,'097');assert.ok(r[0].raw.endsWith('正文'));
});
test('pending and invalid data excluded from rates and denominator',()=>{
 const rows=['win','win','loss','pending','review'].map(status=>({verdict:{status}}));
 const s=statistics(rows);assert.equal(s.settled,3);assert.equal(s.rate,200/3);assert.equal(s.errorRate,100/3);assert.equal(statistics([]).rate,null);
 assert.equal(evaluate(p('097期号码【01 02 03】','号码'),null).status,'pending');
});
test('draw validation rejects placeholder, absent year or invalid timestamp',()=>{
 const d={year:2026,issue:'097',number:43,zodiac:'鼠',drawnAt:'2026-04-07T21:30:00+08:00'};
 assert.equal(validateDraw(d).issue,'097');
 for(const bad of [{number:0},{year:0},{issue:'999'},{drawnAt:'unknown'},{zodiac:'象'}])assert.throws(()=>validateDraw({...d,...bad}));
});
test('actual document decorations do not hide numeric lines',()=>{
 const raw='181期:【主攻15码】开:？00准\n❤【07 08 09 11 12 15】❤\n【18 19 21 28 29 32 33 36 40】';assert.equal(p(raw,'15码').parsed.valid,true);
 assert.equal(p('181期:✈主【23 26 38】✈特开:？00准\n防:04 05 10 16 17 22 28 29 34 40 41 46','15码').parsed.valid,true);
 assert.equal(p('097期号码\n[A] 01.02.03\n[B] 04.05.06','号码').parsed.values.length,6);
 assert.equal(p('097期生肖\n《猪 蛇 羊 马 鸡 龙 牛 兔 鼠》','生肖').parsed.values.length,9);
 assert.deepEqual(p('175期绝杀一段【三段】开蛇26准','杀段').parsed.values,[3]);
});
test('cross-year archives keep same period from different years separate',()=>{
 const r=splitPeriods('003期资料\n002期资料\n001期资料\n365期资料\n364期资料');assert.deepEqual(r.map(x=>x.yearOffset),[0,0,0,-1,-1]);
 const a=splitPeriods('364期资料\n365期资料\n001期资料\n002期资料\n003期资料');assert.deepEqual(a.map(x=>x.yearOffset),[-1,-1,0,0,0]);
});
test('designated Macau stream separates special number from next-draw time',()=>{
 const msg='am301,27,41,23,11,2,43,17,302,2026/10/29/四/21点32分,,5,030811000|301,龙,虎,猴,猴,蛇,鼠,虎,302,2026/10/29/四/21点32分,,5,030811000';
 const d=parseMacauSocket(msg);assert.equal(d.year,2026);assert.equal(d.issue,'301');assert.equal(d.number,17);assert.equal(d.zodiac,'虎');assert.equal(d.drawnAt,null);assert.equal(d.numbers.length,7);assert.equal(parseMacauSocket('connected'),null);
 assert.throws(()=>parseMacauSocket(msg.replace(',17,302',',0,302')));
 const rollover=parseMacauSocket(msg.replace('am301,','am365,').replaceAll(',302,2026/',',001,2027/'));assert.equal(rollover.year,2026);
});
