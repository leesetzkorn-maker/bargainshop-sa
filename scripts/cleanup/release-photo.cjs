// Apply a reviewed edit to its exact existing image row. Keep originals and rollback records.
const { PrismaClient }=require('@prisma/client');
const sharp=require('sharp');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const prisma=new PrismaClient();
async function main(){
  const [itemId,sourceUrl,candidatePath]=process.argv.slice(2);
  if(!itemId||!sourceUrl||!candidatePath)throw new Error('Usage: node scripts/cleanup/release-photo.cjs <itemId> <originalUrl> <reviewedCandidate>');
  if(!sourceUrl.startsWith('/uploads/products/'))throw new Error('Unexpected original URL');
  const candidateAbsolute=path.resolve(candidatePath);
  if(!candidateAbsolute.startsWith(path.resolve('data/internal/photo-review')+path.sep))throw new Error('Candidate outside review directory');
  const originalPath=path.join(process.cwd(),'public',sourceUrl);
  const original=await fs.readFile(originalPath);
  const candidate=await fs.readFile(candidateAbsolute);
  const image=await prisma.productImage.findFirst({where:{url:sourceUrl,product:{itemId}},select:{id:true,productId:true}});
  const reportPath='data/internal/photo-release.json';
  let records=[];try{records=JSON.parse(await fs.readFile(reportPath,'utf8')).records;}catch{}
  if(!image){if(records.some(r=>r.itemId===itemId&&r.originalUrl===sourceUrl)){console.log('Already applied',itemId,sourceUrl);return;}throw new Error('No matching product image row');}
  const encoded=await sharp(candidate).webp({lossless:true}).toBuffer();
  const hash=crypto.createHash('sha256').update(encoded).digest('hex');
  const key=`${itemId.toLowerCase()}-clean-${hash.slice(0,16)}.webp`;
  const newUrl=`/uploads/products/${key}`;
  await fs.mkdir('data/internal/backups/photo-release',{recursive:true});
  const dbBackup=`data/internal/backups/photo-release/pre-${Date.now()}.db`;
  await fs.copyFile('prisma/dev.db',dbBackup);
  await fs.writeFile(path.join('public/uploads/products',key),encoded,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  await prisma.productImage.update({where:{id:image.id},data:{url:newUrl}});
  records.push({itemId,imageId:image.id,originalUrl:sourceUrl,originalSha256:crypto.createHash('sha256').update(original).digest('hex'),candidate:candidatePath,newUrl,at:new Date().toISOString(),dbBackup,review:'Assistant visual review; owner authorized completing batch and applying edits'});
  await fs.writeFile(reportPath,JSON.stringify({records},null,2)+'\n');
  console.log(itemId,newUrl);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
