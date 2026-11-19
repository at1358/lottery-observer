'use client';
import {useEffect,useRef,useState} from 'react';
import {Menu,Globe2,FilePlus2,Calculator,BarChart3} from 'lucide-react';

export function workspaceHref(path:string){
 const mobile=typeof window!=='undefined'&&/^\/m(?:\/|$)/.test(window.location.pathname);
 return mobile?(path==='/'?'/m':'/m'+path):path;
}

export function useMobileMenu(){
 const [open,setOpen]=useState(false),sidebarRef=useRef<HTMLElement|null>(null),triggerRef=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{
  const desktop=window.matchMedia('(min-width: 769px)'),close=()=>{if(desktop.matches)setOpen(false);};
  desktop.addEventListener('change',close);return()=>desktop.removeEventListener('change',close);
 },[]);
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const frame=requestAnimationFrame(()=>sidebarRef.current?.querySelector<HTMLButtonElement>('.mobile-menu-close')?.focus());
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setOpen(false);}
   if(event.key!=='Tab')return;
   const targets=Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])')||[]).filter(el=>el.getClientRects().length);
   const first=targets[0],last=targets[targets.length-1];
   if(!sidebarRef.current?.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
   else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',keydown);
  return()=>{cancelAnimationFrame(frame);document.body.style.overflow=overflow;document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
 },[open]);
 return {open,setOpen,sidebarRef,triggerRef};
}

export function MobileBottomNavigation({view,onNavigate,onMenu}:{view:string,onNavigate:(view:string)=>void,onMenu:()=>void}){
 return <nav className="mobile-bottom-nav" aria-label="手机常用导航">
  {([['sources','数据源管理',Globe2],['self-materials','自建资料',FilePlus2],['combinations','组合',Calculator],['ranking','排行',BarChart3]] as const).map(([key,label,Icon])=><button key={key} aria-current={view===key||key==='combinations'&&view==='quick-combinations'?'page':undefined} onClick={()=>onNavigate(key)}><Icon size={20}/><span>{label}</span></button>)}
  <button onClick={onMenu} aria-label="打开更多工作台菜单"><Menu size={20}/><span>更多</span></button>
 </nav>;
}
