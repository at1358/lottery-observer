import {spawnSync} from 'node:child_process';
import {cpSync,mkdirSync,existsSync,renameSync} from 'node:fs';
// Build in a separate directory to avoid mixing Linux and Sites publication outputs.
const result=spawnSync(process.execPath,['node_modules/vinext/dist/cli.js','build'],{stdio:'inherit',env:{...process.env,OBSERVER_TARGET:'node'}});
if(result.status!==0)process.exit(result.status||1);
if(!existsSync('dist/standalone/server.js'))throw Error('Node standalone output was not generated');
mkdirSync('dist-linux',{recursive:true});cpSync('dist/standalone','dist-linux',{recursive:true});cpSync('drizzle','dist-linux/drizzle',{recursive:true});
cpSync('deploy/tick.mjs','dist-linux/tick.mjs');
cpSync('deploy/import-backup.mjs','dist-linux/import-backup.mjs');
cpSync('deploy','dist-linux/deploy',{recursive:true});
console.log('Linux application: dist-linux/server.js. Set DATA_DIR, BOOTSTRAP_ADMIN_TOKEN and COLLECTOR_SERVICE_TOKEN before starting.');
