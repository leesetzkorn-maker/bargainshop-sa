const assert = require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
 const product=await p.product.findFirst({where:{status:'DRAFT'},select:{slug:true}});
 const origin='http://127.0.0.1:3107';
 for(const route of ['/', '/shop', '/shipping','/cart','/admin/login']) {
  const response=await fetch(origin+route); const body=await response.text();
  assert.equal(response.status,200,route);
  assert.ok(!body.includes('sourceCostCents') && !body.includes('researchNotes'),route+' private-field leak');
  if(route==='/shipping') {assert.ok(body.includes('Estimated delivery typically'));assert.ok(!body.includes('R100'));}
  if(route==='/shop'&&product)assert.ok(!body.includes('/product/'+product.slug),'Draft visible in production shop');
  console.log('PASS',route,response.status);
 }
 const protectedPage=await fetch(origin+'/admin/products',{redirect:'manual'});
 assert.ok([303,307].includes(protectedPage.status));assert.ok(protectedPage.headers.get('location').includes('/admin/login'));console.log('PASS protected admin redirects to login');
 if(product){const response=await fetch(origin+'/product/'+product.slug);assert.equal(response.status,404);console.log('PASS unpublished product is not reachable');}
 const invalid=await fetch(origin+'/api/shipping/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deliveryMethod:'INVALID'})});assert.equal(invalid.status,400);console.log('PASS invalid shipping method rejected');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>p.$disconnect());
