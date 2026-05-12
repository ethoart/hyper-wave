const fs = require('fs');
let code = fs.readFileSync('src/components/WaveChart.tsx', 'utf8');

code = code.replace(/try {\s*const t1 = p1\.time as number;\s*let t2 = p2\.time as number;\s*if \(t1 === t2\) t2 = t1 \+ 1000;\s*(?:\/\/ Ensure strict ordering\s*)?const pData = getNumericTime\(t1\) < getNumericTime\(t2\) \? \[\s*\{ time: t1 as any, value: levelPrice \},\s*\{ time: t2 as any, value: levelPrice \}\s*\] : \[\s*\{ time: t2 as any, value: levelPrice \},\s*\{ time: t1 as any, value: levelPrice \}\s*\];\s*auxiliarySeriesRef\.current\[i\]\.setData\(pData\);\s*} catch\(e\) \{\}/g, 
`try {
    const nt1 = getNumericTime(p1.time);
    const nt2 = getNumericTime(p2.time);
    if (nt1 === nt2) return;
    const pData = nt1 < nt2 ? [
        { time: p1.time as any, value: levelPrice },
        { time: p2.time as any, value: levelPrice }
    ] : [
        { time: p2.time as any, value: levelPrice },
        { time: p1.time as any, value: levelPrice }
    ];
    auxiliarySeriesRef.current[i].setData(pData);
} catch(e) {}`);

fs.writeFileSync('src/components/WaveChart.tsx', code);
console.log('Fixed fibonacci');
