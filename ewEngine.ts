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
  let highestScore = -1;

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

      // Rules Enforcement
      if (w2 <= start || w4 <= w1 || w3 <= w1) continue;

      const len1 = w1 - start;
      const len3 = w3 - w2;

      let score = 0;
      const retrace2 = (w1 - w2) / len1;
      if (retrace2 >= 0.382 && retrace2 <= 0.786) score += 10;
      if (Math.abs(retrace2 - 0.618) < 0.1) score += 20;

      const ext3 = len3 / len1;
      if (ext3 >= 1.0) score += 10;
      if (Math.abs(ext3 - 1.618) < 0.2) score += 20;

      const retrace4 = (w3 - w4) / len3;
      if (retrace4 >= 0.236 && retrace4 <= 0.5) score += 10;
      if (Math.abs(retrace4 - 0.382) < 0.1) score += 20;

      if (score > highestScore) {
        highestScore = score;
        const target1 = w4 + len1;
        const target2 = w4 + 0.618 * (w3 - start);
        
        bestSetup = {
          score,
          trend: 'bullish',
          waves: { start, w1, w2, w3, w4 },
          entry: w4,
          stopLoss: w1, // Invalidation line
          target: parseFloat(((target1 + target2) / 2).toFixed(4))
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

      if (w2 >= start || w4 >= w1 || w3 >= w1) continue;

      const len1 = start - w1;
      const len3 = w2 - w3;

      let score = 0;
      const retrace2 = (w2 - w1) / len1;
      if (retrace2 >= 0.382 && retrace2 <= 0.786) score += 10;
      if (Math.abs(retrace2 - 0.618) < 0.1) score += 20;

      const ext3 = len3 / len1;
      if (ext3 >= 1.0) score += 10;
      if (Math.abs(ext3 - 1.618) < 0.2) score += 20;

      const retrace4 = (w4 - w3) / len3;
      if (retrace4 >= 0.236 && retrace4 <= 0.5) score += 10;
      if (Math.abs(retrace4 - 0.382) < 0.1) score += 20;

      if (score > highestScore) {
        highestScore = score;
        const target1 = w4 - len1;
        const target2 = w4 - 0.618 * (start - w3);
        
        bestSetup = {
          score,
          trend: 'bearish',
          waves: { start, w1, w2, w3, w4 },
          entry: w4,
          stopLoss: w1,
          target: parseFloat(((target1 + target2) / 2).toFixed(4))
        };
      }
    }
  }

  return bestSetup;
}
