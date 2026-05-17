const fs = require('fs');
let code = fs.readFileSync('ewEngine.ts', 'utf8');

// Bullish targets
code = code.replace(/const minTarget\s*=\s*suggestedEntry \* \(1 \+ 0\.03\);/g, "const minTarget = suggestedEntry * (1 + 0.10);");
code = code.replace(/const maxTarget\s*=\s*suggestedEntry \* \(1 \+ 0\.15\);/g, "const maxTarget = suggestedEntry * (1 + 0.20);");

// Bearish targets
code = code.replace(/const minTarget_b\s*=\s*suggestedEntry \* \(1 \- 0\.03\);/g, "const minTarget_b = suggestedEntry * (1 - 0.10);");
code = code.replace(/const maxTarget_b\s*=\s*suggestedEntry \* \(1 \- 0\.15\);/g, "const maxTarget_b = suggestedEntry * (1 - 0.20);");

// Bullish SL
code = code.replace(/const minSL_price\s*=\s*suggestedEntry \* \(1 \- 0\.05\);/g, "const minSL_price = suggestedEntry * (1 - 0.08);");
code = code.replace(/const maxSL_price\s*=\s*suggestedEntry \* \(1 \- 0\.02\);/g, "const maxSL_price = suggestedEntry * (1 - 0.03);");

// Bearish SL
code = code.replace(/const maxSL_price\s*=\s*suggestedEntry \* \(1 \+ 0\.05\);\s*\/\/ Max 5% climb \(costs \$5\)/g, "const maxSL_price = suggestedEntry * (1 + 0.08); // Max 8% climb");
code = code.replace(/const minSL_price\s*=\s*suggestedEntry \* \(1 \+ 0\.02\);\s*\/\/ Min 2% climb \(costs \$2\)/g, "const minSL_price = suggestedEntry * (1 + 0.03); // Min 3% climb");


code = code.replace(/let target = isBull \? entry \* 1\.05 : entry \* 0\.95;/g, "let target = isBull ? entry * 1.10 : entry * 0.90;");
code = code.replace(/const target = isBull \? entry \* 1\.05 : entry \* 0\.95;/g, "const target = isBull ? entry * 1.10 : entry * 0.90;");

// Increase score from 0 slightly for "fallback" setups or to make trades pass if there's a certain target required
// Wait, fallback has score: 0 so it's always available.
// The problem is `analyzeElliottWaves` returns `trend !== 'neutral'`. 
// It will always return something.

fs.writeFileSync('ewEngine.ts', code, 'utf8');
