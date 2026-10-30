'use client';
import {useState} from 'react';
import {Search,Play,RefreshCw,Clock,CheckCircle2,AlertCircle} from 'lucide-react';
type Any=any;
const date=(s:string)=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'尚未执行';
export default function ActivityLog({jobs,scheduler,scheduleInfo,busy,onRun,onRetry}:{jobs:Any[],scheduler:Any,scheduleInfo:Any,busy:boolean,onRun:()=>void,onRetry:(id:string)=>void}){
 const [status,setStatus]=useState(''),[search,setSearch]=useState('');
 const rows=jobs.filter(j=>(!status||j.status===status)&&(!search||(j.name+' '+j.message).includes(search)));
 return <><div className="log-summary"><article><CheckCircle2 size={19}/><div><strong>{jobs.filter(j=>j.status==='success').length}</strong><span>最近成功任务</span></div></article><article><AlertCircle size={19}/><div><strong>{jobs.filter(j=>j.status==='error').length}</strong><span>需要检查的失败</span></div></article><article><Clock size={19}/><div><strong className="log-date">{date(scheduler.lastRun)}</strong><span>最近一次后台检查</span></div></article><article><Clock size={19}/><div><strong className="log-date">{scheduleInfo?.nextRun?date(scheduleInfo.estimatedRun):'暂无待执行栏目'}</strong><span>预计下次资料采集</span></div></article></div>
 <section className="panel"><div className="panel-heading"><div><h2>运行日志</h2><p>记录采集、识别、暂停、计划变更和开奖同步，最近 80 条</p></div><button className="secondary" disabled={busy} onClick={onRun}><Play size={15}/>检查到期任务</button></div>
 <div className="filters"><div className="search-field"><Search size={16}/><input aria-label="搜索运行日志" placeholder="搜索栏目名称或失败原因" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="日志状态" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部状态</option><option value="success">成功</option><option value="error">失败</option><option value="warning">待识别</option></select><span className="log-result-count">找到 {rows.length} 条记录</span></div>
 <div className="table-scroll"><table className="activity-table"><thead><tr><th>状态</th><th>任务 / 栏目</th><th>运行详情</th><th>新增</th><th>北京时间</th><th>操作</th></tr></thead><tbody>{rows.map(j=><tr key={j.id}><td><span className={'badge '+(j.status==='success'?'win':j.status==='warning'?'review':'loss')}>{j.status==='success'?'成功':j.status==='warning'?'待识别':'失败'}</span></td><td className="log-name">{j.name}</td><td className="log-message"><details><summary>{j.message}</summary><pre>{j.message}</pre></details></td><td>{j.count}</td><td className="nowrap">{date(j.created_at)}</td><td>{j.source_id&&j.status!=='success'&&<button className="secondary" disabled={busy} onClick={()=>onRetry(j.source_id)}><RefreshCw size={13}/>重试</button>}</td></tr>)}</tbody></table></div>
 {!rows.length&&<div className="empty"><Clock size={25}/><h3>{jobs.length?'没有符合条件的日志':'还没有运行记录'}</h3><p>{jobs.length?'调整搜索或状态筛选即可查看其他记录。':'保存栏目或执行一次检查后，运行情况会显示在这里。'}</p></div>}
 </section></>;
}
