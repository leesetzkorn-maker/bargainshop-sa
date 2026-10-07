const sharp=require('sharp');
const fs=require('node:fs/promises');
const path=require('node:path');
async function main(){
  const catalogue=JSON.parse(await fs.readFile('data/internal/catalogue-review.json','utf8'));
  const queue=catalogue.products.flatMap(p=>p.images.map(im=>({itemId:p.itemId,name:p.name,imageId:im.imageId,url:im.url})));
  await fs.mkdir('data/internal/photo-review/contact-sheets',{recursive:true});
  for(let page=0;page<Math.ceil(queue.length/16);page++){
    const cells=[];
    for(let n=page*16;n<Math.min(queue.length,(page+1)*16);n++){
      const im=queue[n],i=n%16;
      const bytes=await sharp(path.join('public',im.url)).resize(240,400,{fit:'contain',background:'#e5e5e5'}).png().toBuffer();
      cells.push({input:bytes,left:(i%4)*240,top:Math.floor(i/4)*430});
      cells.push({input:Buffer.from(`<svg width="240" height="30"><rect width="240" height="30" fill="white"/><text x="8" y="21" font-family="Arial" font-size="16">${n}: ${im.itemId}</text></svg>`),left:(i%4)*240,top:Math.floor(i/4)*430+400});
    }
    await sharp({create:{width:960,height:1720,channels:3,background:'#eeeeee'}}).composite(cells).png().toFile(`data/internal/photo-review/contact-sheets/page-${page}.png`);
  }
  await fs.writeFile('data/internal/photo-review/queue.json',JSON.stringify(queue,null,2)+'\n');
  console.log(queue.map((im,n)=>`${n}: ${im.itemId} ${path.basename(im.url)}`).join('\n'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
