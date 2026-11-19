// Public line-checker data and published documents for isolated service QA.
export const checkedEntryUrl='https://entry.qa-checked-lines.example/';
export const checkedLineUrl='https://line.qa-checked-lines.example/';
export const checkedDirectoryUrl='https://cdn.qa-checked-lines.example/upload/script/11/d3cfe58782527430.js';
export const checkedOversizedUrl='https://cdn.qa-checked-lines.example/upload/script/11/eeeeeeeeeeeeeeee.js';
export const checkedOrdinaryLargeUrl='https://cdn.qa-checked-lines.example/directory-too-large.html';
export const checkedColumns=[
 ['jishen','机神传说','15码中特',15,1],
 ['qingnan','情难自禁','15码中特',15,16],
 ['chongru','宠辱不惊','8码中特',8,32],
 ['twelve','再劫难逃','12码中特',12,10],
 ['thirty-six','雨春风化','无错36码',36,1]
].map(([id,author,column,count,start])=>({id,author,column,count,path:'/columns/'+id+'.html',name:author+'【'+column+'】',raw:'320期:【'+column+'】'+(id==='jishen'?'特开:??准':'特开:？00准')+'\n【'+Array.from({length:count},(_,index)=>String(start+index).padStart(2,'0')).join(' ')+'】'}));
export const checkedEntryHtml='<a id="js-alert-btn" href="#">点击进入</a><script>let jump_domains='+JSON.stringify([checkedLineUrl+'###@'])+';let btn=document.getElementById("js-alert-btn");function iosSafeRedirect(url){const target=url;btn.href=target;window.location.replace(target);}function checkDomain(index){let info={url:jump_domains[index]};iosSafeRedirect(info.url);}checkDomain(0);throw new Error("remote script must never execute");</script>';
export const checkedDirectoryHtml='<nav>'+checkedColumns.map(column=>'<a href="'+column.path+'">320期 '+column.name+'</a>').join('')+'</nav><!-- published directory padding '+'x'.repeat(1030000)+' -->';
export const checkedDirectoryScript='document.writeln(utf8to16(strdecode('+JSON.stringify(Buffer.from(checkedDirectoryHtml).toString('base64'))+')));throw new Error("published data must never execute");';
const lineHtml='<script src="https://cdn.qa-checked-lines.example/static/label/label-com4-0730.js"></script><div class="cgi-body"><script src="'+checkedDirectoryUrl+'"></script></div>';
const topicHtml=column=>'<div><div class="title">精华贴320期【'+column.column+'】公开资料</div><div class="topic-author">作者:'+column.author+'</div><div class="topic-content"><p>'+column.raw.replaceAll('\n','<br>')+'</p>'+(column.count===36?'<p>期【无错36码】开猴47准<br>'+Array.from({length:36},(_,i)=>String(i+14).padStart(2,'0')).join(' ')+'</p>':'')+'</div></div>';
export function checkedLineResponse(url){
 if(!url.hostname.endsWith('.qa-checked-lines.example'))return null;
 const response=(text,type='text/html')=>new Response(text,{headers:{'Content-Type':type+'; charset=utf-8','Content-Length':String(Buffer.byteLength(text))}});
 if(url.href===checkedEntryUrl)return response(checkedEntryHtml);
 if(url.href===checkedLineUrl)return response(lineHtml);
 if(url.href===checkedDirectoryUrl)return response(checkedDirectoryScript,'application/javascript');
 if(url.href===checkedOrdinaryLargeUrl)return response(checkedDirectoryScript);
 if(url.href===checkedOversizedUrl)return response('x'.repeat(3000001),'application/javascript');
 const column=url.origin===new URL(checkedLineUrl).origin&&checkedColumns.find(column=>column.path===url.pathname);if(column)return response(topicHtml(column));
 throw Error('Unannounced checked-line fixture URL: '+url.href);
}
