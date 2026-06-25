export function calculateEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

export function calculateSMA(data: number[], period: number): number[] {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(data[i]); // Use latest or build up
        } else {
            const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val, 0);
            sma.push(sum / period);
        }
    }
    return sma;
}

export function calculateMACD(data: number[], fast: number = 12, slow: number = 26, signal: number = 9) {
    const fastEma = calculateEMA(data, fast);
    const slowEma = calculateEMA(data, slow);
    const macdLine = [];
    for (let i = 0; i < data.length; i++) {
        macdLine.push(fastEma[i] - slowEma[i]);
    }
    const signalLine = calculateEMA(macdLine, signal);
    const histogram = [];
    for (let i = 0; i < data.length; i++) {
        histogram.push(macdLine[i] - signalLine[i]);
    }
    return { macdLine, signalLine, histogram };
}

export function calculateBollingerBands(data: number[], period: number = 20, multiplier: number = 2) {
    const sma = calculateSMA(data, period);
    const upper = [];
    const lower = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            upper.push(data[i]);
            lower.push(data[i]);
        } else {
            const slice = data.slice(i - period + 1, i + 1);
            const mean = sma[i];
            const sumSq = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
            const std = Math.sqrt(sumSq / period);
            upper.push(mean + multiplier * std);
            lower.push(mean - multiplier * std);
        }
    }
    return { upper, lower, sma };
}

export function calculateATR(high: number[], low: number[], close: number[], period: number = 14) {
    const tr = [high[0] - low[0]];
    for (let i = 1; i < high.length; i++) {
        const tr1 = high[i] - low[i];
        const tr2 = Math.abs(high[i] - close[i - 1]);
        const tr3 = Math.abs(low[i] - close[i - 1]);
        tr.push(Math.max(tr1, tr2, tr3));
    }
    return calculateEMA(tr, period);
}

export function calculateRSI(data: number[], period: number = 14): number[] {
    if (data.length <= period) return Array(data.length).fill(50);
    const rsi = [];
    let gains = 0, losses = 0;
    
    for (let i = 1; i <= period; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    const initialRSI = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    
    const fullRsi = Array(period).fill(initialRSI);
    fullRsi.push(initialRSI);
    
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        
        if (avgLoss === 0) {
             fullRsi.push(100);
        } else {
             fullRsi.push(100 - (100 / (1 + avgGain / avgLoss)));
        }
    }
    return fullRsi;
}

export function calculateDEMA(data: number[], period: number): number[] {
    const e1 = calculateEMA(data, period);
    const e2 = calculateEMA(e1, period);
    const dema = [];
    for (let i = 0; i < data.length; i++) {
        dema.push(2 * e1[i] - e2[i]);
    }
    return dema;
}

export function calculateStoch(highs: number[], lows: number[], closes: number[], periodK: number = 9, smoothK: number = 3): number[] {
    const rawK = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < periodK - 1) {
            rawK.push(50);
        } else {
            const highSlice = highs.slice(i - periodK + 1, i + 1);
            const lowSlice = lows.slice(i - periodK + 1, i + 1);
            const highestHigh = Math.max(...highSlice);
            const lowestLow = Math.min(...lowSlice);
            
            if (highestHigh === lowestLow) {
                rawK.push(50);
            } else {
                rawK.push(((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100);
            }
        }
    }
    return calculateSMA(rawK, smoothK);
}
