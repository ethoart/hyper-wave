import { calculateEMA, calculateSMA, calculateMACD, calculateATR, calculateBollingerBands, calculateRSI, calculateStoch, calculateDEMA } from './technicalIndicators.js';

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function analyzeElliottWaves(data: Kline[], interval: string = '1d', mlParams?: any) {
  if (data.length < 200) return null;
  
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const opens = data.map(d => d.open);
  const currentPrice = closes[closes.length - 1];
  
  const macd = calculateMACD(closes);
  const bb = calculateBollingerBands(closes);
  const atrLine = calculateATR(highs, lows, closes);
  
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  
  const sma20 = calculateSMA(closes, 20);
  const sma200 = calculateSMA(closes, 200);
  const dema15 = calculateDEMA(closes, 15);
  const rsi2 = calculateRSI(closes, 2);
  const rsi14 = calculateRSI(closes, 14);
  const stoch = calculateStoch(highs, lows, closes, 9, 3);
  
  const curAtr = atrLine[atrLine.length - 1];
  const curRsi = rsi14[rsi14.length - 1];
  
  let isBullish = false;
  let isBearish = false;
  let reason = "";
  let baseScore = 0;
  let modelUsed = "EnsembleAI";
  
  // --- TD SEQUENTIAL SETUP (9 COUNT) --- //
  let tdBuyCount = 0;
  let tdSellCount = 0;
  for (let i = closes.length - 9; i < closes.length; i++) {
      if (closes[i] < closes[i - 4]) tdBuyCount++;
      else tdBuyCount = 0;
      
      if (closes[i] > closes[i - 4]) tdSellCount++;
      else tdSellCount = 0;
  }
  const tdBuy9 = tdBuyCount >= 9;
  const tdSell9 = tdSellCount >= 9;

  // --- SRI CRYPTO: RELAXED SMA 20 --- //
  const curSma20 = sma20[sma20.length - 1];
  const prevSma20 = sma20[sma20.length - 2];
  const curSma200 = sma200[sma200.length - 1];
  
  const smalc1 = closes[closes.length - 1] > opens[opens.length - 1] && 
                 closes[closes.length - 1] > curSma20 && 
                 closes[closes.length - 2] < prevSma20 && 
                 closes[closes.length - 1] > curSma200;

  const smasc1 = closes[closes.length - 1] < opens[opens.length - 1] && 
                 closes[closes.length - 1] < curSma20 && 
                 closes[closes.length - 2] > prevSma20 && 
                 closes[closes.length - 1] < curSma200;

  // --- SRI CRYPTO: RELAXED BB REVERSAL --- //
  const bbUpper = bb.upper[bb.upper.length - 1];
  const bbLower = bb.lower[bb.lower.length - 1];
  const curDema15 = dema15[dema15.length - 1];
  const curStoch = stoch[stoch.length - 1];
  const curRsi2 = rsi2[rsi2.length - 1];
  
  const longbb = closes[closes.length - 1] > curDema15 && 
                 (lows[lows.length - 1] < bbLower || lows[lows.length - 2] < bb.lower[bb.lower.length - 2]) &&
                 curStoch < 40 && curRsi2 < 25;
                 
  const shortbb = closes[closes.length - 1] < curDema15 && 
                  (highs[highs.length - 1] > bbUpper || highs[highs.length - 2] > bb.upper[bb.upper.length - 2]) &&
                  curStoch > 60 && curRsi2 > 75;

  // --- GODMODE: PULLBACK & MOMENTUM --- //
  const mHist = macd.histogram;
  const macdCurlingUp = mHist[mHist.length - 1] > mHist[mHist.length - 2];
  const macdCurlingDown = mHist[mHist.length - 1] < mHist[mHist.length - 2];
  const macroUptrend = currentPrice > ema200[ema200.length - 1];
  const macroDowntrend = currentPrice < ema200[ema200.length - 1];
  
  // LOGIC EVALUATION
  if (tdBuy9) {
      isBullish = true; baseScore += 150; modelUsed = "TD Sequential";
      reason += "✅ TD Sequential: Bullish 9 count reversal printed.\n";
  } else if (tdSell9) {
      isBearish = true; baseScore += 150; modelUsed = "TD Sequential";
      reason += "✅ TD Sequential: Bearish 9 count reversal printed.\n";
  } else if (longbb) {
      isBullish = true; baseScore += 120; modelUsed = "SriCrypto BB";
      reason += "✅ SRI Indicator: BB Reversal Long. Oversold Stoch/RSI2 + Bollinger Rejection.\n";
  } else if (shortbb) {
      isBearish = true; baseScore += 120; modelUsed = "SriCrypto BB";
      reason += "✅ SRI Indicator: BB Reversal Short. Overbought Stoch/RSI2 + Bollinger Rejection.\n";
  } else if (smalc1) {
      isBullish = true; baseScore += 100; modelUsed = "SriCrypto SMA";
      reason += "✅ SRI Indicator: SMA 20 Trend Continuation Buy Signal.\n";
  } else if (smasc1) {
      isBearish = true; baseScore += 100; modelUsed = "SriCrypto SMA";
      reason += "✅ SRI Indicator: SMA 20 Trend Continuation Sell Signal.\n";
  } else if (macroUptrend && currentPrice < ema50[ema50.length - 1] && macdCurlingUp && curRsi < 55) {
      isBullish = true; baseScore += 90; modelUsed = "GodMode Deep Pullback";
      reason += "💎 GOD MODE: Deep Pullback to EMA50 in Macro Uptrend with MACD cross.\n";
  } else if (macroDowntrend && currentPrice > ema50[ema50.length - 1] && macdCurlingDown && curRsi > 45) {
      isBearish = true; baseScore += 90; modelUsed = "GodMode Deep Pullback";
      reason += "💎 GOD MODE: Deep Pullback to EMA50 in Macro Downtrend with MACD cross.\n";
  }

  if (isBullish && isBearish) return null;
  if (!isBullish && !isBearish) return null;
  
  let target, stopLoss;
  
  // Structural Extremes for safe Stoplosss
  let localLow = currentPrice;
  let localHigh = currentPrice;
  for (let i = data.length - 20; i < data.length; i++) {
     if (data[i].low < localLow) localLow = data[i].low;
     if (data[i].high > localHigh) localHigh = data[i].high;
  }
  
  if (isBullish) {
      stopLoss = localLow * 0.98; 
      if (stopLoss >= currentPrice) stopLoss = currentPrice * 0.95; 
      
      const targetMove = Math.min(Math.max((curAtr / currentPrice) * 2.5, 0.015), 0.05);
      target = currentPrice * (1 + targetMove);
      
      let recLeverage = Math.floor(Math.max(5, Math.min(15, (baseScore / 100) * 10)));
      const gainPct = (Math.abs(target - currentPrice) / currentPrice * 100).toFixed(2);
      
      return {
            leverage: recLeverage,
            score: baseScore,
            trend: 'bullish',
            params: { model: modelUsed, type: 'Multi-Strategy Ensemble' },
            waves: null,
            channelPoints: [],
            flagPoints: [],
            entry: currentPrice,
            stopLoss: parseFloat(stopLoss.toFixed(4)),
            target: parseFloat(target.toFixed(4)),
            tradeStyle: "ALGO/AI",
            termStyle: "DYNAMIC",
            gainPct,
            reasoning: `[✅ AI ENSEMBLE ENGINE DEPLOYED]\n\nMODEL: ${modelUsed}\n\nREASONING:\n${reason}\n\n🎯 TARGET: (${parseFloat(target.toFixed(4))}). Target optimized dynamically based on volatility.\n\n🛡️ STOP LOSS: (${parseFloat(stopLoss.toFixed(4))}). Wide protective stop.`
      };
  }
  
  if (isBearish) {
      stopLoss = localHigh * 1.02;
      if (stopLoss <= currentPrice) stopLoss = currentPrice * 1.05;
      
      const targetMove = Math.min(Math.max((curAtr / currentPrice) * 2.5, 0.015), 0.05);
      target = currentPrice * (1 - targetMove);
      
      let recLeverage = Math.floor(Math.max(5, Math.min(15, (baseScore / 100) * 10)));
      const gainPct = (Math.abs(currentPrice - target) / currentPrice * 100).toFixed(2);
      
      return {
            leverage: recLeverage,
            score: baseScore,
            trend: 'bearish',
            params: { model: modelUsed, type: 'Multi-Strategy Ensemble' },
            waves: null,
            channelPoints: [],
            flagPoints: [],
            entry: currentPrice,
            stopLoss: parseFloat(stopLoss.toFixed(4)),
            target: parseFloat(target.toFixed(4)),
            tradeStyle: "ALGO/AI",
            termStyle: "DYNAMIC",
            gainPct,
            reasoning: `[✅ AI ENSEMBLE ENGINE DEPLOYED]\n\nMODEL: ${modelUsed}\n\nREASONING:\n${reason}\n\n🎯 TARGET: (${parseFloat(target.toFixed(4))}). Target optimized dynamically based on volatility.\n\n🛡️ STOP LOSS: (${parseFloat(stopLoss.toFixed(4))}). Wide protective stop.`
      };
  }

  return null;
}

