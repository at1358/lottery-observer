import {predictionNumberGroups} from '../lib/prediction-number-groups.mjs';
import './prediction-number-groups.css';
export default function PredictionNumberGroups({row}:{row:any}){
 const value=predictionNumberGroups(row);if(!value)return null;
 return <div className="prediction-number-groups" aria-label="本期对应号码">{value.warning?<p className="prediction-number-groups-warning">{value.warning}</p>:value.groups.map((group:any)=><p key={group.label}>{group.label}：{group.numbers.map((n:number)=>String(n).padStart(2,'0')).join('、')}</p>)}</div>;
}
