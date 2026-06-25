import { calculateEMA, calculateSMA, calculateMACD, calculateATR, calculateBollingerBands, calculateRSI, calculateStoch, calculateDEMA } from './technicalIndicators.js';

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
  if (data.length < 200) return null;
  
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
  const curEma20 = ema20[ema20.length - 1];
  const curEma50 = ema50[ema50.length - 1];
  const curEma200 = ema200[ema200.length - 1];
  
  const mHist = macd.histogram;
  const curHist = mHist[mHist.length - 1];
  const prevHist = mHist[mHist.length - 2];
  
  const getTradeStyle = (intv: string) => {
      if (['1m', '3m', '5m', '15m'].includes(intv)) return "SCALP TRADE";
      if (['30m', '1h', '2h', '4h'].includes(intv)) return "DAY TRADE";
      return "SWING TRADE";
  };
  const tradeStyle = getTradeStyle(interval);
  const termStyle = ['1m', '3m', '5m', '15m'].includes(interval) ? 'SHORT_TERM' : 'LONG_TERM';

  // SRI Indicator Calculation
  const sma20 = calculateSMA(closes, 20);
  const sma200 = calculateSMA(closes, 200);
  const dema15 = calculateDEMA(closes, 15);
  const rsi2 = calculateRSI(closes, 2);
  const stoch = calculateStoch(highs, lows, closes, 9, 3);
  
  const bbUpper = bb.upper;
  const bbLower = bb.lower;

  const lastOpen = data[data.length - 1].open;
  const prevClose = data[data.length - 2].close;
  const prevOpen = data[data.length - 2].open;
  const prev2Close = data[data.length - 3].close;
  
  // Strategy 1: SMA 20 (smalc1 / smasc1)
  const smalc1 = currentPrice > lastOpen && currentPrice > sma20[sma20.length - 1] && 
                 prevClose > prevOpen && prevClose > sma20[sma20.length - 2] &&
                 prev2Close < sma20[sma20.length - 3] && currentPrice > sma200[sma200.length - 1];

  const smasc1 = currentPrice < lastOpen && currentPrice < sma20[sma20.length - 1] &&
                 prevClose < prevOpen && prevClose < sma20[sma20.length - 2] &&
                 prev2Close > sma20[sma20.length - 3] && currentPrice < sma200[sma200.length - 1];

  // Strategy 2: BB Strategy (shortbb / longbb)
  const high0 = highs[highs.length - 1];
  const high1 = highs[highs.length - 2];
  const low0 = lows[lows.length - 1];
  const low1 = lows[lows.length - 2];
  
  const rsibb0 = rsi2[rsi2.length - 1];
  const rsibb1 = rsi2[rsi2.length - 2];
  const rsibb2 = rsi2[rsi2.length - 3];
  const rsibb3 = rsi2[rsi2.length - 4];
  
  const shortbb = lastOpen > currentPrice && currentPrice < dema15[dema15.length - 1] &&
                  (high0 > bbUpper[bbUpper.length - 1] || high1 > bbUpper[bbUpper.length - 2]) &&
                  stoch[stoch.length - 2] > 65 &&
                  (rsibb0 > 91 || rsibb1 > 91 || rsibb2 > 91 || rsibb3 > 91);
                  
  const longbb = lastOpen < currentPrice && currentPrice > dema15[dema15.length - 1] &&
                 (low0 < bbLower[bbLower.length - 1] || low1 < bbLower[bbLower.length - 2]) &&
                 stoch[stoch.length - 2] < 35 &&
                 (rsibb0 < 9 || rsibb1 < 9 || rsibb2 < 9 || rsibb3 < 9);

  let isBullish = false;
  let isBearish = false;
  let reason = "";
  let baseScore = 0;

  if (smalc1) {
      isBullish = true;
      baseScore += 100;
      reason += "✅ SRI Indicator: SMA 20 Trend Continuation signal (M) triggered above SMA 200.\n";
  } else if (longbb) {
      isBullish = true;
      baseScore += 120;
      reason += "✅ SRI Indicator: BB Strategy Long signal (BB) triggered. Oversold Stoch/RSI2 + Bollinger Rejection.\n";
  }
  
  if (smasc1) {
      isBearish = true;
      baseScore += 100;
      reason += "✅ SRI Indicator: SMA 20 Trend Continuation signal (M) triggered below SMA 200.\n";
  } else if (shortbb) {
      isBearish = true;
      baseScore += 120;
      reason += "✅ SRI Indicator: BB Strategy Short signal (SS) triggered. Overbought Stoch/RSI2 + Bollinger Rejection.\n";
  }

  if (isBullish && isBearish) return null;
  if (!isBullish && !isBearish) return null;
  
  let target, stopLoss;
  
  // 5. Structural Extremes for safe Stoplosss
  let localLow = currentPrice;
  let localHigh = currentPrice;
  for (let i = data.length - 20; i < data.length; i++) {
     if (data[i].low < localLow) localLow = data[i].low;
     if (data[i].high > localHigh) localHigh = data[i].high;
  }
  
  if (isBullish) {
      stopLoss = localLow * 0.98; 
      if (stopLoss >= currentPrice) stopLoss = currentPrice * 0.95; 
      
      const targetMove = Math.min(Math.max((curAtr / currentPrice) * 2.0, 0.015), 0.03);
      target = currentPrice * (1 + targetMove);
      
      let recLeverage = Math.floor(Math.max(5, Math.min(15, (baseScore / 100) * 10)));
      const gainPct = (Math.abs(target - currentPrice) / currentPrice * 100).toFixed(2);
      
      return {
            leverage: recLeverage,
            score: baseScore + 20,
            trend: 'bullish',
            params: { model: 'SriCrypto', type: 'SMA20+BBReversal' },
            waves: null,
            channelPoints: [],
            flagPoints: [],
            entry: currentPrice,
            stopLoss: parseFloat(stopLoss.toFixed(4)),
            target: parseFloat(target.toFixed(4)),
            tradeStyle: "SWING/SRI",
            termStyle: "SHORT_TERM",
            gainPct,
            reasoning: `[✅ SRI INDICATOR PROTOCOL DEPLOYED]\n\nREASONING:\n${reason}\n\n🎯 TARGET: (${parseFloat(target.toFixed(4))}). Target optimized dynamically based on ATR.\n\n🛡️ STOP LOSS: (${parseFloat(stopLoss.toFixed(4))}). Placed below local support to prevent wicks.`
      };
  }
  
  if (isBearish) {
      stopLoss = localHigh * 1.02;
      if (stopLoss <= currentPrice) stopLoss = currentPrice * 1.05;
      
      const targetMove = Math.min(Math.max((curAtr / currentPrice) * 2.0, 0.015), 0.03);
      target = currentPrice * (1 - targetMove);
      
      let recLeverage = Math.floor(Math.max(5, Math.min(15, (baseScore / 100) * 10)));
      const gainPct = (Math.abs(currentPrice - target) / currentPrice * 100).toFixed(2);
      
      return {
            leverage: recLeverage,
            score: baseScore + 20,
            trend: 'bearish',
            params: { model: 'SriCrypto', type: 'SMA20+BBReversal' },
            waves: null,
            channelPoints: [],
            flagPoints: [],
            entry: currentPrice,
            stopLoss: parseFloat(stopLoss.toFixed(4)),
            target: parseFloat(target.toFixed(4)),
            tradeStyle: "SWING/SRI",
            termStyle: "SHORT_TERM",
            gainPct,
            reasoning: `[✅ SRI INDICATOR PROTOCOL DEPLOYED]\n\nREASONING:\n${reason}\n\n🎯 TARGET: (${parseFloat(target.toFixed(4))}). Target optimized dynamically based on ATR.\n\n🛡️ STOP LOSS: (${parseFloat(stopLoss.toFixed(4))}). Placed above local resistance to prevent wicks.`
      };
  }

  return null;
}
