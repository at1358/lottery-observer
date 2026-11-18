import assert from 'node:assert/strict';
const base=process.env.QA_BASE_URL;
if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||''))throw Error('Isolated QA required');
const anonymous=await fetch(base+'/m?view=ranking'),login=await anonymous.text();assert.equal(anonymous.status,200);assert.match(login,/登录工作台/);assert.doesNotMatch(login,/name="viewport"[^>]*maximum-scale/);
assert.match(login,/name="viewport"/);assert.match(login,/width=device-width/);
const auth=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'qa-admin',password:'Local-only-admin-Password-9276'})});assert.equal(auth.status,200);const cookie=auth.headers.get('set-cookie').split(';')[0];
const api=async route=>{const r=await fetch(base+'/api/'+route,{headers:{cookie}});assert.equal(r.status,200);return r.json();},state=await api('state?view=ranking'),sources=state.sources;
assert.ok(sources.length);const materials=await api('custom-materials');assert.ok(materials.items.length);
for(const route of ['/m','/m?view=ranking','/m?view=sources','/m?view=combinations','/m?view=simulation','/m/materials/'+sources[0].id,'/m/self-materials/'+materials.items[0].id]){
 const response=await fetch(base+route,{headers:{cookie}}),html=await response.text();assert.equal(response.status,200,route);assert.match(html,/手机常用导航/,route);assert.match(html,/打开工作台菜单/,route);assert.doesNotMatch(html,/登录工作台/,route);
}
for(const route of ['/','/materials/'+sources[0].id,'/self-materials/'+materials.items[0].id]){const r=await fetch(base+route,{headers:{cookie}});assert.equal(r.status,200);}
console.log('PASS: shared authenticated mobile/home/material/custom routes, login viewport, mobile navigation, legacy desktop routes and unchanged API access. No external requests or robot messages.');
