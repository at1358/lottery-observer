import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {list,run,db,stmt} from './db';
import {hashPassword,verifyPassword,digest,equal,passwordPolicy} from './password.mjs';
const stamp=()=>new Date().toISOString();
const config=env as any;
export const standalone=()=>config.AUTH_MODE==='standalone';
export function forbidden(message='没有操作权限',status=403){const e:any=Error(message);e.status=status;throw e;}
export async function accountState(){const [r]=await list('SELECT COUNT(*) AS count FROM app_users');return {initialized:r.count>0,standalone:standalone()};}
export async function principal(){
 const h=await headers(),token=h.get('cookie')?.match(/(?:^|;\s*)observer_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(token){const [u]=await list('SELECT u.id,u.username,u.name,u.role,u.enabled FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.enabled=1',await digest(token),stamp());if(u)return {...u,bootstrap:false};}
 const state=await accountState();if(!state.initialized&&!standalone()){const u=await getChatGPTUser();if(u)return {id:u.userId,username:u.email,name:u.displayName,email:u.email,role:'admin',bootstrap:true};}
 return null;
}
export async function requirePrincipal(write=false,admin=false){const u=await principal();if(!u)forbidden('请先登录',401);if(admin&&u.role!=='admin'||write&&u.role==='viewer')forbidden();return u;}
function fields(input:any){const username=String(input.username||'').trim().toLowerCase(),name=String(input.name||'').trim();if(!/^[a-z0-9][a-z0-9_.@-]{2,63}$/.test(username))throw Error('用户名须为 3–64 位字母、数字或 _ . @ -');if(!name||name.length>60)throw Error('请填写 1–60 位用户姓名');return {username,name};}
async function session(user:any,request:Request){const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');await run('INSERT INTO app_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)',await digest(token),user.id,stamp(),new Date(Date.now()+12*3600000).toISOString());await run('DELETE FROM app_sessions WHERE expires_at<?',stamp());return {user:{id:user.id,username:user.username,name:user.name,role:user.role},cookie:cookie(token,request)};}
function cookie(token:string,request:Request){return `observer_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?43200:0}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function bootstrap(input:any,request:Request){
 if((await accountState()).initialized)forbidden('主管理员账号已经创建');
 if(standalone()){if(!config.BOOTSTRAP_ADMIN_TOKEN||!equal(String(input.bootstrapToken||''),config.BOOTSTRAP_ADMIN_TOKEN))forbidden('首次初始化凭证不正确');}else await requirePrincipal(false,true);
 const value=fields(input),hash=await hashPassword(input.password),user={id:crypto.randomUUID(),...value,role:'admin'};
 const result=await run('INSERT INTO app_users(id,username,name,password_hash,role,enabled,created_at) SELECT ?,?,?,?,\'admin\',1,? WHERE NOT EXISTS(SELECT 1 FROM app_users)',user.id,value.username,value.name,hash,stamp());
 if(!result.meta.changes)throw Error('主管理员账号已由其他请求创建，请登录');return session(user,request);
}
async function consume(key:string,limit:number){
 const reset=new Date(Date.now()+15*60000).toISOString();
 await run('INSERT INTO login_attempts(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END',key,reset,stamp(),stamp());
 const [r]=await list('SELECT attempts FROM login_attempts WHERE key=?',key);if(r.attempts>limit)forbidden('尝试次数过多，请 15 分钟后再试',429);
}
export async function login(input:any,request:Request){
 const username=String(input.username||'').trim().toLowerCase(),key='user:'+await digest(username),ip='ip:'+await digest((standalone()?((config.VINEXT_TRUST_PROXY==='1'||config.VINEXT_TRUSTED_HOSTS)?request.headers.get('x-forwarded-for'):null):request.headers.get('cf-connecting-ip'))||'local');
 await consume(ip,60);await consume(key,8);
 const [u]=await list('SELECT * FROM app_users WHERE username=?',username);
 const dummy='pbkdf2-sha256$100000$00000000000000000000000000000000$'+'0'.repeat(64);
 const valid=await verifyPassword(input.password,u?.password_hash||dummy);if(!valid||!u?.enabled)forbidden('用户名或密码不正确，或账号已停用',401);
 await run('DELETE FROM login_attempts WHERE key=?',key);await run('UPDATE app_users SET last_login=? WHERE id=?',stamp(),u.id);return session(u,request);
}
export async function logout(request:Request){const token=request.headers.get('cookie')?.match(/observer_session=([a-f0-9]{64})/)?.[1];if(token)await run('DELETE FROM app_sessions WHERE token_hash=?',await digest(token));return cookie('',request);}
export async function users(){await requirePrincipal(false,true);return list('SELECT id,username,name,role,enabled,created_at,last_login FROM app_users ORDER BY created_at');}
export async function createUser(input:any){const actor=await requirePrincipal(false,true);if(actor.bootstrap)throw Error('请先创建主管理员账号');const value=fields(input);if(!['admin','operator','viewer'].includes(input.role))throw Error('请选择有效角色');const hash=await hashPassword(input.password);try{await run('INSERT INTO app_users(id,username,name,password_hash,role,enabled,created_at) VALUES(?,?,?,?,?,1,?)',crypto.randomUUID(),value.username,value.name,hash,input.role,stamp());}catch(e:any){if(e.message.includes('UNIQUE'))throw Error('用户名已存在');throw e;}return {created:true};}
export async function updateUser(input:any){const actor=await requirePrincipal(false,true),[target]=await list('SELECT id,role,enabled FROM app_users WHERE id=?',input.id);if(!target)throw Error('账号不存在');if(!['admin','operator','viewer'].includes(input.role))throw Error('请选择有效角色');if(target.id===actor.id&&(!input.enabled||input.role!=='admin'))throw Error('不能停用自己的账号或取消自己的管理员权限');
 const name=String(input.name||'').trim();if(!name||name.length>60)throw Error('姓名须为 1–60 位');
 // The conditional update also prevents concurrent requests from removing the last administrator.
 const result=await run("UPDATE app_users SET name=?,role=?,enabled=? WHERE id=? AND (role<>'admin' OR enabled=0 OR (?='admin' AND ?=1) OR (SELECT COUNT(*) FROM app_users WHERE role='admin' AND enabled=1)>1)",name,input.role,input.enabled?1:0,target.id,input.role,input.enabled?1:0);
 if(!result.meta.changes)throw Error('至少保留一位启用的管理员');await run('DELETE FROM app_sessions WHERE user_id=?',target.id);return {saved:true};}
export async function changePassword(input:any){const actor=await requirePrincipal(),target=input.id||actor.id;if(target!==actor.id&&actor.role!=='admin')forbidden();if(actor.bootstrap)throw Error('请先创建主管理员账号');const [user]=await list('SELECT password_hash FROM app_users WHERE id=?',target);if(!user)throw Error('账号不存在');if(target===actor.id)await consume('password:'+actor.id,8);if(target===actor.id&&!await verifyPassword(input.currentPassword,user.password_hash))throw Error('当前密码不正确');passwordPolicy(input.password);const hash=await hashPassword(input.password);await db().batch([stmt('UPDATE app_users SET password_hash=? WHERE id=?',hash,target),stmt('DELETE FROM app_sessions WHERE user_id=?',target)]);return {saved:true,reauthenticate:target===actor.id};}
export async function authorizeService(request:Request){
 if(standalone()){if(config.COLLECTOR_SERVICE_TOKEN&&equal(request.headers.get('authorization')||'','Bearer '+config.COLLECTOR_SERVICE_TOKEN))return;await requirePrincipal(false,true);}
 else if(await getChatGPTUser())await requirePrincipal(false,true);
}
