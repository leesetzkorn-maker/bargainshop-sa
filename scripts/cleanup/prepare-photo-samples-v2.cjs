const sharp = require('sharp');
const fs = require('node:fs/promises');
const root='data/internal/photo-review';
const samples=[
  {itemId:'2DS-0062',parts:[
    {file:'2ds-0062-label-generated-v2.png',left:675,top:2850,width:1000,height:780,points:'145,260 850,445 790,728 485,670 175,600 105,520'},
    {file:'2ds-0062-hanging-generated-v2.png',left:1560,top:2070,width:600,height:780,points:'176,70 523,245 567,295 574,392 540,640 450,677 114,452 90,390 136,320 161,230 161,140'},
    {file:'2ds-0062-generated.png',left:0,top:0,width:2160,height:3840,points:'798,1970 928,1978 916,2145 782,2140'},
  ]},
  {itemId:'2DS-0060',parts:[
    {file:'2ds-0060-tag-generated-v2.png',left:500,top:2250,width:1600,height:1590,points:'352,236 718,222 854,253 949,464 831,1568 657,1589 114,1298 249,1178 351,432 227,742 213,563 226,384'},
  ]},
];
async function main(){
  const manifest=[];
  for(const s of samples){
    const {data:original,info}=await sharp(`${root}/originals/${s.itemId.toLowerCase()}-original.jpg`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const result=Buffer.from(original),changedRegion=new Uint8Array(info.width*info.height);
    for(const part of s.parts){
      const fill=await sharp(`${root}/candidates/${part.file}`).resize(part.width,part.height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${part.width}" height="${part.height}"><polygon points="${part.points}" fill="white" stroke="white" stroke-width="70" stroke-linejoin="round"/></svg>`;
      const mask=await sharp(Buffer.from(svg)).blur(12).ensureAlpha().raw().toBuffer();
      for(let y=0;y<part.height;y++)for(let x=0;x<part.width;x++){
        const from=(y*part.width+x)*4;
        if(!mask[from+3])continue;
        const pixel=(y+part.top)*info.width+x+part.left, to=pixel*4;
        const alpha=mask[from+3]/255;
        for(let c=0;c<3;c++)result[to+c]=Math.round(fill[from+c]*alpha+result[to+c]*(1-alpha));
        changedRegion[pixel]=1;
      }
    }
    const output=`${root}/candidates/${s.itemId.toLowerCase()}-sample-v3.png`;
    await sharp(result,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(output);
    const decoded=await sharp(output).ensureAlpha().raw().toBuffer();
    let outside=0;for(let p=0;p<changedRegion.length;p++)if(!changedRegion[p])for(let c=0;c<4;c++)if(original[p*4+c]!==decoded[p*4+c]){outside++;break;}
    if(outside)throw new Error('Original pixels changed outside mask');
    manifest.push({itemId:s.itemId,output,parts:s.parts,changedOutside:outside,status:'PENDING_VISUAL_REVIEW',caution:'Hidden surfaces are AI reconstructions. They require comparison with the physical item before acceptance; no product image reference has changed.'});
  }
  await fs.writeFile(`${root}/manifest-v3.json`,JSON.stringify(manifest,null,2)+'\n');
  console.log(manifest.map(s=>({itemId:s.itemId,output:s.output,changedOutside:s.changedOutside})));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
