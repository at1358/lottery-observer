type Stats={loss:number;settled:number;latestLoss?:{year:number;issue:string}|null};
export default function SourceLatestLoss({stats}:{stats:Stats}){
 const latest=stats.latestLoss;
 return <div className={'source-latest-loss'+(latest?' has-loss':'')}><span>{latest?`最近错误：${latest.year} 年第 ${latest.issue} 期`:stats.loss?'最近错误期号待更新':stats.settled?'已核对期数暂无错误':'等待开奖核验'}</span><small>累计错误 {stats.loss||0} 期</small></div>;
}
