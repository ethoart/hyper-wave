const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const bullTarget = `                         let progress = (price - signal.entry) / (signal.target - signal.entry);
                         if (progress >= 0.4 && signal.stopLoss < signal.entry * 1.001) {
                             signal.stopLoss = signal.entry * 1.002;
                             closeReason += ' Trailed SL up. ';
                             signal.save().catch(()=>{});
                         }`;

const bullRepl = `                         let progress = (price - signal.entry) / (signal.target - signal.entry);
                         if (progress >= 0.6 && signal.stopLoss < signal.entry + (signal.target - signal.entry) * 0.4) {
                             signal.stopLoss = signal.entry + (signal.target - signal.entry) * 0.4;
                             closeReason += ' Trailed SL to +40% profit. ';
                             signal.save().catch(()=>{});
                         } else if (progress >= 0.3 && signal.stopLoss < signal.entry * 1.005) {
                             signal.stopLoss = signal.entry * 1.005;
                             closeReason += ' Trailed SL up safely. ';
                             signal.save().catch(()=>{});
                         }`;
code = code.replace(bullTarget, bullRepl);


const bearTarget = `                         let progress = (signal.entry - price) / (signal.entry - signal.target);
                         if (progress >= 0.4 && signal.stopLoss > signal.entry * 0.999) {
                             signal.stopLoss = signal.entry * 0.998;
                             closeReason += ' Trailed SL down. ';
                             signal.save().catch(()=>{});
                         }`;

const bearRepl = `                         let progress = (signal.entry - price) / (signal.entry - signal.target);
                         if (progress >= 0.6 && signal.stopLoss > signal.entry - (signal.entry - signal.target) * 0.4) {
                             signal.stopLoss = signal.entry - (signal.entry - signal.target) * 0.4;
                             closeReason += ' Trailed SL to +40% profit. ';
                             signal.save().catch(()=>{});
                         } else if (progress >= 0.3 && signal.stopLoss > signal.entry * 0.995) {
                             signal.stopLoss = signal.entry * 0.995;
                             closeReason += ' Trailed SL down safely. ';
                             signal.save().catch(()=>{});
                         }`;

code = code.replace(bearTarget, bearRepl);


// We also must do it in the user trades loop!
// lines 1022 area (outcome evaluator for UserTrade) might exist? No, the user trade check is below...
fs.writeFileSync('server.ts', code, 'utf8');
