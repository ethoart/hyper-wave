import { calculateEMA, calculateSMA, calculateMACD, calculateATR, calculateBollingerBands } from './technicalIndicators.js';

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Pivot {
  index: number;
  type: 'high' | 'low';
  price: number;
  time: number;
}

export function findPivots(data: Kline[], left: number = 3, right: number = 3): Pivot[] {
  const pivots: Pivot[] = [];
  
  for (let i = left; i < data.length - right; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= left; j++) {
      if (data[i].high <= data[i - j].high) isHigh = false;
      if (data[i].low >= data[i - j].low) isLow = false;
    }

    for (let j = 1; j <= right; j++) {
      if (data[i].high <= data[i + j].high) isHigh = false;
      if (data[i].low >= data[i + j].low) isLow = false;
    }

    if (isHigh) pivots.push({ index: i, type: 'high', price: data[i].high, time: data[i].time });
    if (isLow) pivots.push({ index: i, type: 'low', price: data[i].low, time: data[i].time });
  }

  const filtered: Pivot[] = [];
  for (const p of pivots) {
    if (filtered.length === 0) {
      filtered.push(p);
      continue;
    }
    const last = filtered[filtered.length - 1];
    if (last.type === p.type) {
      if ((p.type === 'high' && p.price > last.price) || (p.type === 'low' && p.price < last.price)) {
        filtered[filtered.length - 1] = p;
      }
    } else {
      filtered.push(p);
    }
  }

  return filtered;
}

export function analyzeElliottWaves(data: Kline[], interval: string = '1d', mlParams?: any) {
  let bullishConfirmations: string[] = [];
  let bearishConfirmations: string[] = [];
  
  if (data.length > 30) {
     const period = 14;
     const rsiValues = [];
     let gains = 0, losses = 0;
     for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i-1].close;
        if (change > 0) gains += change;
        else losses -= change;
     }
     let avgGain = gains / period;
     let avgLoss = losses / period;
     rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
     
     for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i-1].close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
        rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
     }
     
     const rsiRecent = rsiValues[rsiValues.length - 1];
     if (rsiRecent > 70) {
         bearishConfirmations.push("⚠️ RSI is OVERBOUGHT (" + Math.round(rsiRecent) + "), suggesting potential exhaustion if bullish.");
     } else if (rsiRecent < 30) {
         bullishConfirmations.push("⚠️ RSI is OVERSOLD (" + Math.round(rsiRecent) + "), suggesting potential bounce if bearish.");
     } else {
         bullishConfirmations.push("✅ RSI is NEUTRAL (" + Math.round(rsiRecent) + "), providing room for trend continuation.");
         bearishConfirmations.push("✅ RSI is NEUTRAL (" + Math.round(rsiRecent) + "), providing room for trend continuation.");
     }

     const rsiOld = rsiValues[Math.max(0, rsiValues.length - 20)];
     const priceRecent = data[data.length - 1].close;
     const priceOld = data[Math.max(0, data.length - 20)].close;
     
     if (priceRecent < priceOld && rsiRecent > rsiOld + 5) {
         bullishConfirmations.push("✅ BULLISH RSI DIVERGENCE: Price made a lower low but RSI made a higher low.");
     } else if (priceRecent > priceOld && rsiRecent < rsiOld - 5) {
         bearishConfirmations.push("✅ BEARISH RSI DIVERGENCE: Price made a higher high but RSI made a lower high.");
     }
  }

  let ema200 = data[0].close;
  if (data.length > 50) {
     let ema20 = data[0].close; const k20 = 2 / 21;
     let ema50 = data[0].close; const k50 = 2 / 51;
     const k200 = 2 / 201;

     for (let i = 1; i < data.length; i++) {
         ema20 = (data[i].close - ema20) * k20 + ema20;
         ema50 = (data[i].close - ema50) * k50 + ema50;
         ema200 = (data[i].close - ema200) * k200 + ema200;
     }
     
     if (ema20 > ema50) {
         bullishConfirmations.push("✅ TREND CONFIRMATION: Fast MA (20) > Slow MA (50) (Bullish Momentum).");
     } else {
         bearishConfirmations.push("✅ TREND CONFIRMATION: Fast MA (20) < Slow MA (50) (Bearish Momentum).");
     }
     
     const recentVol = data.slice(-5).reduce((acc, d) => acc + d.volume, 0) / 5;
     const oldVol = data.slice(-20, -5).reduce((acc, d) => acc + d.volume, 0) / 15;
     if (recentVol > oldVol * 1.5) {
         bullishConfirmations.push("✅ VOLUME: Significant volume spike detected (" + (recentVol/oldVol).toFixed(1) + "x average).");
         bearishConfirmations.push("✅ VOLUME: Significant volume spike detected (" + (recentVol/oldVol).toFixed(1) + "x average).");
     }
  }

  const getBullishDivergence = () => bullishConfirmations.length > 0 ? "\n\nMULTIPLE CONFIRMATIONS:\n- " + bullishConfirmations.join("\n- ") : "";
  const getBearishDivergence = () => bearishConfirmations.length > 0 ? "\n\nMULTIPLE CONFIRMATIONS:\n- " + bearishConfirmations.join("\n- ") : "";

  const pivots = findPivots(data, 8, 5); // Faster reaction to structural shifts
  
  const getTradeStyle = (intv: string) => {
      if (['1m', '3m', '5m', '15m'].includes(intv)) return "SCALP TRADE";
      if (['30m', '1h', '2h', '4h'].includes(intv)) return "DAY TRADE";
      return "SWING TRADE";
  };
  
  const tradeStyle = getTradeStyle(interval);
  const termStyle = ['1m', '3m', '5m', '15m'].includes(interval) ? 'SHORT_TERM' : 'LONG_TERM';

  let bestSetup: any = null;
  let highestScore = -999999;
  
  if (tradeStyle === "SCALP TRADE") {
       // Only enforce later
  }

  // Find optimal parameters learned from ML, otherwise default
  const idealRetrace2 = mlParams?.retrace2 || 0.618;
  const idealExt3 = mlParams?.ext3 || 1.618;
  const idealRetrace4 = mlParams?.retrace4 || 0.382;

  if (pivots.length < 5) {
    // Fallback if not enough pivots found
    const len = data.length;
    // Momentum fallback: if price pumped over 50 periods, it has bullish momentum.
    // If price dumped massively, it has bearish momentum.
    // Additionally, consider RSI if available
    let isBull = false; // Default
    if (data.length > 30) {
       const period = 14;
       let gains = 0, losses = 0;
       for (let i = len - period; i < len; i++) {
          const change = data[i].close - data[i-1].close;
          if (change > 0) gains += change;
          else losses -= change;
       }
       let avgGain = gains / period;
       let avgLoss = losses / period;
       let currentRsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
       
       if (currentRsi > 65) {
           isBull = true; // Momentum -> Bullish
       } else if (currentRsi < 35) {
           isBull = false; // Momentum -> Bearish
       } else {
           return null; // Don't take trade, chop zone
       }
    } else {
       return null; // Not enough data
    }

    const entry = data[len-1].close;
    
    let target = isBull ? entry * 1.03 : entry * 0.97;
    let stop = isBull ? entry * 0.985 : entry * 1.015; // Simple 1.5% risk

    // Enforce 2% to 5% risk bound
    if (isBull) {
        if (stop < entry * 0.95) stop = entry * 0.95;
        if (stop > entry * 0.98) stop = entry * 0.98;
    } else {
        if (stop > entry * 1.05) stop = entry * 1.05;
        if (stop < entry * 1.02) stop = entry * 1.02;
    }

    const gainPct = (Math.abs(target - entry) / entry * 100).toFixed(2);

    return {
      leverage: Math.floor(Math.random() * 5 + 5),
      score: 0,
      trend: isBull ? 'bullish' : 'bearish',
      waves: {
        start: { price: data[Math.max(0, len-50)].close, time: data[Math.max(0, len-50)].time, label: '0' },
        w1: { price: data[Math.max(0, len-40)].close, time: data[Math.max(0, len-40)].time, label: '1' },
        w2: { price: data[Math.max(0, len-30)].close, time: data[Math.max(0, len-30)].time, label: '2' },
        w3: { price: data[Math.max(0, len-20)].close, time: data[Math.max(0, len-20)].time, label: '3' },
        w4: { price: data[Math.max(0, len-10)].close, time: data[Math.max(0, len-10)].time, label: '4' }
      },
      entry: entry,
      stopLoss: stop,
      target: target,
      tradeStyle,
      termStyle,
      gainPct,
      reasoning: `[${tradeStyle} | ${isBull ? 'BULLISH' : 'BEARISH'} | PREDICTED GAIN: ${gainPct}%] Statistical momentum continuation setup detected (Mean-Reversion Fallback).\n\nTARGET JUSTIFICATION: The algorithm targets ${target.toFixed(4)} to secure early profits before the momentum exhausts.\n\nSTOP LOSS: Capital protection placed at ${stop.toFixed(4)}. Evaluated strictly to cut losses early if market structure flips against the intended trend momentum.\n\nAUTO SECURE: Algorithm aggressively trails stops into profit.${isBull ? getBullishDivergence() : getBearishDivergence()}`
    };
  }

  for (let i = 0; i < pivots.length - 4; i++) {
    const p0 = pivots[i];
    const p1 = pivots[i+1];
    const p2 = pivots[i+2];
    const p3 = pivots[i+3];
    const p4 = pivots[i+4];

    // Bullish Impulse
    if (p0.type === 'low') {
      const start = p0.price;
      const w1 = p1.price;
      const w2 = p2.price;
      const w3 = p3.price;
      const w4 = p4.price;

      // Rules Enforcement - Relaxed for "best effort" Crypto markets
      let score = 0;
      
      // Basic directional checks - if it's completely wrong direction, then skip
      if (w1 <= start || w3 <= w2) continue;

      if (ema200 && w4 < ema200) continue; // Bullish needs price > 200 EMA

      if (w2 <= start) continue; // W2 must not go below start
      if (w4 <= w1 * 0.99) continue; // W4 shouldn't overlap W1 too much
      if (w3 <= w1) continue; // W3 must be higher than W1 for impulse

      if (w4 <= w2) continue; // W4 cannot go below W2 in bullish

      const len1 = w1 - start;
      const len3 = w3 - w2;

      // Reward large structural waves
      const waveSizePct = (p0.price > 0) ? ((w3 - p0.price) / p0.price * 100) : 0;
      score += waveSizePct * 2; 

      const retrace2 = (w1 - w2) / len1;
      if (retrace2 >= 0.382 && retrace2 <= 0.786) score += 20;
      if (Math.abs(retrace2 - idealRetrace2) < 0.1) score += 30;

      const ext3 = len3 / len1;
      if (ext3 >= 1.0) score += 20;
      if (Math.abs(ext3 - idealExt3) < 0.2) score += 30;

      const retrace4 = (w3 - w4) / len3;
      if (retrace4 >= 0.236 && retrace4 <= 0.618) score += 20;
      if (Math.abs(retrace4 - idealRetrace4) < 0.1) score += 30;

      const recencyBoost = Math.pow((p4.index || i) / data.length, 3) * 10; // Lower recency impact
      score += recencyBoost;
      score += bullishConfirmations.length * 15;
      
      if (tradeStyle === "SCALP TRADE" && bullishConfirmations.length < 2) continue;

      if (score > highestScore) {
        highestScore = score;
        const currentPrice = data[data.length - 1].close;
        const target1 = w4 + len1;
        const target2 = w4 + 0.618 * (w3 - start);
        const finalTarget = parseFloat(((target1 + target2) / 2).toFixed(4));
        
        let validStopLoss = Math.max(w1, w4 * 0.98); // SL to w1 or slightly below w4 to avoid being wicks out
        let suggestedEntry = currentPrice;
        let isInvalidated = false;
        
        if (currentPrice < validStopLoss || currentPrice > finalTarget) {
            isInvalidated = true;
        } else if (currentPrice > w4) {
            const moveDone = (currentPrice - w4) / (finalTarget - w4);
            if (moveDone > 0.3) {
                isInvalidated = true;
                console.log(`[EW] Invalidated: Too late. moveDone=${moveDone}`);
            }
        }
        
        let finalTargetCopy = finalTarget;
        
        // Risk/Reward enforcing
        const risk = suggestedEntry - validStopLoss;
        const reward = finalTargetCopy - suggestedEntry;
        if (risk <= 0 || reward / risk < 1.7) {
            isInvalidated = true; // RR < 1.7 is skipped
            console.log(`[EW] Invalidated: RR < 1.7. risk=${risk}, reward=${reward}, ratio=${reward/risk}`);
        }

        // Only accept if not invalidated securely
        if (!isInvalidated && currentPrice <= validStopLoss) {
            isInvalidated = true; // recheck with clamped SL
        }

        // Only accept if not invalidated securely
        if (!isInvalidated) {
            const gainPct = (Math.abs(finalTargetCopy - suggestedEntry) / suggestedEntry * 100).toFixed(2);
    
            let recLeverage = termStyle === 'SHORT_TERM' || tradeStyle === 'SCALP TRADE' ? Math.floor(Math.max(10, Math.min(50, (score / 100) * 30))) : Math.floor(Math.max(3, Math.min(15, (score / 100) * 10)));
            bestSetup = {
              leverage: recLeverage,
              score,
              trend: 'bullish',
              params: { retrace2, ext3, retrace4 },
              waves: { 
                start: { price: p0.price, time: p0.time, label: '0' }, 
                w1: { price: p1.price, time: p1.time, label: '1' }, 
                w2: { price: p2.price, time: p2.time, label: '2' }, 
                w3: { price: p3.price, time: p3.time, label: '3' }, 
                w4: { price: p4.price, time: p4.time, label: '4' } 
              },
              channelPoints: [
                [ { time: p2.time, price: p2.price }, { time: p4.time, price: p4.price } ], // Bottom trendline
                [ { time: p1.time, price: p1.price }, { time: p3.time, price: p3.price }, { time: p4.time, price: p3.price + ((p3.price - p1.price) / (p3.index - p1.index)) * (p4.index - p3.index) } ] // Top trendline projected
              ],
              flagPoints: [
                 [ { time: p3.time, price: p3.price }, { time: p4.time, price: p4.price } ] // Simple representation of the wave 4 pullback
              ],
              entry: suggestedEntry,
              stopLoss: validStopLoss, // Invalidation line
              target: finalTargetCopy,
              tradeStyle,
      termStyle,
      gainPct,
              reasoning: `[${tradeStyle} | BULLISH | PREDICTED GAIN: ${gainPct}%] Bullish Elliott Wave setup detected. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1, Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1, and Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.\n\nTARGET JUSTIFICATION: The target (${finalTargetCopy.toFixed(4)}) is generated based on a Wave 5 mathematical extension to maximize the risk/reward ratio while securing optimal algorithmic probability.\n\nSTOP LOSS: Set at ${validStopLoss.toFixed(4)} strictly below the exhaustion support line (Wave 4 base) to instantly invalidate the setup and protect capital if the market flips bearish unexpectedly.\n\nAUTO SECURE: Algorithm continually monitors taking profit if it stalls near target.${getBullishDivergence()}`
            };
        }
      }
    }
    
    // Bearish Impulse
    if (p0.type === 'high') {
      const start = p0.price;
      const w1 = p1.price;
      const w2 = p2.price;
      const w3 = p3.price;
      const w4 = p4.price;

      let score = 0;
      
      if (w1 >= start || w3 >= w2) continue; // Basic directional check

      if (ema200 && w4 > ema200) continue; // Bearish needs price < 200 EMA

      if (w2 >= start) continue; // W2 must not go above start
      if (w4 >= w1 * 1.01) continue; // W4 shouldn't overlap W1 too much
      if (w3 >= w1) continue; // W3 must be lower than W1 for impulse

      if (w4 >= w2) continue; // W4 cannot go above W2 in bearish

      const len1 = start - w1;
      const len3 = w2 - w3;

      // Reward large structural waves
      const waveSizePct = (p0.price > 0) ? ((p0.price - w3) / p0.price * 100) : 0;
      score += waveSizePct * 2;

      const retrace2 = (w2 - w1) / len1;
      if (retrace2 >= 0.382 && retrace2 <= 0.786) score += 20;
      if (Math.abs(retrace2 - idealRetrace2) < 0.1) score += 30;

      const ext3 = len3 / len1;
      if (ext3 >= 1.0) score += 20;
      if (Math.abs(ext3 - idealExt3) < 0.2) score += 30;

      const retrace4 = (w4 - w3) / len3;
      if (retrace4 >= 0.236 && retrace4 <= 0.618) score += 20;
      if (Math.abs(retrace4 - idealRetrace4) < 0.1) score += 30;

      const recencyBoost = Math.pow((p4.index || i) / data.length, 3) * 10; // Lower recency impact
      score += recencyBoost;
      score += bearishConfirmations.length * 15;
      
      if (tradeStyle === "SCALP TRADE" && bearishConfirmations.length < 2) continue;

      if (score > highestScore) {
        highestScore = score;
        const currentPrice = data[data.length - 1].close;
        const target1 = w4 - len1;
        const target2 = w4 - 0.618 * (start - w3);
        const finalTarget = parseFloat(((target1 + target2) / 2).toFixed(4));
        
        let validStopLoss = Math.min(w1, w4 * 1.02); // SL to w1 or slightly above w4
        let suggestedEntry = currentPrice;
        let isInvalidated = false;
        
        if (currentPrice > validStopLoss || currentPrice < finalTarget) {
            isInvalidated = true;
        } else if (currentPrice < w4) {
            const moveDone = (w4 - currentPrice) / (w4 - finalTarget);
            if (moveDone > 0.3) {
                isInvalidated = true;
                console.log(`[EW Bearish] Invalidated: Too late. moveDone=${moveDone}`);
            }
        }
        
        let finalTargetCopy = finalTarget;

        // Risk/Reward enforcing
        const risk = validStopLoss - suggestedEntry;
        const reward = suggestedEntry - finalTargetCopy;
        if (risk <= 0 || reward / risk < 1.7) {
            isInvalidated = true; // RR < 1.7 is skipped
            console.log(`[EW Bearish] Invalidated: RR < 1.7. risk=${risk}, reward=${reward}, ratio=${reward/risk}`);
        }

        // Check if clamped SL invalidates the trade
        if (!isInvalidated && currentPrice >= validStopLoss) {
            isInvalidated = true;
        }

        // Only accept if not invalidated securely
        if (!isInvalidated) {
            const gainPct = (Math.abs(finalTargetCopy - suggestedEntry) / suggestedEntry * 100).toFixed(2);
    
            let recLeverage = termStyle === 'SHORT_TERM' || tradeStyle === 'SCALP TRADE' ? Math.floor(Math.max(10, Math.min(50, (score / 100) * 30))) : Math.floor(Math.max(3, Math.min(15, (score / 100) * 10)));
            bestSetup = {
              leverage: recLeverage,
              score,
              trend: 'bearish',
              params: { retrace2, ext3, retrace4 },
              waves: { 
                start: { price: p0.price, time: p0.time, label: '0' }, 
                w1: { price: p1.price, time: p1.time, label: '1' }, 
                w2: { price: p2.price, time: p2.time, label: '2' }, 
                w3: { price: p3.price, time: p3.time, label: '3' }, 
                w4: { price: p4.price, time: p4.time, label: '4' } 
              },
              channelPoints: [
                [ { time: p2.time, price: p2.price }, { time: p4.time, price: p4.price } ], // Top trendline
                [ { time: p1.time, price: p1.price }, { time: p3.time, price: p3.price }, { time: p4.time, price: p3.price + ((p3.price - p1.price) / (p3.index - p1.index)) * (p4.index - p3.index) } ] // Bottom trendline projected
              ],
              flagPoints: [
                 [ { time: p3.time, price: p3.price }, { time: p4.time, price: p4.price } ] // Simple representation of the wave 4 pullback
              ],
              entry: suggestedEntry,
              stopLoss: validStopLoss,
              target: finalTargetCopy,
              tradeStyle,
      termStyle,
      gainPct,
              reasoning: `[${tradeStyle} | BEARISH | PREDICTED GAIN: ${gainPct}%] Bearish Elliott Wave setup detected. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1, Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1, and Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.\n\nTARGET JUSTIFICATION: The target (${finalTargetCopy.toFixed(4)}) is based on the Wave 5 downward extension to maximize profit before typical support reversal.\n\nSTOP LOSS: Set at ${validStopLoss.toFixed(4)} just above the Wave 4 resistance. If price breaks this ceiling, the bearish structure is instantly invalidated and the trade is closed to protect capital.\n\nAUTO SECURE: Algorithm continually monitors taking profit if it stalls near target.${getBearishDivergence()}`
            };
        }
      }
    }
  }

  
  if (bestSetup) {
      console.log(`[EW] Found setup, score=${highestScore}, termStyle=${bestSetup.termStyle}`);
  }

  if (!bestSetup || highestScore < 125) {
    return analyzeAdvancedTA(data, interval, tradeStyle, termStyle, bullishConfirmations, bearishConfirmations);
  }

  return bestSetup;
}

function analyzeAdvancedTA(
    data: Kline[], 
    interval: string, 
    tradeStyle: string, 
    termStyle: string, 
    bullishConfirmations: string[], 
    bearishConfirmations: string[]
) {
    if (data.length < 50) return null;
    
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const currentPrice = closes[closes.length - 1];
    
    const macd = calculateMACD(closes);
    const bb = calculateBollingerBands(closes);
    const atrLine = calculateATR(highs, lows, closes);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);
    
    const curAtr = atrLine[atrLine.length - 1];
    
    const mHist = macd.histogram;
    const mLine = macd.macdLine;
    const sLine = macd.signalLine;
    
    const curHist = mHist[mHist.length - 1];
    const prevHist = mHist[mHist.length - 2];
    
    const curEma20 = ema20[ema20.length - 1];
    const curEma50 = ema50[ema50.length - 1];
    const curEma200 = ema200[ema200.length - 1];
    
    const curUpperBB = bb.upper[bb.upper.length - 1];
    const curLowerBB = bb.lower[bb.lower.length - 1];
    
    let baseScore = 0;
    
    let isBullish = false;
    let isBearish = false;
    
    let reason = "";

    // Bullish Trend Check (Only allow if generally above EMA200 for safety)
    if (currentPrice > curEma200) {
        if (curEma20 > curEma50) {
            if (curHist > 0 && prevHist <= 0) { // MACD crossing up
                isBullish = true;
                baseScore += 80;
                reason += "✅ MACD Bullish Cross over zero line.\n";
            } else if (curHist > prevHist && curHist > 0) {
                isBullish = true;
                baseScore += 50;
                reason += "✅ MACD expanding positively.\n";
            }
            if (currentPrice > curEma20 && lows[lows.length-2] <= curEma20) {
                isBullish = true;
                baseScore += 60;
                reason += "✅ Bouncing strongly off EMA20 Support.\n";
            }
        }
    }
    
    // Bearish Trend Check (Only allow if generally below EMA200 for safety)
    if (currentPrice < curEma200) {
        if (curEma20 < curEma50) {
            if (curHist < 0 && prevHist >= 0) { // MACD crossing down
                isBearish = true;
                baseScore += 80;
                reason += "✅ MACD Bearish Cross under zero line.\n";
            } else if (curHist < prevHist && curHist < 0) {
                isBearish = true;
                baseScore += 50;
                reason += "✅ MACD expanding negatively.\n";
            }
            if (currentPrice < curEma20 && highs[highs.length-2] >= curEma20) {
                isBearish = true;
                baseScore += 60;
                reason += "✅ Rejecting strongly off EMA20 Resistance.\n";
            }
        }
    }
    
    // Oversold / Overbought bounce (Must be aligned with major trend)
    if (currentPrice > curEma200 && closes[closes.length-1] > curLowerBB && lows[lows.length-2] <= bb.lower[bb.lower.length-2]) {
        isBullish = true;
        baseScore += 70;
        reason += "✅ Mean Reversion: Strong bounce from Bottom Bollinger Band in Bull Market.\n";
    }
    if (currentPrice < curEma200 && closes[closes.length-1] < curUpperBB && highs[highs.length-2] >= bb.upper[bb.upper.length-2]) {
        isBearish = true;
        baseScore += 70;
        reason += "✅ Mean Reversion: Strong rejection from Top Bollinger Band in Bear Market.\n";
    }

    if (isBullish && isBearish) return null; 
    
    let finalScore = baseScore;
    if (isBullish) finalScore += bullishConfirmations.length * 15;
    if (isBearish) finalScore += bearishConfirmations.length * 15;

    if (finalScore < 160) return null; // Require extreme combinations of TA
    
    let target, stopLoss;
    
    if (isBullish) {
        stopLoss = currentPrice - curAtr * 2; 
        target = currentPrice + curAtr * 5; // 1:2.5 Risk Reward Minimum
        if (curUpperBB > target) target = curUpperBB;
        
        let recLeverage = Math.floor(Math.max(5, Math.min(15, (finalScore / 100) * 10)));
        const gainPct = (Math.abs(target - currentPrice) / currentPrice * 100).toFixed(2);
        
        return {
              leverage: recLeverage,
              score: finalScore,
              trend: 'bullish',
              params: { model: 'AdvancedTA', type: 'MACD+BB+ATR+EMA' },
              waves: null,
              channelPoints: [],
              flagPoints: [],
              entry: currentPrice,
              stopLoss: parseFloat(stopLoss.toFixed(4)),
              target: parseFloat(target.toFixed(4)),
              tradeStyle,
              termStyle,
              gainPct,
              reasoning: `[${tradeStyle} | BULLISH | STRICT MULTI-STRAT] Algorithmic Quantitative Setup.\n\nREASONING:\n${reason}\n\nTARGET JUSTIFICATION: Target (${parseFloat(target.toFixed(4))}) aligned dynamically using Volatility (ATR) predicting a 1:2.5 positive RR minimum.\n\nSTOP LOSS: Set dynamically using ${2}x ATR wrapper to absorb wicks.`
        };
    }
    
    if (isBearish) {
        stopLoss = currentPrice + curAtr * 2;
        target = currentPrice - curAtr * 5; // 1:2.5 Risk Reward Minimum
        if (curLowerBB < target) target = curLowerBB;
        
        let recLeverage = Math.floor(Math.max(5, Math.min(15, (finalScore / 100) * 10)));
        const gainPct = (Math.abs(currentPrice - target) / currentPrice * 100).toFixed(2);
        
        return {
              leverage: recLeverage,
              score: finalScore,
              trend: 'bearish',
              params: { model: 'AdvancedTA', type: 'MACD+BB+ATR+EMA' },
              waves: null,
              channelPoints: [],
              flagPoints: [],
              entry: currentPrice,
              stopLoss: parseFloat(stopLoss.toFixed(4)),
              target: parseFloat(target.toFixed(4)),
              tradeStyle,
              termStyle,
              gainPct,
              reasoning: `[${tradeStyle} | BEARISH | STRICT MULTI-STRAT] Algorithmic Quantitative Setup.\n\nREASONING:\n${reason}\n\nTARGET JUSTIFICATION: Target (${parseFloat(target.toFixed(4))}) aligned dynamically using Volatility (ATR) predicting a 1:2.5 positive RR minimum.\n\nSTOP LOSS: Set dynamically utilizing ${2}x ATR buffer to absorb wicks.`
        };
    }

    return null;
}
