const fs=require('fs'); 
const c=fs.readFileSync('F:/APPs/frontend/src/lib/exportRoyaltyQuoteDocx.ts','utf8');  
const s=c.indexOf('new Document');  
const e=c.indexOf('export async function',s);  
console.log(c.substring(s,e)); 
