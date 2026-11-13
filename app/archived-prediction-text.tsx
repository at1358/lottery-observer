import {collectedDisplayText} from '../lib/collected-display.mjs';
export default function ArchivedPredictionText({row,className=''}:{row:any,className?:string}){
 const text=collectedDisplayText(row);return <><pre className={className}>{text||'当期未采集到有效资料'}</pre>{text!==(row.raw||'')&&<details className="bulk-draw"><summary>展开首次完整留档原文</summary><pre className="original-detail" style={{maxHeight:360,overflow:'auto'}}>{row.raw}</pre></details>}{row.recoveredFromPlaceholder&&<details className="bulk-draw"><summary>查看最早采集的占位内容（未完整）</summary><pre className="original-detail" style={{maxHeight:360,overflow:'auto'}}>{row.initial_raw}</pre></details>}</>;
}
