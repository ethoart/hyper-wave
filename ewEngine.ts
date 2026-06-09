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
  const bullishConfirmations: string[] = [];
  const bearishConfirmations: string[] = [];
  
  if (data.length < 200) return null; // Need enough data for EMA200
  
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

  let isBullish = false;
  let isBearish = false;
  let reason = "";
  let baseScore = 0;

  // 1. Trend Alignment (Super Strict)
  const isSuperUptrend = currentPrice > curEma200 && curEma50 > curEma200 && curEma20 > curEma50;
  const isSuperDowntrend = currentPrice < curEma200 && curEma50 < curEma200 && curEma20 < curEma50;
  
  // 2. MACD Momentum Shift
  const macdCurlingUp = curHist > prevHist && prevHist > mHist[mHist.length - 3] && curHist < 0;
  const macdCurlingDown = curHist < prevHist && prevHist < mHist[mHist.length - 3] && curHist > 0;
  
  // 3. RSI Calculation
  const period = 14;
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length; i++) {
      const change = data[i].close - data[i-1].close;
      if (change > 0) gains += change;
      else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  let currentRsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  // 4. Volume Confirmation (Recent spike)
  let avgVol = 0;
  for (let i = data.length - 10; i < data.length; i++) avgVol += data[i].volume;
  avgVol /= 10;
  const currentVol = data[data.length - 1].volume;
  const volumeSpike = currentVol > avgVol * 1.2;

  // MULTIPLE CONFIRMATION FOR BULLISH (Long Trades)
  if (isSuperUptrend && macdCurlingUp && volumeSpike) {
      if (currentRsi > 40 && currentRsi < 65) { 
          isBullish = true;
          baseScore += 120;
          reason += "✅ Macro Trend is STRONGLY UP (EMA20 > EMA50 > EMA200).\n";
          reason += "✅ MACD Histogram curling UP from negative (Momentum shift).\n";
          reason += `✅ RSI is recovering (${currentRsi.toFixed(1)}).\n`;
          reason += "✅ Volume spike detected confirming buyers stepping in.\n";
      }
  }

  // MULTIPLE CONFIRMATION FOR BEARISH (Short Trades)
  if (isSuperDowntrend && macdCurlingDown && volumeSpike) {
      if (currentRsi > 35 && currentRsi < 60) { 
          isBearish = true;
          baseScore += 120;
          reason += "✅ Macro Trend is STRONGLY DOWN (EMA20 < EMA50 < EMA200).\n";
          reason += "✅ MACD Histogram curling DOWN from positive (Momentum shift).\n";
          reason += `✅ RSI is breaking down (${currentRsi.toFixed(1)}).\n`;
          reason += "✅ Volume spike detected confirming sellers stepping in.\n";
      }
  }

  // Bollinger Band Rejection fallback (For tight consolidation breakouts)
  const curUpperBB = bb.upper[bb.upper.length - 1];
  const curLowerBB = bb.lower[bb.lower.length - 1];
  
  if (!isBullish && !isBearish) {
      // Extremely oversold + touching lower BB + bullish engulfing or strong close
      if (currentPrice <= curLowerBB && currentRsi < 30 && currentPrice > data[data.length-2].high) {
          isBullish = true;
          baseScore += 90;
          reason += "✅ Mean Reversion: Extreme Oversold (RSI < 30) + Pierced Lower BB.\n";
          reason += "✅ Bullish Engulfing/Strong close confirmation.\n";
      } else if (currentPrice >= curUpperBB && currentRsi > 70 && currentPrice < data[data.length-2].low) {
          isBearish = true;
          baseScore += 90;
          reason += "✅ Mean Reversion: Extreme Overbought (RSI > 70) + Pierced Upper BB.\n";
          reason += "✅ Bearish Engulfing/Strong close confirmation.\n";
      }
  }

  if (isBullish && isBearish) return null; // Conflict
  if (!isBullish && !isBearish) return null; // No trade setup
  
  let target, stopLoss;
  
  // Create Highly Probable 1:1.5 Risk-Reward trades
  if (isBullish) {
      stopLoss = currentPrice - (curAtr * 1.8); // Tight but safe stop below recent volatility
      const risk = currentPrice - stopLoss;
      target = currentPrice + (risk * 1.5); // 1:1.5 RR maximizes win rate
      
      let recLeverage = Math.floor(Math.max(5, Math.min(20, (baseScore / 100) * 10)));
      const gainPct = (Math.abs(target - currentPrice) / currentPrice * 100).toFixed(2);
      
      return {
            leverage: recLeverage,
            score: baseScore,
            trend: 'bullish',
            params: { model: 'HighWinRate', type: 'SuperTrend+MACD+BB' },
            waves: null,
            channelPoints: [],
            flagPoints: [],
            entry: currentPrice,
            stopLoss: parseFloat(stopLoss.toFixed(4)),
            target: parseFloat(target.toFixed(4)),
            tradeStyle,
            termStyle,
            gainPct,
            reasoning: `[${tradeStyle} | BULLISH | HIGH WIN-RATE STRAT] Algorithmic Quantitative Setup.\n\nREASONING:\n${reason}\n\nTARGET: Target (${parseFloat(target.toFixed(4))}) set to a highly probable 1:1.5 Risk/Reward profile.\n\nSTOP LOSS: Secured with 1.8x ATR dynamically to prevent stop hunts.`
      };
  }
  
  if (isBearish) {
      stopLoss = currentPrice + (curAtr * 1.8);
      const risk = stopLoss - currentPrice;
      target = currentPrice - (risk * 1.5); 
      
      let recLeverage = Math.floor(Math.max(5, Math.min(20, (baseScore / 100) * 10)));
      const gainPct = (Math.abs(currentPrice - target) / currentPrice * 100).toFixed(2);
      
      return {
            leverage: recLeverage,
            score: baseScore,
            trend: 'bearish',
            params: { model: 'HighWinRate', type: 'SuperTrend+MACD+BB' },
            waves: null,
            channelPoints: [],
            flagPoints: [],
            entry: currentPrice,
            stopLoss: parseFloat(stopLoss.toFixed(4)),
            target: parseFloat(target.toFixed(4)),
            tradeStyle,
            termStyle,
            gainPct,
            reasoning: `[${tradeStyle} | BEARISH | HIGH WIN-RATE STRAT] Algorithmic Quantitative Setup.\n\nREASONING:\n${reason}\n\nTARGET: Target (${parseFloat(target.toFixed(4))}) set to a highly probable 1:1.5 Risk/Reward profile.\n\nSTOP LOSS: Secured with 1.8x ATR dynamically to prevent stop hunts.`
      };
  }

  return null;
}
