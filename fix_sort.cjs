const fs = require('fs');
let code = fs.readFileSync('src/components/WaveChart.tsx', 'utf8');

if (!code.includes('const getNumericTime')) {
  code = code.replace(
    'export function WaveChart',
    'const getNumericTime = (t: any): number => { if (typeof t === "number") return t; if (typeof t === "string") return new Date(t).getTime(); if (t && typeof t === "object" && t.year) return new Date(t.year, t.month - 1, t.day).getTime(); return 0; };\n\nexport function WaveChart'
  );
}

code = code.replace(/\.sort\(\(a,\s*b\)\s*=>\s*a\.time\s*-\s*b\.time\)/g, '.sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time))');
code = code.replace(/\.sort\(\(a:\s*any,\s*b:\s*any\)\s*=>\s*a\.time\s*-\s*b\.time\)/g, '.sort((a: any, b: any) => getNumericTime(a.time) - getNumericTime(b.time))');
code = code.replace(/const pData = t1 < t2 \? \[/g, 'const pData = getNumericTime(t1) < getNumericTime(t2) ? [');

fs.writeFileSync('src/components/WaveChart.tsx', code);
console.log("Replaced successfully");
