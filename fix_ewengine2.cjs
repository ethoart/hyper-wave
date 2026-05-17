const fs = require('fs');

let code = fs.readFileSync('ewEngine.ts', 'utf8');

code = code.replace(
  /const tradeStyle = getTradeStyle\(interval\);/,
  `const tradeStyle = getTradeStyle(interval);
  const termStyle = ['1m', '3m', '5m', '15m'].includes(interval) ? 'SHORT_TERM' : 'LONG_TERM';`
);

code = code.replace(
  /tradeStyle,\n\s*gainPct,/g,
  `tradeStyle,
      termStyle,
      gainPct,`
);

fs.writeFileSync('ewEngine.ts', code, 'utf8');
