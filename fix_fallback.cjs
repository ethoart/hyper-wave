const fs = require('fs');

let ewCode = fs.readFileSync('ewEngine.ts', 'utf8');

ewCode = ewCode.replace(
  /const gainPct = \(Math\.abs\(target - entry\) \/ entry \* 100\)\.toFixed\(2\);\n\n    return \{\n      score: 0,\n      trend: isBull \? 'bullish' : 'bearish',/g,
  "const gainPct = (Math.abs(target - entry) / entry * 100).toFixed(2);\n\n    return {\n      leverage: 10,\n      score: 0,\n      trend: isBull ? 'bullish' : 'bearish',"
);

fs.writeFileSync('ewEngine.ts', ewCode, 'utf8');
