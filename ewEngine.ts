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

export function analyzeElliottWaves(data: Kline[]) {
  const pivots = findPivots(data, 5, 5); // 5 bars left/right lookback
  
  let bestSetup: any = null;
  let highestScore = -999999;

  if (pivots.length < 5) {
    // Fallback if not enough pivots found
    const len = data.length;
    return {
      score: 0,
      trend: data[len-1].close > data[0].close ? 'bullish' : 'bearish',
      waves: {
        start: { price: data[Math.max(0, len-50)].close, time: data[Math.max(0, len-50)].time },
        w1: { price: data[Math.max(0, len-40)].close, time: data[Math.max(0, len-40)].time },
        w2: { price: data[Math.max(0, len-30)].close, time: data[Math.max(0, len-30)].time },
        w3: { price: data[Math.max(0, len-20)].close, time: data[Math.max(0, len-20)].time },
        w4: { price: data[Math.max(0, len-10)].close, time: data[Math.max(0, len-10)].time }
      },
      entry: data[len-1].close,
      stopLoss: data[Math.max(0, len-50)].close,
      target: data[len-1].close * 1.05,
      reasoning: "Not enough distinct market pivots found to form a complex Elliott wave. Best-effort directional projection based on recent trend."
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

      const len1 = w1 - start;
      const len3 = w3 - w2;

      const retrace2 = (w1 - w2) / len1;
      if (retrace2 >= 0.382 && retrace2 <= 0.786) score += 10;
      if (Math.abs(retrace2 - 0.618) < 0.1) score += 20;

      const ext3 = len3 / len1;
      if (ext3 >= 1.0) score += 10;
      if (Math.abs(ext3 - 1.618) < 0.2) score += 20;

      const retrace4 = (w3 - w4) / len3;
      if (retrace4 >= 0.236 && retrace4 <= 0.5) score += 10;
      if (Math.abs(retrace4 - 0.382) < 0.1) score += 20;

      const recencyBoost = ((p4.index || i) / data.length) * 50;
      score += recencyBoost;

      if (score > highestScore) {
        highestScore = score;
        const target1 = w4 + len1;
        const target2 = w4 + 0.618 * (w3 - start);
        const finalTarget = parseFloat(((target1 + target2) / 2).toFixed(4));
        
        bestSetup = {
          score,
          trend: 'bullish',
          waves: { 
            start: { price: p0.price, time: p0.time }, 
            w1: { price: p1.price, time: p1.time }, 
            w2: { price: p2.price, time: p2.time }, 
            w3: { price: p3.price, time: p3.time }, 
            w4: { price: p4.price, time: p4.time } 
          },
          entry: w4,
          stopLoss: w1, // Invalidation line
          target: finalTarget,
          reasoning: `Bullish Elliott Wave setup detected. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1. Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1. Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3. Recommended Entry around Wave 4 low (${w4}). Stop Loss at Wave 1 peak (${w1}) as overlap invalidates the impulse. Target based on 100% of Wave 1 extension from Wave 4 and 61.8% of Wave 1-3 extension, averaging at ${finalTarget}.`
        };
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

      const len1 = start - w1;
      const len3 = w2 - w3;

      const retrace2 = (w2 - w1) / len1;
      if (retrace2 >= 0.382 && retrace2 <= 0.786) score += 10;
      if (Math.abs(retrace2 - 0.618) < 0.1) score += 20;

      const ext3 = len3 / len1;
      if (ext3 >= 1.0) score += 10;
      if (Math.abs(ext3 - 1.618) < 0.2) score += 20;

      const retrace4 = (w4 - w3) / len3;
      if (retrace4 >= 0.236 && retrace4 <= 0.5) score += 10;
      if (Math.abs(retrace4 - 0.382) < 0.1) score += 20;

      const recencyBoost = ((p4.index || i) / data.length) * 50;
      score += recencyBoost;

      if (score > highestScore) {
        highestScore = score;
        const target1 = w4 - len1;
        const target2 = w4 - 0.618 * (start - w3);
        const finalTarget = parseFloat(((target1 + target2) / 2).toFixed(4));
        
        bestSetup = {
          score,
          trend: 'bearish',
          waves: { 
            start: { price: p0.price, time: p0.time }, 
            w1: { price: p1.price, time: p1.time }, 
            w2: { price: p2.price, time: p2.time }, 
            w3: { price: p3.price, time: p3.time }, 
            w4: { price: p4.price, time: p4.time } 
          },
          entry: w4,
          stopLoss: w1,
          target: finalTarget,
          reasoning: `Bearish Elliott Wave setup detected. Wave 2 retraced ${(retrace2*100).toFixed(1)}% of Wave 1. Wave 3 extended ${(ext3*100).toFixed(1)}% of Wave 1. Wave 4 retraced ${(retrace4*100).toFixed(1)}% of Wave 3. Recommended Short Entry around Wave 4 high (${w4}). Stop Loss at Wave 1 low (${w1}) as overlap invalidates the impulse. Target based on 100% of Wave 1 extension from Wave 4 and 61.8% of Wave 1-3 extension, averaging at ${finalTarget}.`
        };
      }
    }
  }

  return bestSetup;
}
