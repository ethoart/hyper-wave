const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Update tradeSignalSchema
code = code.replace(
  /amount: \{ type: Number, default: 10 \}, \/\/ Auto Paper Trade size: \$10/,
  `amount: { type: Number, default: 10 }, // Auto Paper Trade size: $10
  termStyle: String,`
);

// Update userTradeSchema
code = code.replace(
  /isAuto: \{ type: Boolean, default: false \},/,
  `isAuto: { type: Boolean, default: false },
  termStyle: String,`
);

// Update TradeSignal.create
code = code.replace(
  /expiresAt: new Date\(Date.now\(\) \+ 2 \* 60 \* 60 \* 1000\)/,
  `expiresAt: new Date(Date.now() + (algoResult.termStyle === 'SHORT_TERM' ? 2 : 12) * 60 * 60 * 1000),
                       termStyle: algoResult.termStyle`
);

// Update UserTrade.create
code = code.replace(
  /isAuto: true\n\s*\}\);/,
  `isAuto: true,
                                               termStyle: signal.termStyle
                                             });`
);


fs.writeFileSync('server.ts', code, 'utf8');
