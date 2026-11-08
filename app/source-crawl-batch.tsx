'use client';
import {useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {collectSourceBatch} from '../lib/source-crawl-batch.mjs';
type Any=any;
const labels:Any={queued:'等待',running:'采集中',success:'成功',error:'失败',skipped:'跳过'};
export default function SourceCrawlBatch({sources,api,run,busy,readonly}:{sources:Any[],api:Any,run:Any,busy:boolean,readonly:boolean}){
 const [report,setReport]=useState<Any>(null),[running,setRunning]=useState(false),active=useRef(false),available=sources.filter(s=>s.url).length;
 async function start(){
  if(active.current||busy||readonly||!available)return;
  active.current=true;setRunning(true);
  try{await run('批量采集',()=>collectSourceBatch(sources,id=>api('sources/crawl',{id}),setReport));}
  finally{active.current=false;setRunning(false);}
 }
 return <div className="source-batch-collector"><div className="source-batch-heading"><button className="secondary" disabled={busy||running||readonly||!available} onClick={start}><RefreshCw size={15} className={running?'spin':''}/>{running?'正在批量采集…':`全部采集（${available}）`}</button><span>逐个采集所有已配置网址的来源，含已暂停的来源；不修改定时采集设置。{running&&'采集中请保持本页打开。'}</span></div>{report&&<div className="source-batch-results"><p role="status" aria-live="polite">{running?'采集进度':'批量采集完成'} {report.finished}/{report.total} · 成功 {report.success} · 失败 {report.failed} · 跳过 {report.skipped} · 新增 {report.inserted} 条 · 内容变更 {report.changed} 条</p><progress aria-label="批量采集进度" max={report.total||1} value={report.finished}/><details open={running||report.failed>0}><summary>查看各来源采集结果</summary><ul>{report.rows.map((row:Any)=><li key={row.id} className={'batch-crawl-'+row.status}><strong>{row.name}</strong><span>{labels[row.status]}</span><small>{row.message}</small></li>)}</ul></details></div>}</div>;
}
