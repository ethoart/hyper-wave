export function computeRSI(data: any[], period: number = 14) {
  if (!data || data.length < period) return [];
  const rsi = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push({ time: Math.floor(new Date(data[period].time).getTime() / 1000) as any, value: 100 - (100 / (1 + rs)) });

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    let gain = diff >= 0 ? diff : 0;
    let loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push({ time: Math.floor(new Date(data[i].time).getTime() / 1000) as any, value: 100 - (100 / (1 + rs)) });
  }
  
  return rsi;
}

export function computeSMA(data: any[], period: number = 20) {
  if (!data || data.length < period) return [];
  const sma = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    sma.push({ time: Math.floor(new Date(data[i].time).getTime() / 1000) as any, value: sum / period });
  }
  return sma;
}

export function computeBB(data: any[], period: number = 20, multiplier: number = 2) {
  if (!data || data.length < period) return [];
  const sma = computeSMA(data, period);
  const bb = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    const avg = sma[i - (period - 1)].value;
    for (let j = 0; j < period; j++) {
      sum += Math.pow(data[i - j].close - avg, 2);
    }
    const stdDev = Math.sqrt(sum / period);
    
    const timeVal = typeof data[i].time === 'number' ? 
      (data[i].time > 10000000000 ? Math.floor(data[i].time / 1000) : data[i].time) : 
      data[i].time;
      
    bb.push({
      time: timeVal,
      upper: avg + multiplier * stdDev,
      lower: avg - multiplier * stdDev,
      basis: avg
    });
  }
  return bb;
}

