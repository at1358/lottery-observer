import test from 'node:test';import assert from 'node:assert/strict';
import {parsePrediction,evaluate,splitPeriods} from '../lib/domain.mjs';
import {extractModule} from '../lib/extract.mjs';
import {compareRecommendations} from '../lib/recommendation-history.mjs';
import {readFileSync} from 'node:fs';
const footer='\n吴:虎兔龙蛇\n蜀:马羊猴鸡\n魏:鼠牛狗猪';
const raw='309期:【一国三肖】特开:？00准\n吴国:兔虎蛇 蜀国:猴羊鸡 魏国:鼠牛狗';
test('一国三肖 reads three groups of three zodiacs and excludes the four-zodiac reference footer',()=>{
 const p=parsePrediction(raw+footer,'生肖','毛手毛脚【一国三肖】');assert.equal(p.valid,true);assert.deepEqual(p.values,[...'兔虎蛇猴羊鸡鼠牛狗']);assert.deepEqual(p.zodiacGroups.map(g=>g.label),['吴国','蜀国','魏国']);assert.ok(['龙','马','猪'].every(z=>!p.values.includes(z)));
 const record={kind:'生肖',parsed:p};assert.equal(evaluate(record,{number:17,zodiac:'虎'}).status,'win');assert.equal(evaluate(record,{number:15,zodiac:'龙'}).status,'loss');
});
test('308 group recommendations settle from the actual draw, ignoring the page own result annotation',()=>{
 const text='308期:【一国三肖】特开:狗21准\n吴国:兔龙蛇 蜀国:羊马鸡 魏国:狗牛鼠'+footer,p=parsePrediction(text,'生肖');assert.equal(p.valid,true);assert.equal(p.values.length,9);assert.equal(evaluate({kind:'生肖',parsed:p},{number:46,zodiac:'鸡'}).status,'win');assert.equal(evaluate({kind:'生肖',parsed:p},{number:17,zodiac:'虎'}).status,'loss');
});
test('missing, updating, duplicate or repeated groups are incomplete; reference lines do not fill gaps',()=>{
 for(const text of [raw.replace('魏国:鼠牛狗',''),raw.replace('鼠牛狗','更新中'),raw.replace('鼠牛狗','鼠牛牛'),raw.replace('鼠牛狗','鼠牛蛇'),raw+'\n吴国:兔龙蛇',raw.replace('兔虎蛇','虎兔龙蛇')])assert.equal(parsePrediction(text+footer,'生肖','一国三肖').valid,false,text);
});
test('traditional labels, punctuation and line breaks work; zodiac draw and reference edits are not prediction changes',()=>{
 const a=parsePrediction(raw+footer,'生肖'),b=parsePrediction(raw.replace('吴国:兔虎蛇 蜀国:猴羊鸡 魏国:鼠牛狗','吳國：【兔、虎、蛇】\n蜀國：猴羊雞\n魏國：鼠牛狗').replace('？00准','虎17中')+footer,'生肖','一國三肖');assert.equal(b.valid,true);assert.deepEqual(b.values,a.values);assert.equal(compareRecommendations(a,b,'生肖','生肖').changed,false);
 assert.equal(compareRecommendations(a,parsePrediction(raw.replace('兔虎蛇','兔龙蛇'),'生肖'),'生肖','生肖').changed,true);
});
test('real column HTML excludes commented future issues and keeps footer outside the last recommendation',()=>{
 const html=readFileSync(new URL('./fixtures/kingdom-zodiacs.html',import.meta.url),'utf8'),module=extractModule(html,{selector:'body',kind:'生肖',name:'毛手毛脚【一国三肖】'}),rows=splitPeriods(module.text);assert.equal(rows.length,7);assert.equal(rows.at(-1).issue,'309');assert.ok(rows.every(r=>parsePrediction(r.raw,'生肖','一国三肖').valid));assert.doesNotMatch(rows.at(-1).raw,/吴:|310期/);
});
