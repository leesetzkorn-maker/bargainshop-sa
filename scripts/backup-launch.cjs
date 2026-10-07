const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const p = new PrismaClient();
(async () => {
 const rows = await p.$queryRawUnsafe('PRAGMA database_list');
 const dir = path.resolve('backups/launch-20261007'); fs.mkdirSync(dir,{recursive:true});
 for(const d of rows) if(d.file) { fs.copyFileSync(d.file,path.join(dir,'before-catalogue.sqlite')); console.log('Database backup saved'); }
})().finally(()=>p.$disconnect());
