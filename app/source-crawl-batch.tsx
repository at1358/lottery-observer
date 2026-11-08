'use client';
import {useRef,useState} from 'react';
import {RefreshCw,X} from 'lucide-react';
import {collectSourceBatch} from '../lib/source-crawl-batch.mjs';
type Any=any;
const labels:Any={queued:'等待',running:'采集中',success:'成功',error:'失败',skipped:'跳过'};
export default function SourceCrawlBatch({sources,api,run,busy,readonly,onClose}:{sources:Any[],api:Any,run:Any,busy:boolean,readonly:boolean,onClose:()=>void}){
 const [report,setReport]=useState<Any>(null),[running,setRunning]=useState(false),active=useRef(false),available=sources.filter(s=>s.url).length;
 async function start(){
  if(active.current||busy||readonly||!available)return;
  active.current=true;setRunning(true);
  try{await run('批量采集',()=>collectSourceBatch(sources,id=>api('sources/crawl',{id}),setReport));}
  finally{active.current=false;setRunning(false);}
 }
 return <div className="modal-cover"><section className="modal" role="dialog" aria-modal="true" aria-label="批量采集资料"><header><div><h2>批量采集资料</h2><p>为选中的 {sources.length} 个资料来源立即采集。</p></div><button className="icon-button" aria-label="关闭批量采集" disabled={busy||running} onClick={onClose}><X size={19}/></button></header><div className="modal-body"><p className="form-hint">逐个采集勾选的来源；未配置网址的会跳过。原有定时采集时间和启用／暂停状态保持不变。</p><details open={!report}><summary>查看选中的 {sources.length} 个来源</summary><ul className="source-batch-selection">{sources.map(source=><li key={source.id}>{source.name}<small>{!source.url?'未配置网址，将跳过':!source.enabled?'自动采集已暂停，本次手动采集':''}</small></li>)}</ul></details>{running&&<p className="form-hint">采集中请保持本页打开。</p>}{report&&<div className="source-batch-results"><p role="status" aria-live="polite">{running?'采集进度':'批量采集完成'} {report.finished}/{report.total} · 成功 {report.success} · 失败 {report.failed} · 跳过 {report.skipped} · 新增 {report.inserted} 条 · 内容变更 {report.changed} 条</p><progress aria-label="批量采集进度" max={report.total||1} value={report.finished}/><details open><summary>查看各来源采集结果</summary><ul>{report.rows.map((row:Any)=><li key={row.id} className={'batch-crawl-'+row.status}><strong>{row.name}</strong><span>{labels[row.status]}</span><small>{row.message}</small></li>)}</ul></details></div>}</div><div className="modal-footer"><span>仅采集本次勾选的 {sources.length} 个来源</span><button className="primary" disabled={busy||running||readonly||!available} onClick={start}><RefreshCw size={15} className={running?'spin':''}/>{running?'正在批量采集…':report?'重新采集选中来源':'开始采集'}</button></div></section></div>;
}
