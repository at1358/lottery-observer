const columns=[['classic','901.com【经典24码】作者：小辣椒','经典24码',24],['mystery','【神秘㉔码】资料已公开','神秘㉔码',24],['weichang','1903.com兔年-作者:面包车【㉔码伟长】','㉔码伟长',24],['baote','1903兔年【24码爆特】精彩好料1903.com','24码爆特',24],['tonghe','1903兔年-作者:面包车【同贺㉚码】1903.com','同贺㉚码',30]];
export const hostnameColumns=columns.map(([id,name,topic,count])=>({id,name,topic,count,raw:'313期【'+topic+'】开:？00准\n'+Array.from({length:count/12|0},(_,row)=>'【'+Array.from({length:12},(_,n)=>String(row*12+n+1).padStart(2,'0')).join(' ')+'】').join('\n')+(count%12?'\n【'+Array.from({length:count%12},(_,n)=>String((count/12|0)*12+n+1).padStart(2,'0')).join(' ')+'】':'')}));
export const hostnameFormHtml='<html><body><form id="f" method="POST" action=""><input type="hidden" name="d" id="d"></form><script>(function(){var endpoints=[{domain:"route.qa-hostname.example",path:"/_public1"}];var endpoint=endpoints[Math.floor(Math.random()*endpoints.length)];var subdomain=Math.random().toString(36).slice(2,10);var port=51237+Math.floor(Math.random()*8);var form=document.getElementById("f");var input=document.getElementById("d");form.action="https://"+subdomain+"."+endpoint.domain+":"+port+endpoint.path;input.value=btoa(window.location.hostname);HTMLFormElement.prototype.submit.call(form);})();</script></body></html>';
export function xorEntry(text){const key='bp_cp_123',data=btoa(String.fromCharCode(...new TextEncoder().encode(text).map((b,i)=>b^key.charCodeAt(i%key.length))));return '<html><script>var _d="'+data+'";var _k="'+key+'";var _r=atob(_d);var _b=new Uint8Array(_r.length);for(var _i=0;_i<_r.length;_i++){_b[_i]=_r.charCodeAt(_i)^_k.charCodeAt(_i%_k.length);}var _h=new TextDecoder().decode(_b);document.write(_h);</script></html>';}
export function hostnameFormResponse(url,options){
 if(!url.hostname.endsWith('.qa-hostname.example'))return null;
 const html=text=>new Response(text,{headers:{'Content-Type':'text/html; charset=utf-8'}});
 if(url.hostname==='captcha.qa-hostname.example')return html('<title>安全验证</title><p>请拖动滑块，将拼图移动到正确位置</p>');
 if(url.hostname==='entry.qa-hostname.example')return html(xorEntry(hostnameFormHtml));
 if(url.hostname.endsWith('.route.qa-hostname.example')){if(options.method!=='POST'||new URLSearchParams(options.body).get('d')!==btoa('entry.qa-hostname.example')||options.headers.Origin!=='http://entry.qa-hostname.example')throw Error('Incorrect hostname form transport');return new Response(null,{status:303,headers:{Location:'https://body.qa-hostname.example/'}});}
 if(url.hostname==='body.qa-hostname.example'){
  if(options.method==='POST'||options.body)throw Error('Public 303 must use GET');
  if(url.pathname==='/')return html(hostnameColumns.map(c=>'<a href="/'+c.id+'">'+c.name+'</a>').join(''));
  const column=hostnameColumns.find(c=>'/'+c.id===url.pathname);if(column)return html('<section><h2>'+column.name+'</h2><p>'+column.raw.replaceAll('\n','<br>')+'</p></section>');
 }throw Error('Unannounced hostname fixture URL');
}
