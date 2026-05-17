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
  let rsiDivergence = "";
  let confirmations = [];
  
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
         confirmations.push("⚠️ RSI is OVERBOUGHT (" + Math.round(rsiRecent) + "), suggesting potential exhaustion if bullish.");
     } else if (rsiRecent < 30) {
         confirmations.push("⚠️ RSI is OVERSOLD (" + Math.round(rsiRecent) + "), suggesting potential bounce if bearish.");
     } else {
         confirmations.push("✅ RSI is NEUTRAL (" + Math.round(rsiRecent) + "), providing room for trend continuation.");
     }

     const rsiOld = rsiValues[Math.max(0, rsiValues.length - 20)];
     const priceRecent = data[data.length - 1].close;
     const priceOld = data[Math.max(0, data.length - 20)].close;
     
     if (priceRecent < priceOld && rsiRecent > rsiOld + 5) {
         confirmations.push("✅ BULLISH RSI DIVERGENCE: Price made a lower low but RSI made a higher low.");
     } else if (priceRecent > priceOld && rsiRecent < rsiOld - 5) {
         confirmations.push("✅ BEARISH RSI DIVERGENCE: Price made a higher high but RSI made a lower high.");
     }
  }

  if (data.length > 50) {
     const ema20 = data.slice(-20).reduce((acc, d) => acc + d.close, 0) / 20;
     const ema50 = data.slice(-50).reduce((acc, d) => acc + d.close, 0) / 50;
     
     if (ema20 > ema50) {
         confirmations.push("✅ TREND CONFIRMATION: Fast MA (20) > Slow MA (50) (Bullish Momentum).");
     } else {
         confirmations.push("✅ TREND CONFIRMATION: Fast MA (20) < Slow MA (50) (Bearish Momentum).");
     }
     
     const recentVol = data.slice(-5).reduce((acc, d) => acc + d.volume, 0) / 5;
     const oldVol = data.slice(-20, -5).reduce((acc, d) => acc + d.volume, 0) / 15;
     if (recentVol > oldVol * 1.5) {
         confirmations.push("✅ VOLUME: Significant volume spike detected (" + (recentVol/oldVol).toFixed(1) + "x average).");
     }
  }

  rsiDivergence = confirmations.length > 0 ? "\n\nMULTIPLE CONFIRMATIONS:\n- " + confirmations.join("\n- ") : "";

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
      leverage: 10,
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
      reasoning: `[${tradeStyle} | ${isBull ? 'BULLISH' : 'BEARISH'} | PREDICTED GAIN: ${gainPct}%] Statistical momentum continuation setup detected (Mean-Reversion Fallback).\n\nTARGET JUSTIFICATION: The algorithm targets ${target.toFixed(4)} to secure early profits before the momentum exhausts.\n\nSTOP LOSS: Capital protection placed at ${stop.toFixed(4)}. Evaluated strictly to cut losses early if market structure flips against the intended trend momentum.\n\nAUTO SECURE: Algorithm aggressively trails stops into profit.${rsiDivergence}`
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
      if (retrace4 >= 0.236 && retrace4 <= 0.5) score += 20;
      if (Math.abs(retrace4 - idealRetrace4) < 0.1) score += 30;

      const recencyBoost = Math.pow((p4.index || i) / data.length, 3) * 100; // Lower recency impact
      score += recencyBoost;

      if (score > highestScore) {
        highestScore = score;
        const currentPrice = data[data.length - 1].close;
        const target1 = w4 + len1;
        const target2 = w4 + 0.618 * (w3 - start);
        const finalTarget = parseFloat(((target1 + target2) / 2).toFixed(4));
        
        let validStopLoss = w4 * 0.99; // Much tighter SL: 1% below Wave 4 base
        
        let suggestedEntry = w4;
        let isInvalidated = false;
        
        // If price is already moving from W4 towards target, entry is current price
        if (currentPrice > w4 && currentPrice < finalTarget) {
            suggestedEntry = currentPrice;
        } else if (currentPrice >= finalTarget || currentPrice <= validStopLoss) {
            isInvalidated = true; // Trade is over or failed
        }
        
        // Enforce stop loss to be within $2 to $5 loss based on $10 margin 10x leverage (i.e. 2% to 5% max risk)
        const minSL_price = suggestedEntry * (1 - 0.04); // Max 4% drop
        const maxSL_price = suggestedEntry * (1 - 0.015); // Min 1.5% drop
        if (validStopLoss < minSL_price) validStopLoss = minSL_price;
        if (validStopLoss > maxSL_price) validStopLoss = maxSL_price;

        // Enforce target to be a reasonable Risk/Reward (at least 1.5x up to 4x)
        let finalTargetCopy = finalTarget;
        const minTarget = suggestedEntry * (1 + 0.02); // Min 2% move
        const maxTarget = suggestedEntry * (1 + 0.06); // Max 6% move
        if (finalTargetCopy < minTarget) finalTargetCopy = minTarget;
        if (finalTargetCopy > maxTarget) finalTargetCopy = maxTarget;
        
        // Only accept if not invalidated securely
        if (!isInvalidated && currentPrice <= validStopLoss) {
            isInvalidated = true; // recheck with clamped SL
        }

        // Only accept if not invalidated securely
        if (!isInvalidated) {
            const gainPct = (Math.abs(finalTargetCopy - suggestedEntry) / suggestedEntry * 100).toFixed(2);
    
            const recLeverage = Math.floor(Math.max(3, Math.min(50, (score / 100) * 50)));
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
              reasoning: `[${tradeStyle} | BULLISH | PREDICTED GAIN: ${gainPct}%] Bullish Elliott Wave setup detected. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1, Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1, and Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.\n\nTARGET JUSTIFICATION: The target (${finalTargetCopy.toFixed(4)}) is generated based on a Wave 5 mathematical extension to maximize the risk/reward ratio while securing optimal algorithmic probability.\n\nSTOP LOSS: Set at ${validStopLoss.toFixed(4)} strictly below the exhaustion support line (Wave 4 base) to instantly invalidate the setup and protect capital if the market flips bearish unexpectedly.\n\nAUTO SECURE: Algorithm continually monitors taking profit if it stalls near target.${rsiDivergence}`
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
      if (retrace4 >= 0.236 && retrace4 <= 0.5) score += 20;
      if (Math.abs(retrace4 - idealRetrace4) < 0.1) score += 30;

      const recencyBoost = Math.pow((p4.index || i) / data.length, 3) * 100; // Lower recency impact
      score += recencyBoost;

      if (score > highestScore) {
        highestScore = score;
        const currentPrice = data[data.length - 1].close;
        const target1 = w4 - len1;
        const target2 = w4 - 0.618 * (start - w3);
        const finalTarget = parseFloat(((target1 + target2) / 2).toFixed(4));
        
        let validStopLoss = w4 * 1.01; // Much tighter SL: 1% above Wave 4 peak
        
        let suggestedEntry = w4;
        let isInvalidated = false;
        
        // If price is already moving from W4 towards target, entry is current price
        if (currentPrice < w4 && currentPrice > finalTarget) {
            suggestedEntry = currentPrice;
        } else if (currentPrice <= finalTarget || currentPrice >= validStopLoss) {
            isInvalidated = true; // Trade is over or failed
        }
        
        // Enforce stop loss to be within $2 to $5 loss based on $10 margin 10x leverage
        const maxSL_price = suggestedEntry * (1 + 0.04); // Max 4% climb
        const minSL_price = suggestedEntry * (1 + 0.015); // Min 1.5% climb
        if (validStopLoss > maxSL_price) validStopLoss = maxSL_price;
        if (validStopLoss < minSL_price) validStopLoss = minSL_price;

        // Enforce target to be a reasonable Risk/Reward
        let finalTargetCopy = finalTarget;
        const minTarget_b = suggestedEntry * (1 - 0.02); // Min 2% drop
        const maxTarget_b = suggestedEntry * (1 - 0.06); // Max 6% drop
        if (finalTargetCopy > minTarget_b) finalTargetCopy = minTarget_b;
        if (finalTargetCopy < maxTarget_b) finalTargetCopy = maxTarget_b;

        // Check if clamped SL invalidates the trade
        if (!isInvalidated && currentPrice >= validStopLoss) {
            isInvalidated = true;
        }

        // Only accept if not invalidated securely
        if (!isInvalidated) {
            const gainPct = (Math.abs(finalTargetCopy - suggestedEntry) / suggestedEntry * 100).toFixed(2);
    
            const recLeverage = Math.floor(Math.max(3, Math.min(50, (score / 100) * 50)));
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
              reasoning: `[${tradeStyle} | BEARISH | PREDICTED GAIN: ${gainPct}%] Bearish Elliott Wave setup detected. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1, Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1, and Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.\n\nTARGET JUSTIFICATION: The target (${finalTargetCopy.toFixed(4)}) is based on the Wave 5 downward extension to maximize profit before typical support reversal.\n\nSTOP LOSS: Set at ${validStopLoss.toFixed(4)} just above the Wave 4 resistance. If price breaks this ceiling, the bearish structure is instantly invalidated and the trade is closed to protect capital.\n\nAUTO SECURE: Algorithm continually monitors taking profit if it stalls near target.${rsiDivergence}`
            };
        }
      }
    }
  }

  if (!bestSetup || highestScore < 50) {
    return null; // Return null instead of taking a weak highly risky fallback
  }

  return bestSetup;
}
