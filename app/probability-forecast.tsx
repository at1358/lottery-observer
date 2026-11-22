'use client';
import {useState} from 'react';
import {Clock,RefreshCw,Sparkles} from 'lucide-react';
import './probability-forecast.css';
type Any=any;
const time=(value:string)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'尚未计算';
export function ProbabilityEstimate({value,compact=false}:{value?:Any,compact?:boolean}){
 const usable=value?.status==='estimated',insufficient=value?.status==='insufficient';
 return <div className={'probability-estimate'+(compact?' compact':'')} data-forecast-status={value?.status||'waiting'}>
  <span className="probability-caption"><Sparkles size={13}/>AI预判 · 历史统计模型</span>
  {value?.target&&<small>{value.target.date} · {value.target.year}年第{value.target.issue}期</small>}
  {usable?<><div className="probability-values"><span>正确 <strong>{value.correct.toFixed(1)}%</strong></span><span>错误 <strong>{value.error.toFixed(1)}%</strong></span></div><small>样本{value.samples}期 · 正确{value.win} / 错误{value.loss}</small>{!value.targetDataAvailable&&<small>目标期资料未就绪，仅作历史比例参考</small>}<small>历史比例95%区间 {value.interval[0].toFixed(1)}%–{value.interval[1].toFixed(1)}%</small>{value.baseline!==null&&value.baseline!==undefined&&<small>均匀随机号码基准 {value.baseline.toFixed(1)}%</small>}{value.historySamples>0&&<small>含{value.historySamples}期历史回算，非事前验证</small>}<small>计算于 {time(value.generatedAt)}</small></>:<span className="probability-waiting">{insufficient?`样本不足（${value.samples}/20期）`:value?.reason||'等待每天12:00计算'}</span>}
 </div>;
}
export function ProbabilitySchedule({value,api,run,busy,readonly=false,onUpdated}:{value?:Any,api:Any,run:Any,busy:boolean,readonly?:boolean,onUpdated?:()=>Promise<any>}){
 const [notice,setNotice]=useState('');
 return <section className="probability-schedule" aria-label="下一期概率参考计划"><div><strong><Clock size={15}/>每天12:00 · 北京时间</strong><p>基于最近最多120期已核验资料，至少20期才显示估计。历史表现不能保证下一期结果；连对、连错不会使随机开奖必然反转。</p><small>最近更新 {time(value?.lastSuccessAt)} · 下次执行 {time(value?.nextRun)}</small>{value?.error&&<small className="probability-warning">{value.error}</small>}{notice&&<small role="status">{notice}</small>}</div>{!readonly&&<button className="secondary" disabled={busy} onClick={()=>run('更新概率参考',async()=>{const result=await api('probability-forecasts/refresh',{});setNotice(result.skipped?result.reason||'尚未到计算时间':`已更新${result.calculated}个栏目；第${result.target.issue}期`);if(onUpdated)await onUpdated();})}><RefreshCw size={14}/>更新概率参考</button>}</section>;
}
