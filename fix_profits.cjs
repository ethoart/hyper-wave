const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/if \(rawLossUsdt \> 4\.5\) \{[\s\S]*?if \(entryDiff \< 0\.15 \&\& projectedProfit \>\= 0\.1\) \{/, 
`if (rawLossUsdt > 6.0) {
                    recommendedAmount = (6.0 / rawLossUsdt) * tradeAmountDollars;
               } else if (rawLossUsdt < 2.0) {
                    recommendedAmount = Math.min((2.0 / rawLossUsdt) * tradeAmountDollars, 40);
               }

               if (entryDiff < 0.15 && projectedProfit >= 5.0) {`);

fs.writeFileSync('server.ts', code, 'utf8');
