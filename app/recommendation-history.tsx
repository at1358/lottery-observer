import PredictionNumberGroups from './prediction-number-groups';
import './recommendation-history.css';
const labels:any={win:'正确',loss:'错误',pending:'待开奖',review:'待复核',collection_failed:'采集失败'};
const when=(value:string)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
function values(kind:string,items:any[]=[]){return items.map(v=>kind==='杀段'?v+'段':['杀行','五行'].includes(kind)?v+'行':typeof v==='number'&&!/尾|头|段|门|合数/.test(kind)?String(v).padStart(2,'0'):v).join('、');}
function Verdict({value}:{value:any}){return value?<span className={'badge '+value.status}><i/>{labels[value.status]||value.status}</span>:null;}
export default function RecommendationHistory({record,items}:{record:any,items:any[]}){
 const versions=items.filter(r=>r.change_type==='prediction'),audits=items.filter(r=>r.change_type!=='prediction'&&r.change_type!=='annotation');
 return <section className="recommendation-history" aria-label="历史回溯"><h3>历史回溯 <span className="small-badge">{versions.length} 次改料</span></h3><p className="form-hint">仅比较推荐的号码、段数、生肖等有效内容；补充开奖结果或更新“准／中”标注不算改料。统计保留首次资料的结果。</p>
 <article className="recommendation-version first"><header><strong>首次资料 · 统计依据</strong><Verdict value={record.firstResult?.verdict||record.verdict}/></header><small>首次留档：{when(record.first_seen)}{record.firstResult?' · '+(record.firstResult.reconstructed?'按现有开奖回溯核验':'发现开奖后修改时的核验快照'):''}</small><pre>{record.raw}</pre><PredictionNumberGroups row={record}/>{record.firstResult?.draw&&<p className="form-hint">核验开奖：{String(record.firstResult.draw.number).padStart(2,'0')} {record.firstResult.draw.zodiac||''} · {record.firstResult.verdict.reason}</p>}</article>
 {versions.map(version=>{const info=version.metadata;return <article className={'recommendation-version '+(info?.afterDraw===true?'after-draw':'')} key={version.id}><header><strong>第{version.version+1}版 · {info?.afterDraw===true?'开奖后发现修改':info?.afterDraw===false?'开奖前发现修改':'修改发生在开奖前后尚未确认'}</strong><Verdict value={info?.verdict}/></header><small>发现时间：{when(version.created_at)}</small>{info&&<p className="recommendation-difference">推荐内容：{values(info.before.kind,info.before.values)} → {values(info.after.kind,info.after.values)}</p>}<pre>{version.raw}</pre>{info&&<PredictionNumberGroups row={{kind:info.after.kind,parsed:info.after.parsed}}/>}{info?.verdict&&<p className="form-hint">{info.reconstructed?'回溯核验':'发现修改时核验'}：{info.verdict.reason}</p>}</article>;})}
 {!versions.length&&<p className="muted">尚未发现推荐内容修改。</p>}
 {!!audits.length&&<details className="recommendation-audits"><summary>解析与号码对照维护记录（{audits.length}）</summary>{audits.map(item=><div key={item.id}><small>{when(item.created_at)}</small><pre>{item.raw}</pre></div>)}</details>}
 </section>;
}
