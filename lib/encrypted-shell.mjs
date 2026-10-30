import {createHash,createDecipheriv} from 'node:crypto';
import {Buffer} from 'node:buffer';

// Decode the public CryptoJS/OpenSSL transport format used by these article shells.
// Website scripts are inspected as text and are never evaluated.
export function encryptedShell(html,sourceUrl){
 const script=[...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m=>m[1]).join('\n');
 const decrypt=script.match(/\bCryptoJS\s*\.\s*AES\s*\.\s*decrypt\s*\(\s*\w+\s*\.\s*data\s*,\s*([A-Za-z_$][\w$]*)\s*\)/);
 if(!decrypt)return null;
 const escape=name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const literal=String.raw`("(?:\\.|[^"\\])*"|'[^'\\]*')`;
 const keyMatch=script.match(new RegExp(String.raw`\b(?:const|let|var)\s+${escape(decrypt[1])}\s*=\s*${literal}\s*;`));
 const route=script.match(/\b(?:const|let|var)\s+(\w+)\s*=\s*getParam\s*\(\s*['"]([\w-]+)['"]\s*\)\s*(?:\|\|\s*['"]([a-zA-Z0-9/_-]+)['"])?\s*;/);
 const template=script.match(/\b(?:const|let|var)\s+(\w+)\s*=\s*`([a-zA-Z0-9_./-]+)\$\{(\w+)\}(\.json)`\s*;/);
 if(!keyMatch||!route||!template)return null;
 if(!new RegExp(String.raw`\b(?:const|let|var)\s+${escape(template[3])}\s*=\s*safePage\s*\(\s*${escape(route[1])}\s*\)`).test(script)||!new RegExp(String.raw`\bfetch\s*\(\s*${escape(template[1])}\s*\)`).test(script))return null;
 const key=keyMatch[1].startsWith('"')?JSON.parse(keyMatch[1]):keyMatch[1].slice(1,-1);
 if(!key||key.length>512)throw Error('来源网页的正文解码配置无效');
 const shell=new URL(sourceUrl),page=shell.searchParams.get(route[2])||route[3];
 if(!page||page.length>160||!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(page))throw Error('来源网址的栏目参数无效，请使用完整的栏目网址');
 const dataUrl=new URL(template[2]+page+template[4],shell);
 if(dataUrl.origin!==shell.origin||dataUrl.username||dataUrl.password||!['http:','https:'].includes(dataUrl.protocol))throw Error('正文接口必须与资料网页属于同一站点');
 return {key,dataUrl:dataUrl.href,shellUrl:shell.href};
}

export function decryptShellPayload(text,key){
 try{
  const payload=JSON.parse(text),encoded=payload?.data;
  if(typeof encoded!=='string'||encoded.length>1600000||!/^\s*[A-Za-z0-9+/]+={0,2}\s*$/.test(encoded))throw Error('Invalid ciphertext');
  const bytes=Buffer.from(encoded.trim(),'base64');
  if(bytes.length<32||bytes.subarray(0,8).toString('ascii')!=='Salted__'||(bytes.length-16)%16)throw Error('Unsupported transport');
  const salt=bytes.subarray(8,16),password=Buffer.from(key,'utf8'),parts=[];let previous=Buffer.alloc(0);
  // CryptoJS's passphrase format derives a 256-bit key and 128-bit IV with EVP_BytesToKey.
  for(let i=0;i<3;i++){previous=createHash('md5').update(Buffer.concat([previous,password,salt])).digest();parts.push(previous);}
  const derived=Buffer.concat(parts),decipher=createDecipheriv('aes-256-cbc',derived.subarray(0,32),derived.subarray(32,48));
  const plaintext=Buffer.concat([decipher.update(bytes.subarray(16)),decipher.final()]);
  if(!plaintext.length||plaintext.length>1200000)throw Error('Invalid plaintext size');
  return new TextDecoder('utf-8',{fatal:true}).decode(plaintext);
 }catch{throw Error('来源正文解码失败，网页格式或解码配置可能已变更，请重新识别');}
}
