const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const scanResultTarget = `                     if (entryDiff < 0.15 && projectedProfit >= 5.0) {
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

const scanResultRepl = `                     if (entryDiff < 0.15 && projectedProfit >= 5.0) {
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
                   termStyle: algoResult.termStyle
                 });`;

code = code.replace(scanResultTarget, scanResultRepl);


const autoCreateTarget = `                       const expiresAt = new Date(Date.now() + 5 * 60 * 60 * 1000);
                       await TradeSignal.create({
                           symbol: alert.symbol,
                           trend: alert.trend,
                           entry: alert.entry,
                           target: alert.target,
                           stopLoss: activeSl,
                           amount: finalAmount,
                           expiresAt,
                           setupData: { reasoning: alert.reasoning, params: alert }
                       });`;

const autoCreateRepl = `                       const expiresAt = new Date(Date.now() + (alert.termStyle === 'SHORT_TERM' ? 2 : 12) * 60 * 60 * 1000);
                       
                       const notifMessage = \`🚨 <b>HyperWave Signal</b> 🚨\\n\\n<b>Pair:</b> \${alert.symbol}\\n<b>Action:</b> \${alert.trend === 'bullish' ? 'LONG' : 'SHORT'}\\n<b>Style:</b> \${alert.termStyle}\\n<b>Entry:</b> \${alert.entry}\\n<b>Target:</b> \${alert.target}\\n<b>StopLoss:</b> \${activeSl}\\n<b>Size ($):</b> \${finalAmount}\\n\\n<b>Reasoning:</b>\\n\${alert.reasoning}\`;
                       await sendNotification(engineCfg, notifMessage);

                       await TradeSignal.create({
                           symbol: alert.symbol,
                           trend: alert.trend,
                           entry: alert.entry,
                           target: alert.target,
                           stopLoss: activeSl,
                           amount: finalAmount,
                           expiresAt,
                           termStyle: alert.termStyle,
                           setupData: { reasoning: alert.reasoning, params: alert }
                       });`;

code = code.replace(autoCreateTarget, autoCreateRepl);

fs.writeFileSync('server.ts', code, 'utf8');
