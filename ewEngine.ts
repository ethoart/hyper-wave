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
  // calculate RSI divergence over the last N candles
  let rsiDivergence = "";
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
     
     // basic divergence check on last few candles vs 20 candles ago
     const rsiRecent = rsiValues[rsiValues.length - 1];
     const rsiOld = rsiValues[Math.max(0, rsiValues.length - 20)];
     const priceRecent = data[data.length - 1].close;
     const priceOld = data[Math.max(0, data.length - 20)].close;
     
     if (priceRecent < priceOld && rsiRecent > rsiOld + 5) {
         rsiDivergence = "\n\n⚠️ BULLISH RSI DIVERGENCE DETECTED: Price made a lower low but RSI made a higher low.";
     } else if (priceRecent > priceOld && rsiRecent < rsiOld - 5) {
         rsiDivergence = "\n\n⚠️ BEARISH RSI DIVERGENCE DETECTED: Price made a higher high but RSI made a lower high.";
     }
  }

  const pivots = findPivots(data, 12, 12); // 12 bars left/right lookback for stronger distinct structural waves
  
  const getTradeStyle = (intv: string) => {
      if (['1m', '3m', '5m', '15m'].includes(intv)) return "SCALP TRADE";
      if (['30m', '1h', '2h', '4h'].includes(intv)) return "DAY TRADE";
      return "SWING TRADE";
  };
  
  const tradeStyle = getTradeStyle(interval);

  let bestSetup: any = null;
  let highestScore = -999999;

  // Find optimal parameters learned from ML, otherwise default
  const idealRetrace2 = mlParams?.retrace2 || 0.618;
  const idealExt3 = mlParams?.ext3 || 1.618;
  const idealRetrace4 = mlParams?.retrace4 || 0.382;

  if (pivots.length < 5) {
    // Fallback if not enough pivots found
    const len = data.length;
    const isBull = data[len-1].close > data[Math.max(0, len-50)].close;
    const entry = data[len-1].close;
    const target = isBull ? entry * 1.05 : entry * 0.95;
    let stop = isBull ? Math.min(data[Math.max(0, len-50)].close, entry * 0.95) : Math.max(data[Math.max(0, len-50)].close, entry * 1.05);

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
      gainPct,
      reasoning: `[${tradeStyle} | ${isBull ? 'BULLISH' : 'BEARISH'} | PREDICTED GAIN: ${gainPct}%] Not enough distinct market pivots found to form a complex Elliott wave. Best-effort directional projection based on recent trend. Drawing simple structural bounds.${rsiDivergence}`
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

      if (w2 <= start) score -= 50; // Wave 2 shouldn't go below start
      if (w4 <= w1) score -= 30; // Overlap rule often broken in crypto by wicks
      if (w3 <= w1) score -= 20; // Wave 3 usually the longest

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
        
        let validStopLoss = w1;
        if (validStopLoss >= w4) {
           validStopLoss = w2; // Fallback to w2 if w1 overlaps w4
        }
        
        let suggestedEntry = w4;
        let isInvalidated = false;
        
        // If price is already moving from W4 towards target, entry is current price
        if (currentPrice > w4 && currentPrice < finalTarget) {
            suggestedEntry = currentPrice;
        } else if (currentPrice >= finalTarget || currentPrice <= validStopLoss) {
            isInvalidated = true; // Trade is over or failed
        }
        
        // Enforce stop loss to be within $2 to $5 loss based on $10 margin 10x leverage (i.e. 2% to 5% max risk)
        const minSL = suggestedEntry * (1 - 0.05); // Max 5% drop (costs $5)
        const maxSL = suggestedEntry * (1 - 0.02); // Min 2% drop (costs $2)
        if (validStopLoss < minSL) validStopLoss = minSL;
        if (validStopLoss > maxSL) validStopLoss = maxSL;
        
        // Only accept if not invalidated securely
        if (!isInvalidated) {
            const gainPct = (Math.abs(finalTarget - suggestedEntry) / suggestedEntry * 100).toFixed(2);
    
            bestSetup = {
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
              target: finalTarget,
              tradeStyle,
              gainPct,
              reasoning: `[${tradeStyle} | BULLISH | PREDICTED GAIN: ${gainPct}%] Bullish Elliott Wave setup detected. Using dynamic AI parameters: Retrace2=${idealRetrace2.toFixed(3)}, Ext3=${idealExt3.toFixed(3)}, Retrace4=${idealRetrace4.toFixed(3)}. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1. Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1. Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.${rsiDivergence}`
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

      if (w2 >= start) score -= 50;
      if (w4 >= w1) score -= 30;
      if (w3 >= w1) score -= 20;

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
        
        let validStopLoss = w1;
        if (validStopLoss <= w4) {
           validStopLoss = w2; // Fallback to w2 if w1 overlaps w4
        }
        
        let suggestedEntry = w4;
        let isInvalidated = false;
        
        // If price is already moving from W4 towards target, entry is current price
        if (currentPrice < w4 && currentPrice > finalTarget) {
            suggestedEntry = currentPrice;
        } else if (currentPrice <= finalTarget || currentPrice >= validStopLoss) {
            isInvalidated = true; // Trade is over or failed
        }

        // Enforce stop loss to be within $2 to $5 loss based on $10 margin 10x leverage
        const maxSL_price = suggestedEntry * (1 + 0.05); // Max 5% climb (costs $5)
        const minSL_price = suggestedEntry * (1 + 0.02); // Min 2% climb (costs $2)
        if (validStopLoss > maxSL_price) validStopLoss = maxSL_price;
        if (validStopLoss < minSL_price) validStopLoss = minSL_price;

        // Only accept if not invalidated securely
        if (!isInvalidated) {
            const gainPct = (Math.abs(finalTarget - suggestedEntry) / suggestedEntry * 100).toFixed(2);
    
            bestSetup = {
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
              target: finalTarget,
              tradeStyle,
              gainPct,
              reasoning: `[${tradeStyle} | BEARISH | PREDICTED GAIN: ${gainPct}%] Bearish Elliott Wave setup detected. Using dynamic AI parameters: Retrace2=${idealRetrace2.toFixed(3)}, Ext3=${idealExt3.toFixed(3)}, Retrace4=${idealRetrace4.toFixed(3)}. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1. Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1. Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3.${rsiDivergence}`
            };
        }
      }
    }
  }

  if (!bestSetup) {
    // Fallback if no valid complex structure found but we want a trade signal
    const len = data.length;
    const isBull = data[len-1].close > data[Math.max(0, len-50)].close;
    const entry = data[len-1].close;
    const target = isBull ? entry * 1.05 : entry * 0.95;
    let stop = isBull ? Math.min(data[Math.max(0, len-50)].close, entry * 0.95) : Math.max(data[Math.max(0, len-50)].close, entry * 1.05);

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
      gainPct,
      reasoning: `[${tradeStyle} | ${isBull ? 'BULLISH' : 'BEARISH'} | PREDICTED GAIN: ${gainPct}%] Simple structural trend analysis used instead of strict Elliott Waves. Price bounds generated.${rsiDivergence}`
    };
  }

  return bestSetup;
}
