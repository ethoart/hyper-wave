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
