const fs = require('fs');

// Patch ewEngine.ts
let ewCode = fs.readFileSync('ewEngine.ts', 'utf8');

// Bullish Setup
ewCode = ewCode.replace(
  /bestSetup = \{\n              score,\n              trend: 'bullish',/,
  "const recLeverage = Math.floor(Math.max(3, Math.min(50, (score / 100) * 50)));\n            bestSetup = {\n              leverage: recLeverage,\n              score,\n              trend: 'bullish',"
);

// Bearish Setup
ewCode = ewCode.replace(
  /bestSetup = \{\n              score,\n              trend: 'bearish',/,
  "const recLeverage = Math.floor(Math.max(3, Math.min(50, (score / 100) * 50)));\n            bestSetup = {\n              leverage: recLeverage,\n              score,\n              trend: 'bearish',"
);

// Fallback Setup
ewCode = ewCode.replace(
  /const tradeStyle = getTradeStyle\(interval\);\n      const termStyle = \['1m', '3m', '5m', '15m'\].includes\(interval\) \? 'SHORT_TERM' : 'LONG_TERM';\n      const gainPct = \(Math\.abs\(target - entry\) \/ entry \* 100\)\.toFixed\(2\);/,
  "const tradeStyle = getTradeStyle(interval);\n      const termStyle = ['1m', '3m', '5m', '15m'].includes(interval) ? 'SHORT_TERM' : 'LONG_TERM';\n      const gainPct = (Math.abs(target - entry) / entry * 100).toFixed(2);\n      const recLeverage = 10;"
);

ewCode = ewCode.replace(
  /bestSetup = \{\n      trend: isBull \? 'bullish' : 'bearish',/,
  "bestSetup = {\n      leverage: recLeverage,\n      trend: isBull ? 'bullish' : 'bearish',"
);

fs.writeFileSync('ewEngine.ts', ewCode, 'utf8');

// Patch server.ts
let srvCode = fs.readFileSync('server.ts', 'utf8');

srvCode = srvCode.replace(
    /const leverage = 10; \/\/ Use 10x leverage for calculations/g,
    "const leverage = setupData?.leverage || 10; // Dynamic leverage"
);

// At line ~1180 (market buy manual? wait, "result.amount")
srvCode = srvCode.replace(
    /const leverage = 10;\n                         const currentPrice = parseFloat\(pair.lastPrice\);/g,
    "const leverage = result.leverage || 10;\n                         const currentPrice = parseFloat(pair.lastPrice);"
);

// At line 1332
srvCode = srvCode.replace(
    /const tradeAmountDollars = engineCfg\.tradeAmountFixed \|\| 10;\n                       const leverage = 10;/g,
    "const tradeAmountDollars = engineCfg.tradeAmountFixed || 10;\n                       const leverage = alert.setupData && alert.setupData.leverage ? alert.setupData.leverage : 10;"
);

// At line 1408
srvCode = srvCode.replace(
    /const tradeAmountDollars = signal\.amount \|\| 10;\n                                 const leverage = 10;/g,
    "const tradeAmountDollars = signal.amount || 10;\n                                 const leverage = signal.setupData && signal.setupData.leverage ? signal.setupData.leverage : 10;"
);

// At line 1550
srvCode = srvCode.replace(
    /signal\.pnlPercent = pnl;\n                    const leverage = 10;\n                    signal\.realizedPnl = \(signal\.amount \|\| 10\) \* leverage \* \(pnl \/ 100\);/g,
    "signal.pnlPercent = pnl;\n                    const leverage = signal.setupData && signal.setupData.leverage ? signal.setupData.leverage : 10;\n                    signal.realizedPnl = (signal.amount || 10) * leverage * (pnl / 100);"
);

fs.writeFileSync('server.ts', srvCode, 'utf8');
