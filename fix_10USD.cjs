const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `               let recommendedAmount = tradeAmountDollars;
               if (rawLossUsdt > 6.0) {
                     recommendedAmount = (6.0 / rawLossUsdt) * tradeAmountDollars;
                } else if (rawLossUsdt < 2.0) {
                     recommendedAmount = Math.min((2.0 / rawLossUsdt) * tradeAmountDollars, 40);
                }

                if (entryDiff < 0.15 && projectedProfit >= 5.0) {`;

const repl1 = `               let recommendedAmount = tradeAmountDollars;

                if (entryDiff < 0.15 && projectedProfit >= 1.0) {`;

code = code.replace(target1, repl1);


const target2 = `                       let finalAmount = tradeAmountDollars;
                       if (activeRawLoss > 4.5) {
                           finalAmount = (4.5 / activeRawLoss) * tradeAmountDollars;
                       } else if (activeRawLoss < 1.0) {
                           finalAmount = Math.min((1.0 / activeRawLoss) * tradeAmountDollars, 20);
                       }
                       activePosSize = finalAmount * leverage;`;
                       
const repl2 = `                       let finalAmount = tradeAmountDollars;
                       activePosSize = finalAmount * leverage;`;

code = code.replace(target2, repl2);

fs.writeFileSync('server.ts', code, 'utf8');
