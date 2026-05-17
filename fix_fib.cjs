const fs = require('fs');
let code = fs.readFileSync('src/components/WaveChart.tsx', 'utf8');
code = code.replace(/const newTime = \(p\.time as number\) \+ 0\.001;/g, 'let newTime = (p.time as number) + 1;\n                    while(seenTimes.has(newTime)) newTime += 1;');
fs.writeFileSync('src/components/WaveChart.tsx', code, 'utf8');
