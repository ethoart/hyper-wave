const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// For live user trades
const userTradesCheckTarget = `if (target && userProgress >= 0.8 && currentPnl > +1) {
                          outcome = 'win';
                          realizedPnl = (price - entry) / entry * ut.amount * 10;
                          closeReason += 'Auto-secured profit as price stalled near target.';
                      } else if (ut.stopLoss && price <= ut.stopLoss) {`;

const userTradesCheckRepl = `if (target && userProgress >= 0.8 && currentPnl > +1) {
                          outcome = 'win';
                          realizedPnl = (price - entry) / entry * ut.amount * 10;
                          closeReason += 'Auto-secured profit as price stalled near target.';
                      } else if (ut.termStyle === 'SHORT_TERM' && Date.now() - new Date(ut.timestamp).getTime() > 2 * 60 * 60 * 1000 && currentPnl > 0.5) {
                          outcome = 'win';
                          realizedPnl = (price - entry) / entry * ut.amount * 10;
                          closeReason += 'Closed short-term trade in profit due to time limit.';
                      } else if (ut.termStyle === 'SHORT_TERM' && Date.now() - new Date(ut.timestamp).getTime() > 4 * 60 * 60 * 1000) {
                          outcome = 'loss';
                          realizedPnl = (price - entry) / entry * ut.amount * 10;
                          closeReason += 'Closed short-term trade due to time expiration.';
                      } else if (ut.stopLoss && price <= ut.stopLoss) {`;

code = code.replace(userTradesCheckTarget, userTradesCheckRepl);


const userTradesCheckSellTarget = `if (target && userProgress >= 0.8 && currentPnl > +1) {
                          outcome = 'win';
                          realizedPnl = (entry - price) / entry * ut.amount * 10;
                          closeReason += 'Auto-secured profit as price stalled near target.';
                      } else if (ut.stopLoss && price >= ut.stopLoss) {`;

const userTradesCheckSellRepl = `if (target && userProgress >= 0.8 && currentPnl > +1) {
                          outcome = 'win';
                          realizedPnl = (entry - price) / entry * ut.amount * 10;
                          closeReason += 'Auto-secured profit as price stalled near target.';
                      } else if (ut.termStyle === 'SHORT_TERM' && Date.now() - new Date(ut.timestamp).getTime() > 2 * 60 * 60 * 1000 && currentPnl > 0.5) {
                          outcome = 'win';
                          realizedPnl = (entry - price) / entry * ut.amount * 10;
                          closeReason += 'Closed short-term trade in profit due to time limit.';
                      } else if (ut.termStyle === 'SHORT_TERM' && Date.now() - new Date(ut.timestamp).getTime() > 4 * 60 * 60 * 1000) {
                          outcome = 'loss';
                          realizedPnl = (entry - price) / entry * ut.amount * 10;
                          closeReason += 'Closed short-term trade due to time expiration.';
                      } else if (ut.stopLoss && price >= ut.stopLoss) {`;

code = code.replace(userTradesCheckSellTarget, userTradesCheckSellRepl);


// For TradeSignal active trailing logic.
const tradeSignalCheckTarget = `if (progress >= 0.8 && currentPnl > +1) {
                              outcome = 'win';
                              pnl = (price - signal.entry) / signal.entry * 100;
                              closeReason += 'Auto-secured profit as price stalled near target.';
                          } else if (price <= signal.stopLoss) {`;

const tradeSignalCheckRepl = `if (progress >= 0.8 && currentPnl > +1) {
                              outcome = 'win';
                              pnl = (price - signal.entry) / signal.entry * 100;
                              closeReason += 'Auto-secured profit as price stalled near target.';
                          } else if (signal.termStyle === 'SHORT_TERM' && Date.now() - new Date(signal.timestamp).getTime() > 2 * 60 * 60 * 1000 && currentPnl > +2) {
                              outcome = 'win';
                              pnl = (price - signal.entry) / signal.entry * 100;
                              closeReason += 'Auto-secured profit for short-term trade based on time expiration.';
                          } else if (signal.termStyle === 'SHORT_TERM' && Date.now() - new Date(signal.timestamp).getTime() > 4 * 60 * 60 * 1000) {
                              outcome = 'loss';
                              pnl = (price - signal.entry) / signal.entry * 100;
                              closeReason += 'Short-term trade expired (closed at market).';
                          } else if (price <= signal.stopLoss) {`;

code = code.replace(tradeSignalCheckTarget, tradeSignalCheckRepl);


const tradeSignalCheckBearTarget = `if (progress >= 0.8 && currentPnl > +1) {
                              outcome = 'win';
                              pnl = (signal.entry - price) / signal.entry * 100;
                              closeReason += 'Auto-secured profit as price stalled near target.';
                          } else if (price >= signal.stopLoss) {`;

const tradeSignalCheckBearRepl = `if (progress >= 0.8 && currentPnl > +1) {
                              outcome = 'win';
                              pnl = (signal.entry - price) / signal.entry * 100;
                              closeReason += 'Auto-secured profit as price stalled near target.';
                          } else if (signal.termStyle === 'SHORT_TERM' && Date.now() - new Date(signal.timestamp).getTime() > 2 * 60 * 60 * 1000 && currentPnl > +2) {
                              outcome = 'win';
                              pnl = (signal.entry - price) / signal.entry * 100;
                              closeReason += 'Auto-secured profit for short-term trade based on time expiration.';
                          } else if (signal.termStyle === 'SHORT_TERM' && Date.now() - new Date(signal.timestamp).getTime() > 4 * 60 * 60 * 1000) {
                              outcome = 'loss';
                              pnl = (signal.entry - price) / signal.entry * 100;
                              closeReason += 'Short-term trade expired (closed at market).';
                          } else if (price >= signal.stopLoss) {`;
                          
code = code.replace(tradeSignalCheckBearTarget, tradeSignalCheckBearRepl);

// Update notifications to include term style.
const notifTarget = `<br/><b>Size ($):</b> \${tradeAmountDollars}`;
const notifRepl = `<br/><b>Style:</b> \${algoResult.termStyle}<br/><b>Size ($):</b> \${tradeAmountDollars}`;
code = code.replace(notifTarget, notifRepl);

fs.writeFileSync('server.ts', code, 'utf8');
