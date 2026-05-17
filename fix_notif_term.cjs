const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const notifTarget = `\\n<b>Size ($):</b> \${tradeAmountDollars}`;
const notifRepl = `\\n<b>Style:</b> \${algoResult.termStyle}\\n<b>Size ($):</b> \${tradeAmountDollars}`;
code = code.replace(notifTarget, notifRepl);

fs.writeFileSync('server.ts', code, 'utf8');
