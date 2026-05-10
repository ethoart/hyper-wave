import crypto from 'crypto';
import axios from 'axios';

const TESTNET_URL = 'https://testnet.binancefuture.com';

function createSignature(queryString: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

export async function placeBinanceTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, type: string = 'MARKET') {
  const apiKey = process.env.BINANCE_TESTNET_API_KEY;
  const secretKey = process.env.BINANCE_TESTNET_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    throw new Error("Binance Testnet API keys are not configured in .env");
  }

  const timestamp = Date.now();
  let queryString = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    const url = `${TESTNET_URL}/fapi/v1/order?${queryString}`;
    const response = await axios.post(url, null, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });
    return response.data;
  } catch (error: any) {
    console.error("Binance Trade Error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.msg || 'Failed to place testnet trade');
  }
}

export async function getBinanceBalance() {
  const apiKey = process.env.BINANCE_TESTNET_API_KEY;
  const secretKey = process.env.BINANCE_TESTNET_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    return null;
  }

  const timestamp = Date.now();
  let queryString = `timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    const url = `${TESTNET_URL}/fapi/v2/account?${queryString}`;
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

export async function closeBinancePosition(symbol: string) {
  const apiKey = process.env.BINANCE_TESTNET_API_KEY;
  const secretKey = process.env.BINANCE_TESTNET_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    throw new Error("Binance Testnet API keys are not configured in .env");
  }

  const timestamp = Date.now();
  let queryString = `symbol=${symbol}&timestamp=${timestamp}`;
  const signature = createSignature(queryString, secretKey);
  queryString += `&signature=${signature}`;

  try {
    // We check the open positions first to determine position direction and amount
    const positionUrl = `${TESTNET_URL}/fapi/v2/positionRisk?${queryString}`;
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
        
        await axios.post(`${TESTNET_URL}/fapi/v1/order?${closeQueryString}`, null, {
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
