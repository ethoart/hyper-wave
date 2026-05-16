const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

// We simply replace lines 1426 to 1437
const lines = content.split('\n');
const replacementBullish = `                     if (signal.trend === 'bullish') {
                         let currentPnl = (price - signal.entry) / signal.entry * (signal.amount || 10) * 10;
                         let progress = (price - signal.entry) / (signal.target - signal.entry);
                         if (progress >= 0.4 && signal.stopLoss < signal.entry * 1.001) {
                             signal.stopLoss = signal.entry * 1.002;
                             signal.save().catch(()=>{});
                         }
                         if (currentPnl <= -10) {
                             outcome = 'loss';
                             pnl = -100 / 10; // -10% meaning 100% loss at 10x
                         } else if (price >= signal.target || (progress >= 0.8 && currentPnl > +1)) {
                             outcome = 'win';
                             pnl = (price - signal.entry) / signal.entry * 100;
                         } else if (price <= signal.stopLoss) {
                             outcome = price > signal.entry ? 'win' : 'loss';
                             pnl = (price - signal.entry) / signal.entry * 100;
                         }`.split('\n');

const replacementBearish = `                     } else if (signal.trend === 'bearish') {
                         let currentPnl = (signal.entry - price) / signal.entry * (signal.amount || 10) * 10;
                         let progress = (signal.entry - price) / (signal.entry - signal.target);
                         if (progress >= 0.4 && signal.stopLoss > signal.entry * 0.999) {
                             signal.stopLoss = signal.entry * 0.998;
                             signal.save().catch(()=>{});
                         }
                         if (currentPnl <= -10) {
                             outcome = 'loss';
                             pnl = -100 / 10;
                         } else if (price <= signal.target || (progress >= 0.8 && currentPnl > +1)) {
                             outcome = 'win';
                             pnl = (signal.entry - price) / signal.entry * 100;
                         } else if (price >= signal.stopLoss) {
                             outcome = price < signal.entry ? 'win' : 'loss';
                             pnl = (signal.entry - price) / signal.entry * 100;
                         }`.split('\n');

lines.splice(1426 - 1, 12, ...replacementBullish); // 1426 to 1437 is 12 lines
lines.splice(1438 - 1 + (replacementBullish.length - 12), 12, ...replacementBearish);

fs.writeFileSync('server.ts', lines.join('\n'));
console.log("Patched server.ts using line numbers");
