import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
const base=process.env.QA_BASE_URL;
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):5\d{3}$/.test(base||''))throw Error('Local QA only');
const headers={'Content-Type':'application/json'};
async function post(route,value,cookie='',agent='QA browser'){
 const response=await fetch(base+'/api/'+route,{method:'POST',headers:{...headers,cookie,'User-Agent':agent},body:JSON.stringify(value)});
 assert.equal(response.status,200,await response.clone().text());return response;
}
const root=await post('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'}),admin=root.headers.get('set-cookie').split(';')[0];
const username='session-'+crypto.randomUUID().slice(0,8),password='App-only-session-Password-9276';
await post('users/create',{username,password,name:'App会话测试',role:'viewer'},admin);
const app=await post('auth/login',{username,password},'','Mozilla/5.0 PeriodObserverAndroid/1.1.0'),web=await post('auth/login',{username,password});
assert.match(app.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Max-Age=7776000/);
assert.match(web.headers.get('set-cookie'),/Max-Age=43200/);
const appCookie=app.headers.get('set-cookie').split(';')[0],webCookie=web.headers.get('set-cookie').split(';')[0];
const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite'));
const sessions=db.prepare('SELECT created_at,expires_at FROM app_sessions WHERE user_id=(SELECT id FROM app_users WHERE username=?) ORDER BY expires_at').all(username);
assert.equal(sessions.length,2);
assert.equal(Date.parse(sessions[0].expires_at)-Date.parse(sessions[0].created_at),43200000);
assert.equal(Date.parse(sessions[1].expires_at)-Date.parse(sessions[1].created_at),7776000000);
assert.equal((await fetch(base+'/api/state',{headers:{cookie:appCookie}})).status,200);
// Logging out one installation revokes its token but preserves the other session.
const out=await post('auth/logout',{},appCookie,'PeriodObserverAndroid/1.1.0');assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
assert.equal((await fetch(base+'/api/state',{headers:{cookie:appCookie}})).status,401);
assert.equal((await fetch(base+'/api/state',{headers:{cookie:webCookie}})).status,200);
const again=await post('auth/login',{username,password},'','PeriodObserverAndroid/1.1.0'),newCookie=again.headers.get('set-cookie').split(';')[0];
await post('account/password',{currentPassword:password,password:'Changed-app-session-password-9276'},newCookie);
for(const cookie of [newCookie,webCookie])assert.equal((await fetch(base+'/api/state',{headers:{cookie}})).status,401);
db.close();console.log('PASS: Android 90-day persistent cookie/server expiry; browser 12-hour expiry unchanged; logout and password changes revoke saved sessions.');
