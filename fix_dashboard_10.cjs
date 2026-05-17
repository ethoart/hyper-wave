const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

code = code.replace(/adminConfig\.tradeAmountFixed \|\| 15/g, "adminConfig.tradeAmountFixed || 10");

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
