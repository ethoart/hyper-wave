const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const bullUserTarget = `                    if (userProgress >= 0.4 && ut.stopLoss < entry * 1.001) {
                         ut.stopLoss = entry * 1.002;
                         closeReason += ' Trailed SL up. ';
                         ut.save().catch(()=>{});
                     }`;

const bullUserRepl = `                    if (userProgress >= 0.6 && ut.stopLoss < entry + (target - entry) * 0.4) {
                         ut.stopLoss = entry + (target - entry) * 0.4;
                         closeReason += ' Trailed SL to +40% profit. ';
                         ut.save().catch(()=>{});
                     } else if (userProgress >= 0.3 && ut.stopLoss < entry * 1.005) {
                         ut.stopLoss = entry * 1.005;
                         closeReason += ' Trailed SL up safely. ';
                         ut.save().catch(()=>{});
                     }`;

code = code.replace(bullUserTarget, bullUserRepl);


const bearUserTarget = `                    if (userProgress >= 0.4 && ut.stopLoss > entry * 0.999) {
                         ut.stopLoss = entry * 0.998;
                         closeReason += ' Trailed SL down. ';
                         ut.save().catch(()=>{});
                     }`;

const bearUserRepl = `                    if (userProgress >= 0.6 && ut.stopLoss > entry - (entry - target) * 0.4) {
                         ut.stopLoss = entry - (entry - target) * 0.4;
                         closeReason += ' Trailed SL to +40% profit. ';
                         ut.save().catch(()=>{});
                     } else if (userProgress >= 0.3 && ut.stopLoss > entry * 0.995) {
                         ut.stopLoss = entry * 0.995;
                         closeReason += ' Trailed SL down safely. ';
                         ut.save().catch(()=>{});
                     }`;

code = code.replace(bearUserTarget, bearUserRepl);

fs.writeFileSync('server.ts', code, 'utf8');
