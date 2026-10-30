import {list} from './db';
export const backupTables=['folders','sources','draws','predictions','revisions','snapshots','collection_periods','settings','trash','jobs','app_users'];
export async function exportBackup(){const entries=await Promise.all(backupTables.map(async table=>[table,await list('SELECT * FROM '+table)]));return {format:'period-observer-backup-v1',createdAt:new Date().toISOString(),tables:Object.fromEntries(entries)};}
