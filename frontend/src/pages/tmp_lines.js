const fs = require('fs');
const path = 'F:/APPs/frontend/src/pages/DispatchesPage.backup1.tsx';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
console.log(lines.length);
for (let i=0;i<lines.length;i++) {
  process.stdout.write(`${String(i+1).padStart(6)}|${lines[i]}\n`);
}
