const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// replace "engineCfg.tradeAmountFixed || 15" with "10"
code = code.replace(/engineCfg\.tradeAmountFixed \|\| 15/g, 'engineCfg.tradeAmountFixed || 10');

// in server.ts line 106 it has tradeAmountFixed: { type: Number, default: 15 }
code = code.replace(/tradeAmountFixed: { type: Number, default: 15 }/g, 'tradeAmountFixed: { type: Number, default: 10 }');

fs.writeFileSync('server.ts', code, 'utf8');
