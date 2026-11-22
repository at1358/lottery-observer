import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const file=path.resolve('outputs','forecast-component-'+crypto.randomUUID()+'.mjs');
mkdirSync(path.dirname(file),{recursive:true});
const bundle=await build({entryPoints:['app/probability-forecast.tsx'],bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],loader:{'.css':'empty'},write:false});
writeFileSync(file,bundle.outputFiles[0].text);
const {ProbabilityEstimate,ProbabilitySchedule}=await import(pathToFileURL(file).href);unlinkSync(file);
const value={status:'estimated',target:{year:2026,issue:'350',date:'2026-11-05'},correct:65.6,error:34.4,samples:30,win:20,loss:10,interval:[48.8,80.8],historySamples:30,baseline:30.6,generatedAt:'2026-11-05T04:00:00Z',targetDataAvailable:false};
test('same estimate component renders honest target, complementary rates, history sample caveat and uncertainty',()=>{
 const html=renderToStaticMarkup(createElement(ProbabilityEstimate,{value}));
 for(const text of ['65.6%','34.4%','350','样本30期','95%区间','非事前验证','目标期资料未就绪','均匀随机号码基准'])assert.ok(html.includes(text),text);
});
test('closed, stale and insufficient cases never render old forecast percentages',()=>{
 for(const status of ['closed','stale','changed','insufficient']){
  const html=renderToStaticMarkup(createElement(ProbabilityEstimate,{value:{...value,status,reason:'等待更新'}}));assert.equal(html.includes('65.6%'),false);assert.equal(html.includes('34.4%'),false);
 }
});
test('noon schedule label is shared and read-only users get no update button',()=>{
 const readonly=renderToStaticMarkup(createElement(ProbabilitySchedule,{readonly:true,api:()=>{},run:()=>{},busy:false}));
 assert.ok(readonly.includes('每天12:00'));assert.ok(readonly.includes('北京时间'));assert.equal(readonly.includes('<button'),false);
 const editable=renderToStaticMarkup(createElement(ProbabilitySchedule,{api:()=>{},run:()=>{},busy:false}));assert.ok(editable.includes('更新概率参考'));
});
