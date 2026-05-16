const fs = require('fs');
let code = fs.readFileSync('ewEngine.ts', 'utf8');

const t1 = 'reasoning: `[${tradeStyle} | BULLISH | PREDICTED GAIN: ${gainPct}%] Bullish Elliott Wave setup detected. Using dynamic AI parameters: Retrace2=${idealRetrace2.toFixed(3)}, Ext3=${idealExt3.toFixed(3)}, Retrace4=${idealRetrace4.toFixed(3)}. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1. Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1. Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.${rsiDivergence}`';
const r1 = 'reasoning: `[${tradeStyle} | BULLISH | PREDICTED GAIN: ${gainPct}%] Bullish Elliott Wave setup detected. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1, Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1, and Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.\\n\\nTARGET JUSTIFICATION: The target ($${finalTargetCopy.toFixed(4)}) is generated based on a Wave 5 mathematical extension to maximize the risk/reward ratio while securing optimal algorithmic probability.\\n\\nSTOP LOSS: Set at $${validStopLoss.toFixed(4)} strictly below the exhaustion support line (Wave 4 base) to instantly invalidate the setup and protect capital if the market flips bearish unexpectedly.\\n\\nAUTO SECURE: Algorithm continually monitors taking profit if it stalls near target.${rsiDivergence}`';

if(code.includes(t1)) code = code.replace(t1, r1);

const t2 = 'reasoning: `[${tradeStyle} | BEARISH | PREDICTED GAIN: ${gainPct}%] Bearish Elliott Wave setup detected. Using dynamic AI parameters: Retrace2=${idealRetrace2.toFixed(3)}, Ext3=${idealExt3.toFixed(3)}, Retrace4=${idealRetrace4.toFixed(3)}. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1. Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1. Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.${rsiDivergence}`';
const r2 = 'reasoning: `[${tradeStyle} | BEARISH | PREDICTED GAIN: ${gainPct}%] Bearish Elliott Wave setup detected. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1, Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1, and Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.\\n\\nTARGET JUSTIFICATION: The target ($${finalTargetCopy.toFixed(4)}) is based on the Wave 5 downward extension to maximize profit before typical support reversal.\\n\\nSTOP LOSS: Set at $${validStopLoss.toFixed(4)} just above the Wave 4 resistance. If price breaks this ceiling, the bearish structure is instantly invalidated and the trade is closed to protect capital.\\n\\nAUTO SECURE: Algorithm continually monitors taking profit if it stalls near target.${rsiDivergence}`';

if(code.includes(t2)) code = code.replace(t2, r2);

const t3 = "reasoning: `[${tradeStyle} | ${isBull ? 'BULLISH' : 'BEARISH'} | PREDICTED GAIN: ${gainPct}%] Simple structural trend analysis used instead of strict Elliott Waves. Price bounds generated.${rsiDivergence}`";
const r3 = "reasoning: `[${tradeStyle} | ${isBull ? 'BULLISH' : 'BEARISH'} | PREDICTED GAIN: ${gainPct}%] Statistical momentum continuation setup detected (Mean-Reversion Fallback).\\n\\nTARGET JUSTIFICATION: The algorithm targets $${target.toFixed(4)} to secure early profits before the momentum exhausts.\\n\\nSTOP LOSS: Capital protection placed at $${stop.toFixed(4)}. Evaluated strictly to cut losses early if market structure flips against the intended trend momentum.\\n\\nAUTO SECURE: Algorithm manages floating profits aggressively trailing stops.${rsiDivergence}`";

if(code.includes(t3)) code = code.replace(t3, r3);

const t4 = "reasoning: `[${tradeStyle} | ${isBull ? 'BULLISH' : 'BEARISH'} | PREDICTED GAIN: ${gainPct}%] Mean-reversion fallback applied due to lack of distinct market pivots. Drawing structural bounds based on momentum exhaustion.${rsiDivergence}`";
const r4 = "reasoning: `[${tradeStyle} | ${isBull ? 'BULLISH' : 'BEARISH'} | PREDICTED GAIN: ${gainPct}%] Statistical momentum continuation setup detected (Mean-Reversion Fallback).\\n\\nTARGET JUSTIFICATION: The algorithm targets $${target.toFixed(4)} to secure early profits before the momentum exhausts.\\n\\nSTOP LOSS: Capital protection placed at $${stop.toFixed(4)}. Evaluated strictly to cut losses early if market structure flips against the intended trend momentum.\\n\\nAUTO SECURE: Algorithm aggressively trails stops into profit.${rsiDivergence}`";

if(code.includes(t4)) code = code.replace(t4, r4);

fs.writeFileSync('ewEngine.ts', code, 'utf8');
