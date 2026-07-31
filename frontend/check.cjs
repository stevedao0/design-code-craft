const fs=require('fs');  
const c=fs.readFileSync('F:/APPs/frontend/src/lib/exportRoyaltyQuoteDocx.ts','utf8');  
const lines=c.split('\n');  
for(let i=285;i<300;i++){console.log((i+1)+': '+lines[i]);}  
