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

  // 1. MACD Momentum Check
  const macdBullish = curHist > prevHist && curHist > 0;
  const macdBearish = curHist < prevHist && curHist < 0;

  // 2. Trend Alignment (Golden Cross / Death Cross rules)
  const uptrend = currentPrice > curEma200 && curEma20 > curEma50;
  const downtrend = currentPrice < curEma200 && curEma20 < curEma50;
  
  // 3. RSI Calculation for overbought/oversold buffer
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

  // MULTIPLE CONFIRMATION FOR BULLISH (Long Trades)
  if (uptrend && macdBullish && currentPrice > curEma20) {
      if (currentRsi > 40 && currentRsi < 70) { // Not overbought yet
          isBullish = true;
          baseScore += 100;
          reason += "✅ Major Trend is UP (Price > EMA200, EMA20 > EMA50).\n";
          reason += "✅ Momentum is BUILDING (MACD extending positively).\n";
          reason += `✅ RSI is healthy (${currentRsi.toFixed(1)}), room for growth.\n`;
          reason += "✅ Price holds above short-term support (EMA20).\n";
      }
  }

  // MULTIPLE CONFIRMATION FOR BEARISH (Short Trades)
  if (downtrend && macdBearish && currentPrice < curEma20) {
      if (currentRsi > 30 && currentRsi < 60) { // Not oversold yet
          isBearish = true;
          baseScore += 100;
          reason += "✅ Major Trend is DOWN (Price < EMA200, EMA20 < EMA50).\n";
          reason += "✅ Momentum is DROPPING (MACD extending negatively).\n";
          reason += `✅ RSI is healthy (${currentRsi.toFixed(1)}), room for drop.\n`;
          reason += "✅ Price rejecting off short-term resistance (EMA20).\n";
      }
  }

  // Mean Reversion fallback if trend isn't heavily established but bands are pinched (For scalping / range bounding)
  const curUpperBB = bb.upper[bb.upper.length - 1];
  const curLowerBB = bb.lower[bb.lower.length - 1];
  
  if (!isBullish && !isBearish) {
      if (currentPrice <= curLowerBB && currentRsi < 35 && currentPrice > curEma200) {
          isBullish = true;
          baseScore += 80;
          reason += "✅ Mean Reversion: Strong bounce from Bottom Bollinger Band in a macro UP market.\n";
          reason += `✅ RSI is OVERSOLD (${currentRsi.toFixed(1)}).\n`;
      } else if (currentPrice >= curUpperBB && currentRsi > 65 && currentPrice < curEma200) {
          isBearish = true;
          baseScore += 80;
          reason += "✅ Mean Reversion: Strong rejection from Top Bollinger Band in a macro DOWN market.\n";
          reason += `✅ RSI is OVERBOUGHT (${currentRsi.toFixed(1)}).\n`;
      }
  }

  if (isBullish && isBearish) return null; // Conflict
  if (!isBullish && !isBearish) return null; // No trade setup
  
  let target, stopLoss;
  
  // Create 1:2 Risk-Reward trades with ATR buffer to avoid stop hunts
  if (isBullish) {
      // Stop Loss conservatively below the EMA50 and buffered by ATR, or 2.5 ATR if extremely volatile.
      stopLoss = Math.min(curEma50 - curAtr, currentPrice - curAtr * 2.5);
      
      const risk = currentPrice - stopLoss;
      // Target is 2x risk minimum, bounded by Bollinger Bands if possible, but forced 1:2
      target = currentPrice + risk * 2.5; 
      
      let recLeverage = Math.floor(Math.max(5, Math.min(20, (baseScore / 100) * 10)));
      const gainPct = (Math.abs(target - currentPrice) / currentPrice * 100).toFixed(2);
      
      return {
            leverage: recLeverage,
            score: baseScore,
            trend: 'bullish',
            params: { model: 'MultiConf', type: 'MACD+RSI+BB+EMA' },
            waves: null,
            channelPoints: [],
            flagPoints: [],
            entry: currentPrice,
            stopLoss: parseFloat(stopLoss.toFixed(4)),
            target: parseFloat(target.toFixed(4)),
            tradeStyle,
            termStyle,
            gainPct,
            reasoning: `[${tradeStyle} | BULLISH | MULTI-CONFIRMATION STRAT] Algorithmic Quantitative Setup.\n\nREASONING:\n${reason}\n\nTARGET: Target (${parseFloat(target.toFixed(4))}) aligned using a 1:2.5 Risk/Reward profile based on dynamic volatility limits.\n\nSTOP LOSS: Secured below major support zones and buffered using 2.5x ATR to avoid market maker stop hunts.`
      };
  }
  
  if (isBearish) {
      stopLoss = Math.max(curEma50 + curAtr, currentPrice + curAtr * 2.5);
      
      const risk = stopLoss - currentPrice;
      target = currentPrice - risk * 2.5; 
      
      let recLeverage = Math.floor(Math.max(5, Math.min(20, (baseScore / 100) * 10)));
      const gainPct = (Math.abs(currentPrice - target) / currentPrice * 100).toFixed(2);
      
      return {
            leverage: recLeverage,
            score: baseScore,
            trend: 'bearish',
            params: { model: 'MultiConf', type: 'MACD+RSI+BB+EMA' },
            waves: null,
            channelPoints: [],
            flagPoints: [],
            entry: currentPrice,
            stopLoss: parseFloat(stopLoss.toFixed(4)),
            target: parseFloat(target.toFixed(4)),
            tradeStyle,
            termStyle,
            gainPct,
            reasoning: `[${tradeStyle} | BEARISH | MULTI-CONFIRMATION STRAT] Algorithmic Quantitative Setup.\n\nREASONING:\n${reason}\n\nTARGET: Target (${parseFloat(target.toFixed(4))}) aligned using a 1:2.5 Risk/Reward profile based on dynamic volatility limits.\n\nSTOP LOSS: Secured above major resistance zones and buffered using 2.5x ATR to avoid market maker stop hunts.`
      };
  }

  return null;
}
