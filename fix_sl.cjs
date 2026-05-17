const fs = require('fs');
let code = fs.readFileSync('ewEngine.ts', 'utf8');

const bullSLTarget = `        let validStopLoss = w1;
        if (validStopLoss >= w4) {
           validStopLoss = w2; // Fallback to w2 if w1 overlaps w4
        }`;

const bullSLRepl = `        let validStopLoss = w4 * 0.99; // Much tighter SL: 1% below Wave 4 base`;

code = code.replace(bullSLTarget, bullSLRepl);


const bearSLTarget = `        let validStopLoss = w1;
        if (validStopLoss <= w4) {
           validStopLoss = w2; // Fallback to w2 if w1 overlaps w4
        }`;
        
const bearSLRepl = `        let validStopLoss = w4 * 1.01; // Much tighter SL: 1% above Wave 4 peak`;

code = code.replace(bearSLTarget, bearSLRepl);

fs.writeFileSync('ewEngine.ts', code, 'utf8');
