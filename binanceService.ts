import crypto from 'crypto';
import axios from 'axios';

function getBaseUrl() {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  return isTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
}

function createSignature(queryString: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

let exchangeInfoCache: any = null;

async function getExchangeInfo() {
  if (exchangeInfoCache) return exchangeInfoCache;
  try {
    const baseUrl = getBaseUrl();
    const res = await axios.get(`${baseUrl}/fapi/v1/exchangeInfo`);
    exchangeInfoCache = res.data;
    return exchangeInfoCache;
  } catch (err) {
    console.warn("Failed to fetch exchange info");
    return null;
  }
}

function adjustPrecision(value: number, stepSize: string) {
  const step = parseFloat(stepSize);
  const precisionStr = stepSize.indexOf('.') >= 0 ? stepSize.split('.')[1].replace(/0+$/, '') : '';
  const precision = precisionStr.length;
  // Use floor/round to step to ensure perfectly aligned quantities
  const rounded = Math.round(value / step) * step;
  return parseFloat(rounded.toFixed(precision));
}

export async function setBinanceLeverage(symbol: string, leverage: number, customKey?: string, customSecret?: string) {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  const apiKey = customKey || (isTestnet ? process.env.BINANCE_TESTNET_API_KEY : process.env.BINANCE_API_KEY) || process.env.BINANCE_API_KEY;
  const secretKey = customSecret || (isTestnet ? process.env.BINANCE_TESTNET_SECRET_KEY : process.env.BINANCE_SECRET_KEY) || process.env.BINANCE_SECRET_KEY;
  
  if (!apiKey || !secretKey) return;

  const timestamp = Date.now();
  let queryString = `symbol=${symbol}&leverage=${leverage}&timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/fapi/v1/leverage?${queryString}`;
    await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
  } catch (error: any) {
    console.warn("Failed to set leverage:", error.response?.data?.msg || error.message);
  }
}

export async function placeBinanceTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, type: string = 'MARKET', stopLoss?: number, takeProfit?: number, customKey?: string, customSecret?: string) {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  const apiKey = customKey || (isTestnet ? process.env.BINANCE_TESTNET_API_KEY : process.env.BINANCE_API_KEY) || process.env.BINANCE_API_KEY;
  const secretKey = customSecret || (isTestnet ? process.env.BINANCE_TESTNET_SECRET_KEY : process.env.BINANCE_SECRET_KEY) || process.env.BINANCE_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    throw new Error("Binance API keys are not configured in .env");
  }

  const exchangeInfo = await getExchangeInfo();
  let finalQty = quantity;
  let finalSL = stopLoss;
  let finalTP = takeProfit;

  if (exchangeInfo) {
    const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
    if (symbolInfo) {
      const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
      if (lotSizeFilter) finalQty = adjustPrecision(quantity, lotSizeFilter.stepSize);

      const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
      if (priceFilter) {
        if (stopLoss) finalSL = adjustPrecision(stopLoss, priceFilter.tickSize);
        if (takeProfit) finalTP = adjustPrecision(takeProfit, priceFilter.tickSize);
      }
    }
  }

  const timestamp = Date.now();
  let queryString = `symbol=${symbol}&side=${side}&type=${type}&quantity=${finalQty}&timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/fapi/v1/order?${queryString}`;
    const response = await axios.post(url, null, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    await new Promise(r => setTimeout(r, 1000)); // wait for market order to fill

    // Place Stop Loss order if provided
    if (finalSL) {
      const slSide = side === 'BUY' ? 'SELL' : 'BUY';
      const slTimestamp = Date.now();
      let slQuery = `symbol=${symbol}&side=${slSide}&type=STOP_MARKET&stopPrice=${finalSL}&closePosition=true&recvWindow=5000&timestamp=${slTimestamp}`;
      const slSig = createSignature(slQuery, secretKey);
      await axios.post(`${baseUrl}/fapi/v1/order?${slQuery}&signature=${slSig}`, null, { headers: { 'X-MBX-APIKEY': apiKey } }).catch(e => console.error('SL failed', e.response?.data));
    }

    // Place Take Profit order if provided
    if (finalTP) {
      const tpSide = side === 'BUY' ? 'SELL' : 'BUY';
      const tpTimestamp = Date.now();
      let tpQuery = `symbol=${symbol}&side=${tpSide}&type=TAKE_PROFIT_MARKET&stopPrice=${finalTP}&closePosition=true&recvWindow=5000&timestamp=${tpTimestamp}`;
      const tpSig = createSignature(tpQuery, secretKey);
      await axios.post(`${baseUrl}/fapi/v1/order?${tpQuery}&signature=${tpSig}`, null, { headers: { 'X-MBX-APIKEY': apiKey } }).catch(e => console.error('TP failed', e.response?.data));
    }

    return response.data;
  } catch (error: any) {
    console.error("Binance Trade Error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.msg || 'Failed to place testnet trade');
  }
}

export async function getBinanceBalance(customKey?: string, customSecret?: string) {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  const apiKey = customKey || (isTestnet ? process.env.BINANCE_TESTNET_API_KEY : process.env.BINANCE_API_KEY) || process.env.BINANCE_API_KEY;
  const secretKey = customSecret || (isTestnet ? process.env.BINANCE_TESTNET_SECRET_KEY : process.env.BINANCE_SECRET_KEY) || process.env.BINANCE_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    return null;
  }

  const timestamp = Date.now();
  let queryString = `timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/fapi/v2/account?${queryString}`;
    const response = await axios.get(url, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });
    // Find USDT balance
    const usdtAsset = response.data.assets.find((a: any) => a.asset === 'USDT');
    return usdtAsset ? parseFloat(usdtAsset.walletBalance) : 0;
  } catch (error: any) {
    console.error("Binance Balance Error:", error.response?.data || error.message);
    return null;
  }
}

export async function getBinancePositions(customKey?: string, customSecret?: string) {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  const apiKey = customKey || (isTestnet ? process.env.BINANCE_TESTNET_API_KEY : process.env.BINANCE_API_KEY) || process.env.BINANCE_API_KEY;
  const secretKey = customSecret || (isTestnet ? process.env.BINANCE_TESTNET_SECRET_KEY : process.env.BINANCE_SECRET_KEY) || process.env.BINANCE_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    return [];
  }

  const timestamp = Date.now();
  let queryString = `timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    const baseUrl = getBaseUrl();
    const positionUrl = `${baseUrl}/fapi/v2/positionRisk?${queryString}`;
    const positionRes = await axios.get(positionUrl, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    
    if (positionRes.data && positionRes.data.length > 0) {
       return positionRes.data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0).map((pos: any) => ({
           symbol: pos.symbol,
           amount: Math.abs(parseFloat(pos.positionAmt)),
           side: parseFloat(pos.positionAmt) > 0 ? 'BUY' : 'SELL',
           entryPrice: parseFloat(pos.entryPrice),
           unRealizedProfit: parseFloat(pos.unRealizedProfit),
           leverage: pos.leverage,
           markPrice: parseFloat(pos.markPrice)
       }));
    }
    return [];
  } catch(error: any) {
    console.error("Binance Position Error:", error.response?.data || error.message);
    return [];
  }
}

export async function closeBinancePosition(symbol: string, customKey?: string, customSecret?: string) {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  const apiKey = customKey || (isTestnet ? process.env.BINANCE_TESTNET_API_KEY : process.env.BINANCE_API_KEY) || process.env.BINANCE_API_KEY;
  const secretKey = customSecret || (isTestnet ? process.env.BINANCE_TESTNET_SECRET_KEY : process.env.BINANCE_SECRET_KEY) || process.env.BINANCE_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    throw new Error("Binance API keys are not configured in .env");
  }

  const timestamp = Date.now();
  let queryString = `symbol=${symbol}&timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    // We check the open positions first to determine position direction and amount
    const baseUrl = getBaseUrl();
    const positionUrl = `${baseUrl}/fapi/v2/positionRisk?${queryString}`;
    const positionRes = await axios.get(positionUrl, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    
    if (positionRes.data && positionRes.data.length > 0) {
      const position = positionRes.data[0];
      const positionAmt = parseFloat(position.positionAmt);
      if (positionAmt !== 0) {
        const side = positionAmt > 0 ? 'SELL' : 'BUY';
        const qty = Math.abs(positionAmt);
        
        // Place market order to close
        let closeQueryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${qty}&reduceOnly=true&timestamp=${Date.now()}`;
        const closeSignature = createSignature(closeQueryString, secretKey);
        closeQueryString += `&signature=${closeSignature}`;
        
        await axios.post(`${baseUrl}/fapi/v1/order?${closeQueryString}`, null, {
           headers: { 'X-MBX-APIKEY': apiKey },
        });
        return { success: true, message: `Closed position of ${qty} ${symbol}` };
      }
    }
    return { success: false, message: 'No open position to close' };
  } catch (error: any) {
     console.error("Close position error:", error.response?.data || error.message);
     throw new Error(error.response?.data?.msg || 'Failed to close position');
  }
}
