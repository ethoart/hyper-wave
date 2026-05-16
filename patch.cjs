const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const target = `                 if (signal.binanceOrderId) {
                     if (signal.trend === 'bullish') {
                         let currentPnl = (price - signal.entry) / signal.entry * (signal.amount || 10) * 10;
                         if (currentPnl <= -10) {
                             outcome = 'loss';
                             pnl = -100 / 10; // -10% meaning 100% loss at 10x
                         } else if (price >= signal.target) {
                             outcome = 'win';
                             pnl = (signal.target - signal.entry) / signal.entry * 100;
                         } else if (price <= signal.stopLoss) {
                             outcome = 'loss';
                             pnl = (signal.stopLoss - signal.entry) / signal.entry * 100;
                         }
                     } else if (signal.trend === 'bearish') {
                         let currentPnl = (signal.entry - price) / signal.entry * (signal.amount || 10) * 10;
                         if (currentPnl <= -10) {
                             outcome = 'loss';
                             pnl = -100 / 10;
                         } else if (price <= signal.target) {
                             outcome = 'win';
                             pnl = (signal.entry - signal.target) / signal.entry * 100;
                         } else if (price >= signal.stopLoss) {
                             outcome = 'loss';
                             pnl = (signal.entry - signal.stopLoss) / signal.entry * 100;
                         }
                     }
                 }`;

const replacement = `                 if (signal.binanceOrderId) {
                     let progress = 0;
                     if (signal.trend === 'bullish') {
                         let currentPnl = (price - signal.entry) / signal.entry * (signal.amount || 10) * 10;
                         progress = (price - signal.entry) / (signal.target - signal.entry);
                         if (progress >= 0.4 && signal.stopLoss < signal.entry * 1.001) {
                             signal.stopLoss = signal.entry * 1.002;
                             signal.save().catch(()=>{});
                         }
                         if (currentPnl <= -10) {
                             outcome = 'loss';
                             pnl = -100 / 10; // -10% meaning 100% loss at 10x
                         } else if (price >= signal.target || (progress >= 0.8 && currentPnl > +2)) {
                             outcome = 'win';
                             pnl = (price - signal.entry) / signal.entry * 100;
                         } else if (price <= signal.stopLoss) {
                             outcome = price > signal.entry ? 'win' : 'loss';
                             pnl = (price - signal.entry) / signal.entry * 100;
                         }
                     } else if (signal.trend === 'bearish') {
                         let currentPnl = (signal.entry - price) / signal.entry * (signal.amount || 10) * 10;
                         progress = (signal.entry - price) / (signal.entry - signal.target);
                         if (progress >= 0.4 && signal.stopLoss > signal.entry * 0.999) {
                             signal.stopLoss = signal.entry * 0.998;
                             signal.save().catch(()=>{});
                         }
                         if (currentPnl <= -10) {
                             outcome = 'loss';
                             pnl = -100 / 10;
                         } else if (price <= signal.target || (progress >= 0.8 && currentPnl > +2)) {
                             outcome = 'win';
                             pnl = (signal.entry - price) / signal.entry * 100;
                         } else if (price >= signal.stopLoss) {
                             outcome = price < signal.entry ? 'win' : 'loss';
                             pnl = (signal.entry - price) / signal.entry * 100;
                         }
                     }
                 }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('server.ts', code, 'utf8');
    console.log("PATCHED auto trade");
} else {
    console.log("TARGET NOT FOUND auto trade");
}

let codeUser = code;
const targetUser = `                 if (ut.side === 'BUY') {
                     let currentPnl = (price - entry) / entry * ut.amount * 10;
                     if (currentPnl <= -10) {
                         outcome = 'loss';
                         realizedPnl = -10;
                     } else if (target && price >= target) {
                         outcome = 'win';
                         realizedPnl = (target - entry) / entry * ut.amount * 10;
                     } else if (ut.stopLoss && price <= ut.stopLoss) {
                         outcome = 'loss';
                         realizedPnl = (ut.stopLoss - entry) / entry * ut.amount * 10;
                     }
                 } else if (ut.side === 'SELL') {
                     let currentPnl = (entry - price) / entry * ut.amount * 10;
                     if (currentPnl <= -10) {
                         outcome = 'loss';
                         realizedPnl = -10;
                     } else if (target && price <= target) {
                         outcome = 'win';
                         realizedPnl = (entry - target) / entry * ut.amount * 10;
                     } else if (ut.stopLoss && price >= ut.stopLoss) {
                         outcome = 'loss';
                         realizedPnl = (entry - ut.stopLoss) / entry * ut.amount * 10;
                     }
                 }`;
                 
const replacementUser = `                 let userProgress = 0;
                 if (ut.side === 'BUY') {
                     let currentPnl = (price - entry) / entry * ut.amount * 10;
                     if (target) userProgress = (price - entry) / (target - entry);
                     
                     if (userProgress >= 0.4 && ut.stopLoss < entry * 1.001) {
                         ut.stopLoss = entry * 1.002;
                         ut.save().catch(()=>{});
                     }
                     
                     if (currentPnl <= -10) {
                         outcome = 'loss';
                         realizedPnl = -10;
                     } else if (target && (price >= target || (userProgress >= 0.8 && currentPnl > +1))) {
                         outcome = 'win';
                         realizedPnl = (price - entry) / entry * ut.amount * 10;
                     } else if (ut.stopLoss && price <= ut.stopLoss) {
                         outcome = price > entry ? 'win' : 'loss';
                         realizedPnl = (price - entry) / entry * ut.amount * 10;
                     }
                 } else if (ut.side === 'SELL') {
                     let currentPnl = (entry - price) / entry * ut.amount * 10;
                     if (target) userProgress = (entry - price) / (entry - target);
                     
                     if (userProgress >= 0.4 && ut.stopLoss > entry * 0.999) {
                         ut.stopLoss = entry * 0.998;
                         ut.save().catch(()=>{});
                     }
                     if (currentPnl <= -10) {
                         outcome = 'loss';
                         realizedPnl = -10;
                     } else if (target && (price <= target || (userProgress >= 0.8 && currentPnl > +1))) {
                         outcome = 'win';
                         realizedPnl = (entry - price) / entry * ut.amount * 10;
                     } else if (ut.stopLoss && price >= ut.stopLoss) {
                         outcome = price < entry ? 'win' : 'loss';
                         realizedPnl = (entry - price) / entry * ut.amount * 10;
                     }
                 }`;

if (codeUser.includes(targetUser)) {
    codeUser = codeUser.replace(targetUser, replacementUser);
    fs.writeFileSync('server.ts', codeUser, 'utf8');
    console.log("PATCHED user trade");
} else {
    console.log("TARGET NOT FOUND user trade");
}
