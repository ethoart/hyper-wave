const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const target1 = /let recommendedAmount = tradeAmountDollars;[\s\S]*?if \(rawLossUsdt > 6\.0\) \{[\s\S]*?\} else if \(rawLossUsdt < 2\.0\) \{[\s\S]*?\}[\s\S]*?if \(entryDiff < 0\.15 \&\& projectedProfit >= 5\.0\) \{/;

const repl1 = `let recommendedAmount = tradeAmountDollars;

               if (entryDiff < 0.15 && projectedProfit >= 1.0) {`;

code = code.replace(target1, repl1);

fs.writeFileSync('server.ts', code, 'utf8');
