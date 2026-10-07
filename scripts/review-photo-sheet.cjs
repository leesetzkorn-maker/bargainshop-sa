const sharp=require('sharp');
const fs=require('node:fs/promises');
async function main(){
 const indices=process.argv.slice(2).map(Number),width=600,height=1080;
 const tiles=[];
 for(let n=0;n<indices.length;n++){
  const i=indices[n],file=`data/internal/photo-review/candidates/${i}-clean.png`;
  const pic=await sharp(file).resize(width,height-40,{fit:'contain',background:'#ddd'}).png().toBuffer();
  const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="40"><rect width="600" height="40" fill="white"/><text x="10" y="30" font-size="25">Photo ${i} — edited</text></svg>`);
  const left=(n%4)*width,top=Math.floor(n/4)*height;
  tiles.push({input:pic,left,top},{input:label,left,top:top+height-40});
 }
 const output=`data/internal/photo-review/review-${indices.join('-')}.jpg`;
 await sharp({create:{width:width*Math.min(4,indices.length),height:height*Math.ceil(indices.length/4),channels:3,background:'#ddd'}}).composite(tiles).jpeg({quality:88}).toFile(output);
 console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
