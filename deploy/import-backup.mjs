import {DatabaseSync} from 'node:sqlite';
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
const file=process.argv[2];if(!file)throw Error('Usage: node import-backup.mjs /private/path/backup.json');
if(statSync(file).size>100*1024*1024)throw Error('Backup exceeds 100 MB');
const backup=JSON.parse(readFileSync(file,'utf8'));if(backup.format!=='period-observer-backup-v1'||!backup.tables)throw Error('Unsupported backup');
const tables=['folders','sources','draws','predictions','revisions','snapshots','collection_periods','settings','trash','jobs','app_users'];
const d=new DatabaseSync(path.join(path.resolve(process.env.DATA_DIR||'data'),'observer.sqlite'));
try{
 for(const table of tables){if(!d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))throw Error('Start the server once to initialize database migrations, then stop it before import');if(d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)throw Error('Import requires a new empty database; existing data will not be overwritten');}
 d.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
 try{for(const table of tables){const columns=new Set(d.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name));const rows=backup.tables[table]||[];if(!Array.isArray(rows))throw Error('Invalid backup table '+table);for(const row of rows){const keys=Object.keys(row);if(keys.some(k=>!columns.has(k)))throw Error('Backup schema is newer than this server');const sql=`INSERT INTO ${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES(${keys.map(()=>'?').join(',')})`;d.prepare(sql).run(...keys.map(k=>row[k]));}}d.exec('DELETE FROM app_sessions; DELETE FROM login_attempts; COMMIT');}catch(e){d.exec('ROLLBACK');throw e;}
 console.log('Backup imported. Start the service and sign in again.');
}finally{d.close();}
