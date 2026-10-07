// Non-destructive local compositing of imagegen fills; originals remain intact.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = 'data/internal/photo-review';
async function main() {
  const [mode, indexText, rectText, generated] = process.argv.slice(2);
  const index = Number(indexText);
  const queue = JSON.parse(await fs.readFile(`${root}/queue.json`, 'utf8'));
  const item = queue[index];
  if (!item) throw new Error('Unknown image index');
  let original = path.join('public', item.url);
  const base = `${root}/batch/${index}`;
  await fs.mkdir(base, {recursive:true});
  if (mode === 'prepare') {
    const rects = JSON.parse(rectText);
    const meta = await sharp(original).metadata();
    const areas = rects.map(([x,y,w,h]) => ({left:Math.floor(x*meta.width),top:Math.floor(y*meta.height),width:Math.ceil(w*meta.width),height:Math.ceil(h*meta.height)}));
    const left = Math.max(0, Math.min(...areas.map(a=>a.left))-200);
    const top = Math.max(0, Math.min(...areas.map(a=>a.top))-200);
    const right = Math.min(meta.width, Math.max(...areas.map(a=>a.left+a.width))+200);
    const bottom = Math.min(meta.height, Math.max(...areas.map(a=>a.top+a.height))+200);
    const crop = {left,top,width:right-left,height:bottom-top};
    await sharp(original).extract(crop).png().toFile(`${base}/target.png`);
    await fs.writeFile(`${base}/job.json`,JSON.stringify({index,item,original,areas,crop},null,2));
    console.log(path.resolve(`${base}/target.png`));
  } else if (mode === 'finish') {
    const job = JSON.parse(await fs.readFile(`${base}/job.json`,'utf8'));
    original = job.original;
    await fs.copyFile(generated,`${base}/generated.png`);
    const {data:source,info} = await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const out = Buffer.from(source);
    const fill = await sharp(generated).resize(job.crop.width,job.crop.height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
    const bias=[0,0,0];
    if(job.colourMatch){
      let count=0;
      for(let y=0;y<job.crop.height;y+=3)for(let x=0;x<job.crop.width;x+=3){
        const gx=x+job.crop.left,gy=y+job.crop.top;
        const near=job.areas.some(a=>gx>=a.left-50&&gx<=a.left+a.width+50&&gy>=a.top-50&&gy<=a.top+a.height+50);
        const inside=job.areas.some(a=>gx>=a.left-15&&gx<=a.left+a.width+15&&gy>=a.top-15&&gy<=a.top+a.height+15);
        if(!near||inside)continue;
        const src=(gy*info.width+gx)*4,dst=(y*job.crop.width+x)*4;
        for(let c=0;c<3;c++)bias[c]+=source[src+c]-fill[dst+c];
        count++;
      }
      if(count)for(let c=0;c<3;c++)bias[c]/=count;
    }
    const shapes = job.areas.map(a=>a.points
      ? `<polygon points="${a.points.map(([x,y])=>`${x-job.crop.left},${y-job.crop.top}`).join(' ')}" fill="white" stroke="white" stroke-width="40" stroke-linejoin="round"/>`
      : `<rect x="${a.left-job.crop.left}" y="${a.top-job.crop.top}" width="${a.width}" height="${a.height}" fill="white"/>`).join('');
    const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${job.crop.width}" height="${job.crop.height}">${shapes}</svg>`)).blur(job.feather || 12).ensureAlpha().raw().toBuffer();
    const touched = new Uint8Array(info.width*info.height);
    for(let y=0;y<job.crop.height;y++)for(let x=0;x<job.crop.width;x++){
      const p=(y*job.crop.width+x)*4,alpha=mask[p+3]/255;
      if(!alpha)continue;
      const pixel=(y+job.crop.top)*info.width+x+job.crop.left, dest=pixel*4;
      for(let c=0;c<3;c++)out[dest+c]=Math.round(Math.max(0,Math.min(255,fill[p+c]+bias[c]))*alpha+source[dest+c]*(1-alpha));
      touched[pixel]=1;
    }
    let outside=0;
    for(let p=0;p<touched.length;p++)if(!touched[p])for(let c=0;c<4;c++)if(out[p*4+c]!==source[p*4+c]){outside++;break;}
    if(outside)throw new Error('Unexpected changes outside edit area');
    await fs.mkdir(`${root}/candidates`,{recursive:true});
    const candidate=`${root}/candidates/${index}-clean.png`;
    await sharp(out,{raw:info}).png().toFile(candidate);
    await fs.writeFile(`${base}/result.json`,JSON.stringify({...job,candidate,changedOutside:outside,status:'NEEDS_VISUAL_REVIEW'},null,2));
    console.log(candidate);
  } else throw new Error('Use prepare or finish');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
