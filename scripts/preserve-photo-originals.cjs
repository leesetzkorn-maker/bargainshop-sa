const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const sources = [
    ['ez-pawn', 'C:/Users/leese/Desktop/ez pawn'],
    ['first-intake', 'C:/Users/leese/AppData/Local/Temp/2de-ezpawn-extract'],
    ['imported-store-photos', 'public/uploads/products'],
  ];
  const manifest = [];
  for (const [group,source] of sources) {
    const destination = path.join('data/internal/photo-originals',group);
    await fs.mkdir(destination,{recursive:true});
    for(const entry of await fs.readdir(source,{withFileTypes:true})) {
      if(!entry.isFile() || !/\.(jpe?g|png|webp)$/i.test(entry.name)) continue;
      const from = path.join(source,entry.name), to=path.join(destination,entry.name);
      const original = await fs.readFile(from);
      const hash = crypto.createHash('sha256').update(original).digest('hex');
      try { await fs.writeFile(to,original,{flag:'wx'}); }
      catch(e) { if(e.code!=='EEXIST') throw e; }
      const storedHash = crypto.createHash('sha256').update(await fs.readFile(to)).digest('hex');
      if(storedHash!==hash) throw new Error(`Existing backup differs: ${to}; refusing overwrite`);
      manifest.push({source:from,backup:to,sha256:hash,bytes:original.length});
    }
  }
  await fs.writeFile('data/internal/photo-originals/manifest.json',JSON.stringify({at:new Date().toISOString(),files:manifest},null,2)+'\n');
  console.log(`Preserved and hash-verified ${manifest.length} images. No source file was modified.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
