const fs = require('fs');
let code = fs.readFileSync('ewEngine.ts', 'utf8');

// 1. Fallbacks (Bullish) around line 173
code = code.replace(/let target = isBull \? entry \* 1\.10 : entry \* 0\.90;/, "let target = isBull ? entry * 1.03 : entry * 0.97;");
code = code.replace(/let stop = isBull \? entry \* 0\.97 : entry \* 1\.03; \/\/ Simple 3% risk/, "let stop = isBull ? entry * 0.985 : entry * 1.015; // Simple 1.5% risk");

// 2. Bullish Elliott Wave around line 279
const ewBullishSLTarget = `        const minSL_price = suggestedEntry * (1 - 0.08); // Max 5% drop
        const maxSL_price = suggestedEntry * (1 - 0.03); // Min 2% drop`;
const ewBullishSLRepl = `        const minSL_price = suggestedEntry * (1 - 0.04); // Max 4% drop
        const maxSL_price = suggestedEntry * (1 - 0.015); // Min 1.5% drop`;
code = code.replace(ewBullishSLTarget, ewBullishSLRepl);

const ewBullishTgtTarget = `        const minTarget = suggestedEntry * (1 + 0.10); // Min 3% move
        const maxTarget = suggestedEntry * (1 + 0.20); // Max 15% move`;
const ewBullishTgtRepl = `        const minTarget = suggestedEntry * (1 + 0.02); // Min 2% move
        const maxTarget = suggestedEntry * (1 + 0.06); // Max 6% move`;
code = code.replace(ewBullishTgtTarget, ewBullishTgtRepl);

// 3. Bearish Elliott Wave around line 393
const ewBearishSLTarget = `        const maxSL_price = suggestedEntry * (1 + 0.08); // Max 8% climb
        const minSL_price = suggestedEntry * (1 + 0.03); // Min 3% climb`;
const ewBearishSLRepl = `        const maxSL_price = suggestedEntry * (1 + 0.04); // Max 4% climb
        const minSL_price = suggestedEntry * (1 + 0.015); // Min 1.5% climb`;
code = code.replace(ewBearishSLTarget, ewBearishSLRepl);

const ewBearishTgtTarget = `        const minTarget_b = suggestedEntry * (1 - 0.10); // Min 3% drop
        const maxTarget_b = suggestedEntry * (1 - 0.20); // Max 15% drop`;
const ewBearishTgtRepl = `        const minTarget_b = suggestedEntry * (1 - 0.02); // Min 2% drop
        const maxTarget_b = suggestedEntry * (1 - 0.06); // Max 6% drop`;
code = code.replace(ewBearishTgtTarget, ewBearishTgtRepl);

// 4. Fallbacks (Bullish) around line 450
code = code.replace(/const target = isBull \? entry \* 1\.10 : entry \* 0\.90;/, "const target = isBull ? entry * 1.03 : entry * 0.97;");

// Update the stop loss bounds checking text to be accurate or simply rewrite the bounding block if needed... no need, just regex will do if it matches.
fs.writeFileSync('ewEngine.ts', code, 'utf8');
