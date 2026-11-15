'use client';
import {useEffect,useState} from 'react';
import {RotateCcw,ArchiveRestore,Trash2,X,AlertTriangle} from 'lucide-react';
import {PURGE_CONFIRMATION,PURGE_SCOPES} from '../lib/trash-purge.mjs';
type Any=any;
const labels:Any={sources:'采集来源',records:'采集资料',folder:'文件夹',combination:'组合计算',simulation:'模拟方案'};
export default function TrashPanel({items,api,run,busy}:{items:Any[],api:Any,run:Any,busy:boolean}){
 const [selected,setSelected]=useState<string[]>([]),[pending,setPending]=useState<Any[]|null>(null),[confirmation,setConfirmation]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setSelected(old=>old.filter(id=>items.some(item=>item.id===id)));},[items]);
 const chosen=items.filter(item=>selected.includes(item.id)),all=!!items.length&&chosen.length===items.length;
 function confirm(rows:Any[]){setPending(rows);setConfirmation('');setNotice('');}
 async function purge(){if(!pending?.length||confirmation!==PURGE_CONFIRMATION)return;await run('彻底删除回收站资料',async()=>{const result=await api('trash/purge',{ids:pending.map(item=>item.id),confirmation});setPending(null);setSelected([]);setNotice(`已彻底删除 ${result.deleted} 项回收站记录，无法从回收站恢复。`);});}
 return <section className="panel full-span"><div className="panel-heading"><div><h2><ArchiveRestore size={19}/>回收站</h2><p>方案与来源恢复后保持暂停；目录删除保留栏目和原文。彻底删除后，所选项目不能从回收站恢复。</p></div></div>
  {notice&&<div className="alert" role="status">{notice}</div>}
  <div className="selection-toolbar"><label className="checkbox-label"><input type="checkbox" aria-label="全选回收站当前列表" disabled={busy||!items.length} checked={all} onChange={e=>setSelected(e.target.checked?items.map(item=>item.id):[])}/>全选当前列表</label><span>已选 {chosen.length} 项</span><button className="danger-button" disabled={busy||!chosen.length} onClick={()=>confirm(chosen)}><Trash2 size={14}/>批量彻底删除</button></div>
  <div className="table-scroll"><table><thead><tr><th>选择</th><th>名称</th><th>类型</th><th>数量</th><th>删除时间</th><th>操作</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><input type="checkbox" aria-label={'选择回收站项目：'+item.name} disabled={busy} checked={selected.includes(item.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,item.id]:old.filter(id=>id!==item.id))}/></td><td>{item.name}</td><td>{labels[item.type]||item.type}</td><td>{item.count}</td><td>{new Date(item.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</td><td><div className="row-actions"><button className="text-link" disabled={busy} onClick={()=>run('恢复资料',()=>api('trash/restore',{id:item.id}))}><RotateCcw size={14}/>恢复</button><button className="text-link danger-text" disabled={busy} onClick={()=>confirm([item])}><Trash2 size={14}/>彻底删除</button></div></td></tr>)}</tbody></table></div>
  {!items.length&&<div className="empty"><ArchiveRestore size={26}/><h3>回收站为空</h3></div>}
  {pending&&<div className="modal-cover"><section className="modal wide" role="dialog" aria-modal="true" aria-label="确认彻底删除回收站资料"><header><div><h2>确认彻底删除 {pending.length} 项？</h2><p>此操作无法从回收站恢复，请核对以下项目和删除范围。</p></div><button className="icon-button" aria-label="关闭彻底删除确认" disabled={busy} onClick={()=>setPending(null)}><X size={19}/></button></header><div className="modal-body"><div className="alert danger"><AlertTriangle size={18}/><span>彻底删除会清理所选项目的所属数据，恢复按钮和回收站将无法找回。</span></div><ul>{pending.map(item=><li key={item.id}><strong>{item.name}</strong>（{labels[item.type]||item.type} · {item.count} 项）<p className="form-hint">{PURGE_SCOPES[item.type]}</p></li>)}</ul><label>请输入“彻底删除”确认<input aria-label="永久删除确认文字" autoComplete="off" disabled={busy} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></div><footer className="modal-footer"><button className="secondary" disabled={busy} onClick={()=>setPending(null)}>取消</button><button className="danger-button" disabled={busy||confirmation!==PURGE_CONFIRMATION} onClick={purge}><Trash2 size={15}/>彻底删除所选 {pending.length} 项</button></footer></section></div>}
 </section>;
}
