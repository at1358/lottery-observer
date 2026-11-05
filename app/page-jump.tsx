'use client';
import {useEffect,useState} from 'react';
export default function PageJump({page,pages,onChange,busy=false,label='结果'}:{page:number,pages:number,onChange:(page:number)=>void,busy?:boolean,label?:string}){
 const total=Math.max(1,pages),[value,setValue]=useState(String(page));useEffect(()=>setValue(String(page)),[page]);
 function jump(){const n=Number(value);if(Number.isInteger(n)&&n>=1&&n<=total)onChange(n);else setValue(String(page));}
 return <span className="page-jump"><span>{page} / {total}</span><label>跳至 <input aria-label={label+'跳转页码'} type="number" min={1} max={total} step={1} value={value} disabled={busy} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();jump();}}}/> 页</label><button type="button" className="secondary" disabled={busy} onClick={jump}>跳转</button></span>;
}
