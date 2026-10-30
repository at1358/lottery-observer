const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
export const digest=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
export function passwordPolicy(value){if(typeof value!=='string'||value.length<12||value.length>128)throw Error('密码须为 12–128 位');return value;}
export async function hashPassword(password){
 passwordPolicy(password);const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const result=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256);
 return 'pbkdf2-sha256$100000$'+hex(salt)+'$'+hex(result);
}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export async function verifyPassword(password,stored){
 if(typeof password!=='string'||password.length>128)return false;
 const [algorithm,count,salt,expected]=String(stored).split('$');if(algorithm!=='pbkdf2-sha256'||count!=='100000'||!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{64}$/.test(expected||''))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const value=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(salt.match(/../g).map(x=>parseInt(x,16))),iterations:Number(count)},key,256);
 return equal(hex(value),expected);
}
