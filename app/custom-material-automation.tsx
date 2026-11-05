import {Clock3} from 'lucide-react';
const when=(value:string)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚未执行';
export default function CustomMaterialAutomation({value}:{value:any}){
 if(!value)return null;
 return <section className="self-automation" aria-label="自建资料自动更新计划"><Clock3 size={19}/><div><strong>{value.schedule.enabled?'每天 '+value.schedule.time+' 自动更新（北京时间）':'每日自动更新已暂停'}</strong><p>自动追加 n−k 资料，并复核全部自建栏目。开奖结果入库或更正后，也会立即更新正确率和错误期数。</p><small>{value.schedule.enabled?'下次更新：'+when(value.nextRun)+' · ':''}最近定时更新：{when(value.lastRun)}</small>{value.error&&<p className="amber">上次更新未全部完成：{value.error}；后台将自动重试。</p>}</div></section>;
}
