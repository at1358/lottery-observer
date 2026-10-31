'use client';
import {useEffect,useState} from 'react';
import {ListTree} from 'lucide-react';
type Any=any;
const names:Any={segments:'段数',doors:'门数',elements:'五行',zodiacs:'生肖',waves:'波色',heads:'头数',tails:'尾数',sums:'合数',sumParities:'合数单双',parities:'单双',halfHeads:'半头',numberSeasons:'季节',numberAttributes:'属性'};
function label(entry:Any){const suffix:Any={segments:'段',doors:'门',elements:'行',heads:'头',tails:'尾'};return String(entry.label)+(suffix[entry.field]||'');}
export default function SourceDefinitionPanel({sourceId,year,version,api}:{sourceId:string,year:number,version?:string,api:(path:string)=>Promise<Any>}){
 const [profile,setProfile]=useState<Any>(null),[error,setError]=useState('');
 useEffect(()=>{let current=true;setError('');api('source-definition?source='+encodeURIComponent(sourceId)+'&year='+year).then(v=>{if(current)setProfile(v.profile);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[sourceId,year,version,api]);
 if(!profile&&!error)return null;
 const groups=profile?.rules?.definitions||[];
 return <section className="panel source-definition-panel"><div className="panel-heading"><div><h2>本栏目号码对照</h2><p>{year} 年 · {profile?.name||'栏目自带对照'} · 以下为采集资料中标注的号码分组</p></div><ListTree size={20}/></div>{error?<p className="source-error source-definition-note">{error}</p>:<><div className="table-scroll"><table><thead><tr><th>分类</th><th>对应号码</th></tr></thead><tbody>{groups.map((entry:Any,index:number)=><tr key={index}><td><strong>{label(entry)}</strong><span className="cell-sub">{names[entry.field]||'分组'}</span></td><td className="source-definition-numbers">{entry.numbers.map((n:number)=>String(n).padStart(2,'0')).join('、')}</td></tr>)}</tbody></table></div>{profile.rules.warnings?.length>0&&<div className="source-definition-note amber">{profile.rules.warnings.join('；')}</div>}<p className="form-hint source-definition-note">采集时间：{new Date(profile.capturedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}。组合计算使用本栏目明确标注并留存的号码对照。</p></>}</section>;
}
