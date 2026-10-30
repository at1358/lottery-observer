'use client';
import {useEffect,useState} from 'react';
import {Clock,CalendarClock,Check} from 'lucide-react';
import {DEFAULT_SCHEDULE,nextScheduledRun,estimatedExecution} from '../lib/schedule.mjs';
type Any=any;
const when=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
export default function SchedulePanel({value,info,onSave,busy}:{value:Any,info:Any,onSave:(v:Any)=>Promise<Any>,busy:boolean}){
 const [form,setForm]=useState<Any>({...DEFAULT_SCHEDULE,...value});const [dirty,setDirty]=useState(false);
 useEffect(()=>{if(!dirty)setForm({...DEFAULT_SCHEDULE,...value});},[value,dirty]);
 const update=(key:string,v:Any)=>{setDirty(true);setForm((old:Any)=>({...old,[key]:v}));};
 let next:string|null=null;try{next=nextScheduledRun(form);}catch{}
 const estimated=next?estimatedExecution(next,Date.now(),info?.runtime):null;
 return <section className="panel full-span collection-schedule-panel"><div className="panel-heading"><div><h2><CalendarClock size={19}/>自动采集时间</h2><p>由你设置采集计划。栏目可跟随全站计划，也可单独设置。</p></div><span className={'badge '+(form.enabled?'win':'pending')}>{form.enabled?'已启用':'已暂停'}</span></div>
 <form className="schedule-form" onSubmit={async e=>{e.preventDefault();const saved=await onSave(form);if(saved)setDirty(false);}}>
  <div className="schedule-mode-options"><button type="button" className={form.mode==='daily'?'selected':''} onClick={()=>update('mode','daily')}><CalendarClock size={20}/><strong>每天固定时间</strong><small>例如每天 16:30</small></button><button type="button" className={form.mode==='interval'?'selected':''} onClick={()=>update('mode','interval')}><Clock size={20}/><strong>按时间间隔</strong><small>例如每 60 分钟</small></button></div>
  <div className="schedule-inputs">{form.mode==='daily'?<label>每天开始采集时间<input aria-label="每天开始采集时间" type="time" required value={form.time} onChange={e=>update('time',e.target.value)}/></label>:<label>间隔多少分钟<input aria-label="全站采集间隔" type="number" required min="60" max="10080" value={form.interval} onChange={e=>update('interval',Number(e.target.value))}/></label>}<div className="schedule-timezone"><span>统一时区</span><strong>北京时间 · UTC+8</strong></div><label className="checkbox-label"><input type="checkbox" checked={form.enabled} onChange={e=>update('enabled',e.target.checked)}/>启用全站自动采集</label></div>
  <div className="schedule-preview"><div><span>设定的下一次时间</span><strong>{when(next)}</strong></div><div><span>预计云端执行时间</span><strong>{form.enabled?when(estimated):'已暂停'}</strong></div><div><span>最近一次检查</span><strong>{when(info?.lastRun||null)}</strong></div></div>
  <p className="form-hint">{info?.runtime==='standalone'?'Linux 每分钟检查一次到期计划，19:00 的计划会在 19:00 这轮检查执行。实际启动以运行日志为准。':'云端每小时 30 分检查一次。设置 16:30 可以对齐；其他分钟顺延至之后的检查，以运行日志为准。'}暂停全站采集不会关闭开奖同步。</p>
  <div className="form-footer"><span>{dirty?'有未保存的修改':'保存后会更新跟随全站计划的栏目'}</span><button className="primary" disabled={busy}><Check size={15}/>保存采集计划</button></div>
 </form></section>;
}
