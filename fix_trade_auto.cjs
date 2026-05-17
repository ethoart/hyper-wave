const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const autoRouteTarget = `         await TradeSignal.create({
             symbol,
             trend,
             entry,
             target,
             stopLoss: slPrice,
             amount: tradeAmountDollars,
             setupData,
             expiresAt
         });
      }
      res.json({ success: true, message: "Trade signal queued. Waiting for entry." });`;

const autoRouteRepl = `         
         const termStyle = setupData?.termStyle || 'LONG_TERM';
         
         const engineCfg = await EngineConfig.findOne({ id: 'global' });
         const notifMessage = \`🚨 <b>HyperWave Signal</b> 🚨\\n\\n<b>Pair:</b> \${symbol}\\n<b>Action:</b> \${trend === 'bullish' ? 'LONG' : 'SHORT'}\\n<b>Style:</b> \${termStyle}\\n<b>Entry:</b> \${entry}\\n<b>Target:</b> \${target}\\n<b>StopLoss:</b> \${slPrice}\\n<b>Size ($):</b> \${tradeAmountDollars}\\n\\n<b>Reasoning:</b>\\n\${setupData?.reasoning}\`;
         await sendNotification(engineCfg, notifMessage);

         await TradeSignal.create({
             symbol,
             trend,
             entry,
             target,
             stopLoss: slPrice,
             amount: tradeAmountDollars,
             setupData,
             expiresAt,
             termStyle
         });
      }
      res.json({ success: true, message: "Trade signal queued. Waiting for entry." });`;

code = code.replace(autoRouteTarget, autoRouteRepl);

fs.writeFileSync('server.ts', code, 'utf8');
