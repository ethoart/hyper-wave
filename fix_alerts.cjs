const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = `               if (entryDiff < 0.15 && projectedProfit >= 1.0) {
                 foundAlerts.push({
                   id: \`\${pair.symbol}_\${algoResult.trend}\`,
                   symbol: pair.symbol,
                   timestamp: Date.now(),
                   trend: algoResult.trend,
                   entry: algoResult.entry,
                   target: algoResult.target,
                   stopLoss: slPrice,
                   amount: recommendedAmount,
                   reasoning: algoResult.reasoning,
                   currentPrice: currentPrice,
                   projectedProfit
                 });`;

const repl1 = `               if (entryDiff < 0.15 && projectedProfit >= 1.0) {
                 algoResult.timeframe = scanInterval;
                 foundAlerts.push({
                   id: \`\${pair.symbol}_\${algoResult.trend}\`,
                   symbol: pair.symbol,
                   timestamp: Date.now(),
                   trend: algoResult.trend,
                   entry: algoResult.entry,
                   target: algoResult.target,
                   stopLoss: slPrice,
                   amount: recommendedAmount,
                   reasoning: algoResult.reasoning,
                   currentPrice: currentPrice,
                   projectedProfit,
                   termStyle: algoResult.termStyle,
                   setupData: algoResult
                 });`;

code = code.replace(target1, repl1);

const target2 = `                           setupData: { reasoning: alert.reasoning, params: alert }`;
const repl2 = `                           setupData: alert.setupData`;

code = code.replace(target2, repl2);

fs.writeFileSync('server.ts', code, 'utf8');
