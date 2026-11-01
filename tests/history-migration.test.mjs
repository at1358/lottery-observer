import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
test('upgrading an existing database preserves originals and marks legacy evidence for semantic classification',()=>{
 const d=new DatabaseSync(':memory:'),directory=new URL('../drizzle/',import.meta.url);
 try{for(const name of readdirSync(directory).filter(n=>/^000[0-5].*\.sql$/.test(n)).sort())d.exec(readFileSync(new URL(name,directory),'utf8'));
  d.prepare('INSERT INTO sources(id,name,kind,year,created_at) VALUES(?,?,?,?,?)').run('source','东逃西散【绝杀一段】','杀段',2026,'2026-10-30T12:00:00Z');
  d.prepare('INSERT INTO predictions(id,source_id,year,issue,kind,raw,parsed,first_seen,last_seen,changed) VALUES(?,?,?,?,?,?,?,?,?,?)').run('record','source',2026,'304','杀段','304期绝杀一段【4段】开？00准','{"valid":true,"values":[4],"warnings":[]}','2026-10-30T12:00:00Z','2026-10-31T14:00:00Z',1);
  d.prepare('INSERT INTO revisions VALUES(?,?,?,?)').run('legacy','record','304期绝杀一段【4段】开狗21中','2026-10-31T14:00:00Z');
  const before=d.prepare('SELECT raw,parsed,first_seen FROM predictions').get();d.exec(readFileSync(new URL('0006_source_history.sql',directory),'utf8'));
  assert.deepEqual(d.prepare('SELECT raw,parsed,first_seen FROM predictions').get(),before);assert.equal(d.prepare('SELECT auto_relocate FROM sources').get().auto_relocate,1);assert.equal(d.prepare('SELECT change_type FROM revisions').get().change_type,'legacy');
  d.prepare("INSERT INTO revisions(id,prediction_id,raw,created_at,change_type,version) VALUES('one','record','changed','now','prediction',1)").run();assert.throws(()=>d.prepare("INSERT INTO revisions(id,prediction_id,raw,created_at,change_type,version) VALUES('duplicate','record','changed','now','prediction',1)").run(),/UNIQUE/);assert.equal(d.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{d.close();}
});
