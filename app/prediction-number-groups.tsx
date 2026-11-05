import {predictionNumberGroups} from '../lib/prediction-number-groups.mjs';
import './prediction-number-groups.css';
export default function PredictionNumberGroups({row}:{row:any}){
 let parsed;try{parsed=typeof row?.parsed==='string'?JSON.parse(row.parsed):row?.parsed;}catch{}
 if(!row?.synthetic&&parsed?.valid&&parsed.numberGroups?.length)return <div className="prediction-number-groups" aria-label="本期推荐号码分组"><p>主、攻分组保留 · 合并去重共 {parsed.values.length} 个号码</p>{parsed.numberGroups.map((group:any)=><p key={group.label}>{group.label}：{group.numbers.map((n:number)=>String(n).padStart(2,'0')).join(' ')}</p>)}</div>;
 if(!row?.synthetic&&['生肖','杀肖'].includes(row?.kind)&&parsed?.valid&&parsed.zodiacGroups?.length)return <div className="prediction-number-groups" aria-label="本期生肖分组"><p>当期推荐：共{parsed.values.length}个生肖</p>{parsed.zodiacGroups.map((group:any)=><p key={group.label}>{group.label}：{group.values.join('、')}</p>)}</div>;
 const value=predictionNumberGroups(row);if(!value)return null;
 return <div className="prediction-number-groups" aria-label="本期对应号码">{value.warning?<p className="prediction-number-groups-warning">{value.warning}</p>:value.groups.map((group:any)=><p key={group.label}>{group.label}：{group.numbers.map((n:number)=>String(n).padStart(2,'0')).join('、')}</p>)}</div>;
}
