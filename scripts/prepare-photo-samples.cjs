// Use generated fills only within the reviewed price-tag regions.
// Preserve every decoded original pixel outside those regions, and keep source JPEGs.
const sharp = require('sharp');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const root = 'data/internal/photo-review';
const samples = [
  { itemId: '2DS-0060', source: 'C:/Users/leese/Desktop/ez pawn/IMG-20260928-WA0003.jpg', original: '2ds-0060-original.jpg', generated: '2ds-0060-generated.png', polygons: ['450,1310 670,1320 760,1390 680,1980 540,2040 327,1880 423,1630', '464,1360 437,1560 425,1700 417,1820 390,1950 384,1960 401,1810 410,1680 424,1550 452,1360'] },
  { itemId: '2DS-0062', source: 'C:/Users/leese/Desktop/ez pawn/IMG-20260928-WA0032.jpg', original: '2ds-0062-original.jpg', generated: '2ds-0062-generated.png', polygons: ['429,1650 818,1703 784,1866 740,1909 409,1844', '894,1145 1114,1201 1143,1261 1134,1397 1070,1464 886,1378 860,1300', '424,1048 509,1053 497,1148 417,1144'] },
];
async function main() {
  const manifest = [];
  for (const s of samples) {
    const originalPath = `${root}/originals/${s.original}`;
    const { data: original, info } = await sharp(originalPath).rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const generated = await sharp(`${root}/candidates/${s.generated}`).resize(info.width,info.height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
    const svg = `<svg width="${info.width}" height="${info.height}" viewBox="0 0 1152 2048" xmlns="http://www.w3.org/2000/svg">${s.polygons.map(points=>`<polygon points="${points}" fill="white"/>`).join('')}</svg>`;
    const mask = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    const result = Buffer.from(original);
    let editedPixels=0;
    for(let pixel=0;pixel<info.width*info.height;pixel++) {
      const offset=pixel*4;
      if(mask[offset+3]>0) { for(let c=0;c<3;c++) result[offset+c]=generated[offset+c]; editedPixels++; }
    }
    const candidate = `${root}/candidates/${s.itemId.toLowerCase()}-masked.png`;
    await sharp(result,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(candidate);
    const decoded = await sharp(candidate).ensureAlpha().raw().toBuffer();
    let changedOutside=0;
    for(let pixel=0;pixel<info.width*info.height;pixel++) if(mask[pixel*4+3]===0) for(let c=0;c<4;c++) if(decoded[pixel*4+c]!==original[pixel*4+c]) {changedOutside++;break;}
    if(changedOutside) throw new Error('Original pixels changed outside tag mask');
    manifest.push({itemId:s.itemId,source:s.source,original:originalPath,originalSha256:crypto.createHash('sha256').update(await fs.readFile(originalPath)).digest('hex'),candidate,generated:`${root}/candidates/${s.generated}`,approval:'REJECTED_TECHNICAL_REVIEW',reviewNote:'Visible seams and paper remnants. Generated full-frame versions alter unmasked detail. Neither version may be promoted.',editedPixels,changedOutside,dimensions:[info.width,info.height],instruction:'Built-in imagegen: remove EZ Pawn price paper only; preserve manufacturer labels, visible wear, geometry, background and lighting. Generated fill restricted to recorded tag polygons.',maskPolygons:s.polygons});
  }
  await fs.writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
  console.log(manifest.map(s=>({itemId:s.itemId,candidate:s.candidate,changedOutside:s.changedOutside})));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
