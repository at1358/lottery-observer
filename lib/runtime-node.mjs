import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
let database;
function sqlite(){
 if(database)return database;
 const directory=path.resolve(process.env.DATA_DIR||'data');mkdirSync(directory,{recursive:true});
 const current=new DatabaseSync(path.join(directory,'observer.sqlite'));
 current.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS _schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL);');
 const migrationDir=path.resolve(process.env.MIGRATIONS_DIR||'drizzle');
 for(const name of readdirSync(migrationDir).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
  if(current.prepare('SELECT name FROM _schema_migrations WHERE name=?').get(name))continue;
  const sql=readFileSync(path.join(migrationDir,name),'utf8');
  // The early draws migration rebuilds a table with foreign-key pragmas.
  current.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try{current.exec(sql);current.prepare('INSERT INTO _schema_migrations VALUES(?,?)').run(name,new Date().toISOString());current.exec('COMMIT');}catch(e){current.exec('ROLLBACK');current.close();throw e;}
 }
 current.exec('PRAGMA foreign_keys=ON');database=current;return current;
}
class Statement{
 constructor(sql,args=[]){this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.sql,args);}
 execute(){const r=sqlite().prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
 async run(){return this.execute();}
 async all(){return {results:sqlite().prepare(this.sql).all(...this.args),success:true};}
}
export const env={...process.env,AUTH_MODE:'standalone',DB:{prepare:sql=>new Statement(sql),async batch(statements){const d=sqlite();d.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.execute());d.exec('COMMIT');return r;}catch(e){d.exec('ROLLBACK');throw e;}}},openWebSocket:url=>new WebSocket(url)};
