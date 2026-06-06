import crypto from 'crypto';
import axios from 'axios';

function getBaseUrl() {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  return isTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
}

function createSignature(queryString: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function retryOrder(fn: () => Promise<any>, retries = 5, delay = 800) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = e.response?.data?.msg || '';
      const code = e.response?.data?.code;
      if (
        i < retries - 1 &&
        (msg.includes('ReduceOnly') || code === -2022 || msg.includes('position'))
      ) {
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
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
    
    // Clear any previous leftover orders so they don't intervene with the new position
    try {
        const cancelAllQuery = `symbol=${symbol}&timestamp=${Date.now()}`;
        const cancelAllSig = createSignature(cancelAllQuery, secretKey);
        await axios.delete(`${baseUrl}/fapi/v1/allOpenOrders?${cancelAllQuery}&signature=${cancelAllSig}`, { headers: { 'X-MBX-APIKEY': apiKey } });
    } catch (e) {}

    const url = `${baseUrl}/fapi/v1/order?${queryString}`;
    const response = await axios.post(url, null, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    await new Promise(r => setTimeout(r, 1000)); // wait for market order to fill

    // To prevent "ReduceOnly Order is rejected" when placing new TP/SL, cancel old ones first
    try {
        const cancelAllQuery = `symbol=${symbol}&timestamp=${Date.now()}`;
        const cancelAllSig = createSignature(cancelAllQuery, secretKey);
        await axios.delete(`${baseUrl}/fapi/v1/allOpenOrders?${cancelAllQuery}&signature=${cancelAllSig}`, { headers: { 'X-MBX-APIKEY': apiKey } });
    } catch(e) {}

    // Fetch position to handle Hedge Mode correctly
    let posParams = '&closePosition=true';
    try {
        const positionQuery = `symbol=${symbol}&timestamp=${Date.now()}`;
        const positionSig = createSignature(positionQuery, secretKey);
        const positionRes = await axios.get(`${baseUrl}/fapi/v2/positionRisk?${positionQuery}&signature=${positionSig}`, { headers: { 'X-MBX-APIKEY': apiKey } });
        if (positionRes.data && positionRes.data.length > 0) {
            const position = positionRes.data.find((p: any) => parseFloat(p.positionAmt) !== 0);
            if (position) {
                const positionSide = position.positionSide || 'BOTH';
                if (positionSide !== 'BOTH') {
                    const qtyStr = position.positionAmt.startsWith('-') ? position.positionAmt.substring(1) : position.positionAmt;
                    posParams = `&positionSide=${positionSide}&quantity=${qtyStr}`;
                }
            }
        }
    } catch(e) {}

    // Native Binance Stop Loss / Take profit placement
    if (finalTP) {
      try {
        const tpSide = side === 'BUY' ? 'SELL' : 'BUY';
        let tpQuery = `symbol=${symbol}&side=${tpSide}&type=TAKE_PROFIT_MARKET&stopPrice=${finalTP}${posParams}&timestamp=${Date.now()}`;
        const tpSig = createSignature(tpQuery, secretKey);
        await retryOrder(() => axios.post(`${baseUrl}/fapi/v1/order?${tpQuery}&signature=${tpSig}`, null, { headers: { 'X-MBX-APIKEY': apiKey } }));
      } catch(e: any) { console.warn(`Failed to place native TP for ${symbol}:`, e.response?.data || e.message); }
    }

    if (finalSL) {
      try {
        const slSide = side === 'BUY' ? 'SELL' : 'BUY';
        let slQuery = `symbol=${symbol}&side=${slSide}&type=STOP_MARKET&stopPrice=${finalSL}${posParams}&timestamp=${Date.now()}`;
        const slSig = createSignature(slQuery, secretKey);
        await retryOrder(() => axios.post(`${baseUrl}/fapi/v1/order?${slQuery}&signature=${slSig}`, null, { headers: { 'X-MBX-APIKEY': apiKey } }));
      } catch(e: any) { console.warn(`Failed to place native SL for ${symbol}:`, e.response?.data || e.message); }
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
       const activePositions = positionRes.data.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
       
       if (activePositions.length > 0) {
           let openOrders: any = [];
           try {
              let ordersQuery = `timestamp=${Date.now()}`;
              const ordersSig = createSignature(ordersQuery, secretKey);
              const ordersRes = await axios.get(`${baseUrl}/fapi/v1/openOrders?${ordersQuery}&signature=${ordersSig}`, { headers: { 'X-MBX-APIKEY': apiKey } });
              openOrders = ordersRes.data;
           } catch(e) {}

           return activePositions.map((pos: any) => {
               const symbolOrders = openOrders.filter((o: any) => o.symbol === pos.symbol);
               const slOrder = symbolOrders.find((o: any) => o.type === 'STOP_MARKET' || o.type === 'STOP');
               const tpOrder = symbolOrders.find((o: any) => o.type === 'TAKE_PROFIT_MARKET' || o.type === 'TAKE_PROFIT');
               
               return {
                   symbol: pos.symbol,
                   amount: Math.abs(parseFloat(pos.positionAmt)),
                   side: parseFloat(pos.positionAmt) > 0 ? 'BUY' : 'SELL',
                   entryPrice: parseFloat(pos.entryPrice),
                   unRealizedProfit: parseFloat(pos.unRealizedProfit),
                   leverage: pos.leverage,
                   markPrice: parseFloat(pos.markPrice),
                   stopLoss: slOrder ? parseFloat(slOrder.stopPrice) : null,
                   takeProfit: tpOrder ? parseFloat(tpOrder.stopPrice) : null
               };
           });
       }
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
    return { success: false, message: "Binance API keys are not configured" };
  }

  const timestamp = Date.now();
  let queryString = `symbol=${symbol}&timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    // We check the open positions first to determine position direction and amount
    const baseUrl = getBaseUrl();
    
    // First, cancel all open orders for this symbol to avoid reduceOnly rejections
    let cancelQuery = `symbol=${symbol}&timestamp=${Date.now()}`;
    const cancelSig = createSignature(cancelQuery, secretKey);
    cancelQuery += `&signature=${cancelSig}`;
    
    await axios.delete(`${baseUrl}/fapi/v1/allOpenOrders?${cancelQuery}`, {
      headers: { 'X-MBX-APIKEY': apiKey }
    }).catch(e => console.warn(`[Binance] Cancel open orders ignored for ${symbol}`));

    // Wait for Binance matching engine to clear the open orders
    await new Promise(r => setTimeout(r, 1000));

    let positionQuery = `symbol=${symbol}&timestamp=${Date.now()}`;
    const positionSig = createSignature(positionQuery, secretKey);
    positionQuery += `&signature=${positionSig}`;

    const positionUrl = `${baseUrl}/fapi/v2/positionRisk?${positionQuery}`;
    const positionRes = await axios.get(positionUrl, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    
    if (positionRes.data && positionRes.data.length > 0) {
      const position = positionRes.data.find((p: any) => parseFloat(p.positionAmt) !== 0);
      if (position) {
        const positionAmt = parseFloat(position.positionAmt);
        const side = positionAmt > 0 ? 'SELL' : 'BUY';
        const qtyStr = position.positionAmt.startsWith('-') ? position.positionAmt.substring(1) : position.positionAmt;
        const positionSide = position.positionSide || 'BOTH';
        
        // Place market order to close
        let closeQueryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${qtyStr}`;
        if (positionSide !== 'BOTH') {
            closeQueryString += `&positionSide=${positionSide}`;
        } else {
            closeQueryString += `&reduceOnly=true`;
        }
        closeQueryString += `&timestamp=${Date.now()}`;
        const closeSignature = createSignature(closeQueryString, secretKey);
        closeQueryString += `&signature=${closeSignature}`;
        
        await retryOrder(() => axios.post(`${baseUrl}/fapi/v1/order?${closeQueryString}`, null, {
           headers: { 'X-MBX-APIKEY': apiKey },
        }));

        // Cancel all existing open orders (leftover TP/SL)
        try {
           const cancelAllQuery = `symbol=${symbol}&timestamp=${Date.now()}`;
           const cancelAllSig = createSignature(cancelAllQuery, secretKey);
           await axios.delete(`${baseUrl}/fapi/v1/allOpenOrders?${cancelAllQuery}&signature=${cancelAllSig}`, { headers: { 'X-MBX-APIKEY': apiKey } });
        } catch(err) {
           console.warn(`Failed to cancel all open orders for ${symbol} after close`, err);
        }

        return { success: true, message: `Closed position of ${qtyStr} ${symbol}` };
      }
    }
    return { success: false, message: 'No open position to close' };
  } catch (error: any) {
     console.error("Close position error:", error.response?.data || error.message);
     return { success: false, message: error.response?.data?.msg || 'Failed to close position on Binance' };
  }
}

export async function updateBinanceStopLoss(symbol: string, side: 'BUY' | 'SELL', stopLoss: number, customKey?: string, customSecret?: string) {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  const apiKey = customKey || (isTestnet ? process.env.BINANCE_TESTNET_API_KEY : process.env.BINANCE_API_KEY) || process.env.BINANCE_API_KEY;
  const secretKey = customSecret || (isTestnet ? process.env.BINANCE_TESTNET_SECRET_KEY : process.env.BINANCE_SECRET_KEY) || process.env.BINANCE_SECRET_KEY;
  
  if (!apiKey || !secretKey) return;

  const baseUrl = getBaseUrl();
  const exchangeInfo = await getExchangeInfo();
  let finalSL = stopLoss;

  if (exchangeInfo) {
    const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
    if (symbolInfo) {
      const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
      if (priceFilter) {
        finalSL = adjustPrecision(stopLoss, priceFilter.tickSize);
      }
    }
  }

  try {
    // 1. Cancel existing STOP_MARKET orders
    const openOrdersQuery = `symbol=${symbol}&timestamp=${Date.now()}`;
    const openOrdersSig = createSignature(openOrdersQuery, secretKey);
    const openOrders = await axios.get(`${baseUrl}/fapi/v1/openOrders?${openOrdersQuery}&signature=${openOrdersSig}`, { headers: { 'X-MBX-APIKEY': apiKey } });

    for (const order of openOrders.data) {
       if (order.type === 'STOP_MARKET') {
           const cancelQuery = `symbol=${symbol}&orderId=${order.orderId}&timestamp=${Date.now()}`;
           const cancelSig = createSignature(cancelQuery, secretKey);
           await axios.delete(`${baseUrl}/fapi/v1/order?${cancelQuery}&signature=${cancelSig}`, { headers: { 'X-MBX-APIKEY': apiKey } });
       }
    }

    // 2. Determine position mode and place order
    const positionQuery = `symbol=${symbol}&timestamp=${Date.now()}`;
    const positionSig = createSignature(positionQuery, secretKey);
    const positionRes = await axios.get(`${baseUrl}/fapi/v2/positionRisk?${positionQuery}&signature=${positionSig}`, { headers: { 'X-MBX-APIKEY': apiKey } });
    
    let posParams = '&closePosition=true';
    if (positionRes.data && positionRes.data.length > 0) {
      const position = positionRes.data.find((p: any) => parseFloat(p.positionAmt) !== 0);
      if (position) {
         const positionSide = position.positionSide || 'BOTH';
         if (positionSide !== 'BOTH') {
             const qtyStr = position.positionAmt.startsWith('-') ? position.positionAmt.substring(1) : position.positionAmt;
             posParams = `&positionSide=${positionSide}&quantity=${qtyStr}`;
         }
      }
    }

    const slSide = side === 'BUY' ? 'SELL' : 'BUY';
    const slQuery = `symbol=${symbol}&side=${slSide}&type=STOP_MARKET&stopPrice=${finalSL}${posParams}&timestamp=${Date.now()}`;
    const slSig = createSignature(slQuery, secretKey);
    await retryOrder(() => axios.post(`${baseUrl}/fapi/v1/order?${slQuery}&signature=${slSig}`, null, { headers: { 'X-MBX-APIKEY': apiKey } }));
    
  } catch(e: any) {
    console.warn(`[Binance] Failed to update trailing SL for ${symbol}`, e.response?.data || e.message);
  }
}
