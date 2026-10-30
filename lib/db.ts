import {env} from 'cloudflare:workers';
export function db(){if(!env.DB)throw Error('数据库尚未连接');return env.DB;}
export async function list(sql:string,...args:any[]){return (await db().prepare(sql).bind(...args).all()).results as any[];}
export async function run(sql:string,...args:any[]){return db().prepare(sql).bind(...args).run();}
export function stmt(sql:string,...args:any[]){return db().prepare(sql).bind(...args);}
export async function batches(rows:any[]){for(let i=0;i<rows.length;i+=80)await db().batch(rows.slice(i,i+80));}
