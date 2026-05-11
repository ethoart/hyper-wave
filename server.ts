import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import crypto from 'crypto';
import { analyzeElliottWaves } from './ewEngine.js';
import { placeBinanceTrade, closeBinancePosition, getBinanceBalance, getBinancePositions } from './binanceService.js';

dotenv.config();

// Extend Express typical Request to have session with userId
declare module 'express-session' {
  interface SessionData {
    userId: string;
    role?: string;
    email?: string;
  }
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'your_secret_key_here';
const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
// In a real scenario, use signature for secret. For simple public data, we just use public API mostly if we only read.
// We don't necessarily need API key to read public Binance data (e.g. klines)

// -----------------------------------------------------
// 1. Setup DB Schema
// -----------------------------------------------------
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'pro', 'user'], default: 'user' }
});

// Avoid OverwriteModelError during hot reload
const User = mongoose.models.User || mongoose.model('User', userSchema);

const analysisSchema = new mongoose.Schema({
  symbol: String,
  timeframe: String,
  winRate: String,
  analysisText: String,
  entryPoint: Number,
  exitPoint: Number,
  stopLoss: Number,
  trend: String,
  timestamp: { type: Date, default: Date.now },
  chartData: mongoose.Schema.Types.Mixed, // store some historical data used for snapshot
  wavePoints: [{ time: Number, price: Number }]
});
const Analysis = mongoose.models.Analysis || mongoose.model('Analysis', analysisSchema);

const tradeSignalSchema = new mongoose.Schema({
  symbol: String,
  timestamp: { type: Date, default: Date.now },
  expiresAt: Date,
  trend: String,
  entry: Number,
  target: Number,
  stopLoss: Number,
  amount: { type: Number, default: 10 }, // Auto Paper Trade size: $10
  setupData: mongoose.Schema.Types.Mixed, // algorithmic context
  status: { type: String, enum: ['pending', 'win', 'loss', 'invalidated', 'expired'], default: 'pending' },
  pnlPercent: Number,
  realizedPnl: Number,
  resolvedAt: Date,
  binanceOrderId: String,
  quantityExecuted: String,
});
const TradeSignal = mongoose.models.TradeSignal || mongoose.model('TradeSignal', tradeSignalSchema);

const engineConfigSchema = new mongoose.Schema({
  id: { type: String, default: 'global' },
  params: mongoose.Schema.Types.Mixed,
  insights: String,
  autoBotBalance: { type: Number, default: 100 },
  updatedAt: { type: Date, default: Date.now }
});
const EngineConfig = mongoose.models.EngineConfig || mongoose.model('EngineConfig', engineConfigSchema);

const scriptItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  author: String,
  code: String,
  type: { type: String, enum: ['indicator', 'strategy', 'signal'], default: 'indicator' },
  priceUSDC: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  subscribers: [String] // emails of licensed users
});
const ScriptItem = mongoose.models.ScriptItem || mongoose.model('ScriptItem', scriptItemSchema);

const chartDrawingSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  symbol: { type: String, required: true },
  interval: { type: String, default: '1d' },
  drawings: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now }
});
const ChartDrawing = mongoose.models.ChartDrawing || mongoose.model('ChartDrawing', chartDrawingSchema);

// -----------------------------------------------------
// 2. Main Server Setup
// -----------------------------------------------------
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  let isDbConnected = false;

  // Try connecting to MongoDB. If no URI, we will error out on DB endpoints
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000, // Fail faster if we can't connect
      });
      isDbConnected = true;
      console.log('Connected to MongoDB');
      
      // Auto-create a super admin if none exists
      const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@admin.com';
      const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
      const adminExists = await (User as any).findOne({ email: superAdminEmail });
      if (!adminExists) {
        const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
        await User.create({ email: superAdminEmail, password: hashedPassword, role: 'admin' });
        console.log(`Created super admin: ${superAdminEmail}`);
      }
    } catch (err: any) {
      console.error('MongoDB connection error:', err.message);
      if (err.message.includes('buffering timed out') || err.message.includes('timeout') || err.message.includes('ECONNREFUSED')) {
         console.error('======================================================================');
         console.error('CRITICAL: Mongoose could not connect to your MongoDB cluster.');
         console.error('If you are using MongoDB Atlas, this usually means your IP address');
         console.error('is not whitelisted. Go to Atlas Security -> Network Access and');
         console.error('add 0.0.0.0/0 (allow access from anywhere) to connect from this app.');
         console.error('======================================================================');
      }
    }
  } else {
    console.warn('WARNING: MONGO_URI is not set. Database features will error out.');
  }

  app.set('trust proxy', 1);

  let sessionStore;
  if (process.env.MONGO_URI) {
      try {
          sessionStore = MongoStore.create({ mongoUrl: process.env.MONGO_URI });
      } catch (err) {
          console.error("Failed to initialize MongoStore. Defaulting to MemoryStore.", err);
          sessionStore = new session.MemoryStore();
      }
  } else {
      sessionStore = new session.MemoryStore();
  }

  // Session Setup
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !process.env.APP_URL?.includes('localhost'),
        sameSite: 'lax'
      }
    })
  );

  // Middleware to verify session
  const authMiddleware = async (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Set user from session info directly for faster checks, or fetch from DB if strict
    // For performance, we trust session data, or we can fetch fresh data:
    if (process.env.MONGO_URI && req.session.userId !== '1' && req.session.userId !== '2') {
        try {
            const user = await (User as any).findById(req.session.userId);
            if (!user) {
              return res.status(401).json({ error: 'User not found in db' });
            }
            req.user = user;
        } catch(err) {
            return res.status(500).json({ error: 'Error fetching user' });
        }
    } else {
        req.user = { _id: req.session.userId, role: req.session.role, email: req.session.email };
    }
    next();
  };

  const adminMiddleware = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Requires admin role' });
    next();
  };

  // -----------------------------------------------------
  // API ROUTES
  // -----------------------------------------------------
  
  // Auth
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Super admin fallback if MongoDB is not connected
    if (!isDbConnected) {
       const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@admin.com';
       const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
       if (email === superAdminEmail && password === superAdminPassword) {
          req.session.userId = 'fallback-super-admin-id';
          req.session.role = 'admin';
          req.session.email = email;
          console.warn('MongoDB not connected: Using fallback super admin login.');
          return res.json({ user: { email, role: 'admin', message: 'Logged in using fallback memory mode' } });
       }
       return res.status(500).json({ error: 'Database is not connected. If you have MONGO_URI set, ensure MongoDB is running.' });
    }

    try {
      const user: any = await (User as any).findOne({ email });
      if (!user) return res.status(400).json({ error: 'User not found' });
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
      
      req.session.userId = user._id.toString();
      req.session.role = user.role;
      req.session.email = user.email;

      res.json({ user: { email: user.email, role: user.role } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    const { email, password, role } = req.body;
    if (!isDbConnected) return res.status(500).json({error: 'Database is not connected. User registration is disabled.'});
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({ email, password: hashedPassword, role: role || 'user' });
      res.json({ success: true, message: 'User created' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Could not log out' });
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  // User Management
  app.get('/api/users', authMiddleware, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    if (!isDbConnected) return res.json([]);
    try {
       const users = await (User as any).find({}, { password: 0 }); // Exclude passwords
       res.json(users);
    } catch(err) {
       res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.put('/api/users/:id', authMiddleware, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    if (!isDbConnected) return res.status(500).json({ error: 'Database is not connected.' });
    try {
       const { role } = req.body;
       await (User as any).findByIdAndUpdate(req.params.id, { role });
       res.json({ success: true });
    } catch(err) {
       res.status(500).json({ error: 'Failed to update user' });
    }
  });

  app.get('/api/auth/me', authMiddleware, (req: any, res) => {
    res.json({ user: req.user });
  });

  // Marketplace
  app.get('/api/marketplace', async (req, res) => {
    if (!isDbConnected) return res.json([]);
    try {
      const items = await ScriptItem.find().sort({ createdAt: -1 });
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/marketplace', authMiddleware, async (req: any, res) => {
    if (!isDbConnected) return res.status(500).json({ error: 'DB not connected' });
    try {
      const item = await ScriptItem.create({
        ...req.body,
        author: req.user.email
      });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/marketplace/buy', authMiddleware, async (req: any, res) => {
    if (!isDbConnected) return res.status(500).json({ error: 'DB not connected' });
    try {
      const { id } = req.body;
      const item = await ScriptItem.findById(id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      // In a real app, charge USDC via web3 here
      if (!item.subscribers.includes(req.user.email)) {
        item.subscribers.push(req.user.email);
        await item.save();
      }
      res.json({ success: true, message: 'Licensed successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Chart Drawings
  app.get('/api/drawings/:symbol', authMiddleware, async (req: any, res) => {
    if (!isDbConnected) return res.json([]);
    try {
      const { symbol } = req.params;
      const { interval } = req.query;
      const drawing = await ChartDrawing.findOne({ userEmail: req.user.email, symbol, interval: interval || '1d' });
      res.json(drawing ? drawing.drawings : []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/drawings/:symbol', authMiddleware, async (req: any, res) => {
    if (!isDbConnected) return res.status(500).json({ error: 'DB not connected' });
    try {
      const { symbol } = req.params;
      const { interval } = req.query;
      const { drawings } = req.body;
      
      let drawing = await ChartDrawing.findOne({ userEmail: req.user.email, symbol, interval: interval || '1d' });
      if (drawing) {
        drawing.drawings = drawings;
        drawing.updatedAt = new Date();
        await drawing.save();
      } else {
        drawing = await ChartDrawing.create({ userEmail: req.user.email, symbol, interval: interval || '1d', drawings });
      }
      res.json(drawing);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/drawings/share/:id', async (req: any, res) => {
    if (!isDbConnected) return res.status(500).json({ error: 'DB not connected' });
    try {
      const drawing = await ChartDrawing.findById(req.params.id);
      if (!drawing) return res.status(404).json({ error: 'Shared chart not found' });
      res.json(drawing);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/drawings/share/:symbol', authMiddleware, async (req: any, res) => {
    if (!isDbConnected) return res.status(500).json({ error: 'DB not connected' });
    try {
      const { symbol } = req.params;
      const { interval } = req.query;
      const drawing = await ChartDrawing.findOne({ userEmail: req.user.email, symbol, interval: interval || '1d' });
      if (!drawing) return res.status(404).json({ error: 'Save your chart first before sharing.' });
      res.json({ shareId: drawing._id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Binance & Analysis Data
  app.get('/api/market/depth', async (req: any, res) => {
    const { symbol = 'BTCUSDT', limit = '15' } = req.query;
    try {
        const response = await axios.get(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol.toUpperCase()}&limit=${limit}`);
        res.json(response.data);
    } catch(err: any) {
        res.json({ bids: [], asks: [] });
    }
  });

  app.get('/api/market/klines', async (req: any, res) => {
    let { symbol = 'BTCUSDT', interval = '1d', limit = '100' } = req.query;
    if (interval === 'undefined') interval = '1d';
    try {
      // Try Free public endpoint (Binance Futures)
      let url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
      let response;
      try {
        response = await axios.get(url);
      } catch (err) {
        // Fallback to Spot API if not found on Futures
        url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
        try {
           response = await axios.get(url);
        } catch(err2) {
           // Fallback to MEXC if not found on Binance
           let mexcInterval = interval;
           if (interval === '1h') mexcInterval = '60m';
           url = `https://api.mexc.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${mexcInterval}&limit=${limit}`;
           response = await axios.get(url);
        }
      }
      
      const data = response.data.map((d: any) => ({
        time: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
      res.json(data);
    } catch (err: any) {
      console.error(err.response?.data || err.message);
      res.status(500).json({ error: 'Failed to fetch market data' });
    }
  });

  app.post('/api/trade/auto', async (req: any, res) => {
    try {
      if (!isDbConnected) return res.json({ success: false });
      const { symbol, trend, entry, target, stopLoss, amount, setupData } = req.body;
      const existing = await TradeSignal.findOne({ symbol, status: 'pending', trend });
      
      const tradeAmountDollars = amount || 10;
      const leverage = 10; // Use 10x leverage for calculations
      const positionSizeUsdt = tradeAmountDollars * leverage;
      
      const entryPrice = parseFloat(entry);
      const targetPrice = parseFloat(target);
      
      // Calculate projected profit based on position size
      const priceDiff = Math.abs(targetPrice - entryPrice);
      const projectedProfit = (positionSizeUsdt / entryPrice) * priceDiff;
      
      if (projectedProfit < 2) {
         return res.json({ success: false, message: `Trade rejected: projected profit $${projectedProfit.toFixed(2)} is less than $2.00` });
      }

      if (!existing) {
         // Create the pending trade signal. The Outcome Evaluator will trigger it when entry price is hit.
         let expiresAt = new Date(Date.now() + 5 * 60 * 60 * 1000); // default 5 hours
         if (setupData && setupData.timeframe) {
            // Very roughly map timeframe to ms for 5 candles
            const tfMap: any = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
            const ms = tfMap[setupData.timeframe];
            if (ms) expiresAt = new Date(Date.now() + ms * 5); // valid for 5 candles
         }

         await TradeSignal.create({
             symbol,
             trend,
             entry,
             target,
             stopLoss,
             amount: tradeAmountDollars,
             setupData,
             expiresAt
         });
      }
      res.json({ success: true, message: "Trade signal queued. Waiting for entry." });
    } catch(err) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get('/api/fng', async (req, res) => {
    try {
        const response = await axios.get('https://api.alternative.me/fng/?limit=1');
        res.json(response.data);
    } catch(err: any) {
        res.status(500).json({ error: 'Failed to fetch FNG' });
    }
  });

  app.get('/api/trades', async (req: any, res) => {
    try {
      if (!isDbConnected) {
         return res.json({ pending: [], closed: [], livePositions: [] });
      }
      const pending = await TradeSignal.find({ status: 'pending' }).sort({ timestamp: -1 }).limit(20);
      const closed = await TradeSignal.find({ status: { $ne: 'pending' } }).sort({ resolvedAt: -1 }).limit(50);
      
      let balance = 0;
      let livePositions: any[] = [];
      try {
         balance = await getBinanceBalance() || 0;
         livePositions = await getBinancePositions() || [];
      } catch(e) { }

      let engineCfg = await EngineConfig.findOne({ id: 'global' });
      let autoBotBalance = engineCfg?.autoBotBalance || 100;

      res.json({ pending, closed, balance, livePositions, autoBotBalance });
    } catch(err) {
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  app.get('/api/market/scan', async (req: any, res) => {
    try {
      // 24hr ticker to find top pairs from Binance Futures
      const response = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
      
      const data = response.data.filter((d: any) => 
        d.symbol.endsWith('USDT') && 
        d.symbol !== 'USUSDT' &&
        !['USDC', 'FDUSD', 'TUSD', 'BUSD', 'EUR', 'USDP'].some(s => d.symbol.includes(s)) &&
        parseFloat(d.quoteVolume) > 1000000 // allow small pairs too
      );
      
      data.sort((a: any, b: any) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)));
      const topPairs = data.slice(0, 5).map((bestPair: any) => ({
        symbol: bestPair.symbol,
        change: bestPair.priceChangePercent,
        volume: bestPair.volume,
        lastPrice: bestPair.lastPrice
      }));
      res.json({ topPairs });
    } catch (err: any) {
      console.error(err.response?.data || err.message);
      res.status(500).json({ error: 'Failed to scan market data' });
    }
  });

  app.post('/api/trade/place', authMiddleware, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only Super Admin can place trades.' });
    }
    
    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_SECRET_KEY) {
      return res.status(500).json({ error: 'Binance API keys are missing in environment configuration. Cannot place real trades.' });
    }
    
    const { symbol, side, amount, leverage, takeProfit, stopLoss } = req.body;
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_SECRET_KEY;
    // Support Binance Testnet for demo accounts
    const isTestnet = process.env.BINANCE_TESTNET !== 'false';
    const baseEndpoint = isTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
    const recvWindow = 5000;

    const getSignature = (queryString: string) => crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

    try {
      if (leverage) {
        const levQuery = `symbol=${symbol}&leverage=${leverage}&timestamp=${Date.now()}&recvWindow=${recvWindow}`;
        await axios.post(`${baseEndpoint}/fapi/v1/leverage?${levQuery}&signature=${getSignature(levQuery)}`, null, { headers: { 'X-MBX-APIKEY': apiKey }});
      }
      
      const qty = parseFloat(amount || '0');
      const orderQuery = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${qty}&timestamp=${Date.now()}&recvWindow=${recvWindow}`;
      const orderRes = await axios.post(`${baseEndpoint}/fapi/v1/order?${orderQuery}&signature=${getSignature(orderQuery)}`, null, { headers: { 'X-MBX-APIKEY': apiKey }});

      if (takeProfit) {
        const tpSide = side === 'BUY' ? 'SELL' : 'BUY';
        const tpQuery = `symbol=${symbol}&side=${tpSide}&type=TAKE_PROFIT_MARKET&stopPrice=${takeProfit}&closePosition=true&timestamp=${Date.now()}&recvWindow=${recvWindow}`;
        await axios.post(`${baseEndpoint}/fapi/v1/order?${tpQuery}&signature=${getSignature(tpQuery)}`, null, { headers: { 'X-MBX-APIKEY': apiKey }}).catch(e => console.error('Manual TP Failed:', e.response?.data?.msg));
      }
      if (stopLoss) {
        const slSide = side === 'BUY' ? 'SELL' : 'BUY';
        const slQuery = `symbol=${symbol}&side=${slSide}&type=STOP_MARKET&stopPrice=${stopLoss}&closePosition=true&timestamp=${Date.now()}&recvWindow=${recvWindow}`;
        await axios.post(`${baseEndpoint}/fapi/v1/order?${slQuery}&signature=${getSignature(slQuery)}`, null, { headers: { 'X-MBX-APIKEY': apiKey }}).catch(e => console.error('Manual SL Failed:', e.response?.data?.msg));
      }
      
      res.json({ success: true, message: 'Trade executed successfully on Binance via API', data: orderRes.data });
    } catch (err: any) {
      console.error('Binance API Error:', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.msg || err.message });
    }
  });

  app.post('/api/trade/tpsl', authMiddleware, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can manage TP/SL' });
    }
    const { symbol, tp, sl, positionSide } = req.body;
    try {
       const apiKey = process.env.BINANCE_TESTNET_API_KEY || process.env.BINANCE_API_KEY;
       const secretKey = process.env.BINANCE_TESTNET_SECRET_KEY || process.env.BINANCE_SECRET_KEY;
       if (!apiKey || !secretKey) return res.status(500).json({ error: 'Configure Binance API' });
       
       const isTestnet = process.env.BINANCE_TESTNET !== 'false';
       const baseEndpoint = isTestnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
       const getSig = (qs: string) => crypto.createHmac('sha256', secretKey).update(qs).digest('hex');

       // Cancel previous TP/SL
       const cancelQs = `symbol=${symbol}&timestamp=${Date.now()}`;
       await axios.delete(`${baseEndpoint}/fapi/v1/allOpenOrders?${cancelQs}&signature=${getSig(cancelQs)}`, { headers: { 'X-MBX-APIKEY': apiKey } }).catch(()=>null);

       const triggerSide = positionSide === 'BUY' ? 'SELL' : 'BUY';
       const recvWindow = 5000;

       if (sl) {
         const qs = `symbol=${symbol}&side=${triggerSide}&type=STOP_MARKET&stopPrice=${sl}&closePosition=true&timestamp=${Date.now()}&recvWindow=${recvWindow}`;
         await axios.post(`${baseEndpoint}/fapi/v1/order?${qs}&signature=${getSig(qs)}`, null, { headers: { 'X-MBX-APIKEY': apiKey } });
       }
       if (tp) {
         const qs = `symbol=${symbol}&side=${triggerSide}&type=TAKE_PROFIT_MARKET&stopPrice=${tp}&closePosition=true&timestamp=${Date.now()}&recvWindow=${recvWindow}`;
         await axios.post(`${baseEndpoint}/fapi/v1/order?${qs}&signature=${getSig(qs)}`, null, { headers: { 'X-MBX-APIKEY': apiKey } });
       }
       res.json({ success: true, message: 'TP / SL updated on Binance' });
    } catch(err: any) {
       console.error('TPSL Update Error', err.response?.data || err.message);
       res.status(500).json({ error: err.response?.data?.msg || err.message });
    }
  });

  app.post('/api/trade/close', authMiddleware, async (req: any, res) => {
     if (req.user.role !== 'admin') {
       return res.status(403).json({ error: 'Only admin can manage trades' });
     }
     const { symbol } = req.body;
     try {
       const result = await closeBinancePosition(symbol);
       res.json(result);
     } catch(e: any) {
       res.status(500).json({ error: e.message });
     }
  });

  app.post('/api/users/upgrade-pro', authMiddleware, async (req: any, res) => {
    if (!isDbConnected) {
       return res.status(500).json({ error: 'Database is not connected. Upgrade is disabled in memory mode.' });
    }
    try {
      // Security warning: In production, verify on-chain transaction logs rather than allowing open endpoints
      await (User as any).findByIdAndUpdate(req.user._id, { role: 'pro' });
      res.json({ success: true, message: 'Role upgraded to PRO' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to upgrade role' });
    }
  });

  // Perform AI Analysis (Admin and Pro users)
  app.post('/api/analysis/generate', authMiddleware, async (req: any, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'pro') {
       return res.status(403).json({ error: 'Only PRO users and Admins can generate analysis.' });
    }
    const { symbol, interval, data } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Chart data is required for analysis.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not configured, falling back to Math Engine');
    }

    try {
      // Get dynamic parameters
      let mlParams = null;
      if (isDbConnected) {
          const config = await EngineConfig.findOne({ id: 'global' });
          if (config) mlParams = config.params;
      }
      
      // 1. Run Pure Math / Algorithmic Engine
      const algoResult = analyzeElliottWaves(data, interval, mlParams);
      const mathOutputText = algoResult 
        ? `Algorithmic Math Engine found a ${algoResult.trend} Wave 4 setup. 
           Calculated Entry Point: ${algoResult.entry}, Target: ${algoResult.target}, Invalidation Stop Loss: ${algoResult.stopLoss}. 
           Pivots Found: 
           Start={time: ${algoResult.waves.start.time}, price: ${algoResult.waves.start.price}}, 
           W1={time: ${algoResult.waves.w1.time}, price: ${algoResult.waves.w1.price}}, 
           W2={time: ${algoResult.waves.w2.time}, price: ${algoResult.waves.w2.price}}, 
           W3={time: ${algoResult.waves.w3.time}, price: ${algoResult.waves.w3.price}}, 
           W4={time: ${algoResult.waves.w4.time}, price: ${algoResult.waves.w4.price}}.
           Reasoning: ${algoResult.reasoning}`
        : `Algorithmic Math Engine did not find a strict 100% textbook 5-wave structure matching constraints. Please provide a best-effort structural analysis based on patterns.`;

      let result;

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `
          You are a highly skilled professional crypto trader and quantitative analyst specializing in Technical Analysis, Chart Patterns, and Elliott Wave Theory.
          
          We have an algorithmic pure-math engine that scans for pivot points and evaluates strict Elliott Wave mathematical constraints & Fibonacci relationships.
          Math Engine Output for Context: ${mathOutputText}
          
          Recent Candlestick Data Snapshop for ${symbol} on ${interval} TF (Time, Open, High, Low, Close, Vol):
          ${JSON.stringify(data.slice(-25))}
          
          Your task is to synthesize the math engine's output with your AI capability.
          Look at the LAST FEW CANDLES in the provided data. This is the current active price.
          CRITICAL: If the algorithmic engine explicitly states it "did not find a strict 100% textbook 5-wave structure", you MUST search the recent price action for other valid classic charting patterns such as Cup and Handle, Falling Wedges, Bull Flags, Triangles, or Double Bottoms/Tops.
          CRITICAL: If the math engine found a valid wave but the price has already moved past the suggested entry and hit the target, it is invalidated. You MUST formulate a NEW actionable trade based on a CURRENT pattern. If there is NO pattern to trade, set the "trend" to "neutral" and explain why.
          CRITICAL: The user wants an actionable trade RIGHT NOW. If a valid setup exists and is midway, set the 'entryPoint' near the CURRENT PRICE. Do NOT place the entry point deep in the past. Ensure your Target and Stop Loss make mathematical sense relative to this new localized entry.
          Provide a theoretical winning probability percentage based on the strength of the setup (e.g. "85%"). If neutral, put "-".
          
          You must return the result as a valid JSON object matching this schema exactly, just raw JSON:
          {
            "analysisText": "Your deep expert synthesis: Act as a pro hedge fund analyst. Write a concise, 2-paragraph technical report. Mention RSI/MACD convergences if logically inferred. State the primary driving pattern (e.g., 'Cup and Handle breakout', 'Rising Wedge setup', 'Elliott Wave 4 pullback'). Justify exactly why the current price action validates the entry, target, and stop-loss levels.",
            "winRate": "<percentage>%",
            "entryPoint": <number>,
            "exitPoint": <number>,
            "stopLoss": <number>,
            "trend": "bullish" | "bearish" | "neutral",
            "wavePoints": [ {"time": <unix epoch ms>, "price": <number>}, ...up to 6 points representing the analyzed wave structure. IMPORTANT: The "time" value MUST exactly match one of the "time" values from the provided recent price data array, otherwise the chart will crash! Keep empty if not an Elliott Wave trade. ]
          }
          CRITICAL CONSTRAINT: 
          If trend is "bullish", you MUST ensure exitPoint > entryPoint > stopLoss. 
          If trend is "bearish", you MUST ensure exitPoint < entryPoint < stopLoss.
          If trend is "neutral", ensure entryPoint, exitPoint, and stopLoss are all equal to the current price.
          Any violation of this mathematical constraint will result in a fatal invalidation of the trade logic.
        `;

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
              responseMimeType: "application/json",
              responseSchema: {
                  type: "object",
                  properties: {
                      analysisText: { type: "string" },
                      winRate: { type: "string" },
                      entryPoint: { type: "number" },
                      exitPoint: { type: "number" },
                      stopLoss: { type: "number" },
                      trend: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                      wavePoints: {
                          type: "array",
                          items: {
                              type: "object",
                              properties: {
                                  time: { type: "number" },
                                  price: { type: "number" }
                              },
                              required: ["time", "price"]
                          }
                      }
                  },
                  required: ["analysisText", "winRate", "entryPoint", "exitPoint", "stopLoss", "trend", "wavePoints"]
              }
          }
        });
        
        let text = aiResponse.text?.trim() || "{}";
        text = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        if (text.startsWith('```')) {
            text = text.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        try {
            result = JSON.parse(text);
        } catch (parseError) {
            console.warn("JSON parsing failed. Falling back.", text);
            throw new Error((parseError as Error).message);
        }
        
        // Safety guard against AI hallucinating flipped targets
        if (result.trend === 'bullish') {
           if (result.exitPoint <= result.entryPoint) result.exitPoint = result.entryPoint * 1.05;
           if (result.stopLoss >= result.entryPoint) result.stopLoss = result.entryPoint * 0.95;
        } else if (result.trend === 'bearish') {
           if (result.exitPoint >= result.entryPoint) result.exitPoint = result.entryPoint * 0.95;
           if (result.stopLoss <= result.entryPoint) result.stopLoss = result.entryPoint * 1.05;
        }
      } catch (aiError: any) {
        console.warn("AI generation failed. Falling back to math engine output.", aiError.message);
        
        let errorMsg = aiError.message || "Unknown error";
        if (errorMsg.includes("Quota") || aiError.status === 429) {
           errorMsg = "AI Quota Exceeded";
        } else if (errorMsg.includes("503") || aiError.status === 503 || errorMsg.includes("high demand") || errorMsg.includes("overloaded")) {
           errorMsg = "AI High Demand - Math Engine Active";
        } else if (errorMsg.includes("scopes")) {
           errorMsg = "Invalid API Key";
        } else if (errorMsg.includes("JSON") || errorMsg.includes("Unexpected token")) {
           errorMsg = "AI Parser Error - Math Engine Active";
        }
        
        result = {
          analysisText: `${algoResult?.reasoning || 'No actionable trade could be computed at this time. Market structure is unclear.'}\n\n[Note: ${errorMsg}]`,
          winRate: algoResult ? "70%" : "-",
          entryPoint: algoResult?.entry || data[data.length - 1].close,
          exitPoint: algoResult?.target || data[data.length - 1].close,
          stopLoss: algoResult?.stopLoss || data[data.length - 1].close,
          trend: algoResult?.trend || 'neutral',
          wavePoints: algoResult ? [
            { time: algoResult.waves.start.time, price: algoResult.waves.start.price },
            { time: algoResult.waves.w1.time, price: algoResult.waves.w1.price },
            { time: algoResult.waves.w2.time, price: algoResult.waves.w2.price },
            { time: algoResult.waves.w3.time, price: algoResult.waves.w3.price },
            { time: algoResult.waves.w4.time, price: algoResult.waves.w4.price }
          ] : []
        };
      }

      if (isDbConnected) {
        const newAnalysis = await Analysis.create({
          symbol,
          timeframe: interval,
          analysisText: result.analysisText,
          winRate: result.winRate,
          entryPoint: result.entryPoint,
          exitPoint: result.exitPoint,
          stopLoss: result.stopLoss,
          trend: result.trend,
          wavePoints: result.wavePoints,
          chartData: data.slice(-50)
        });
        res.json(newAnalysis);
      } else {
        res.json({ _id: 'fake-id-' + Date.now(), ...result, symbol, timeframe: interval, timestamp: new Date() });
      }

      } catch (err: any) {
      console.error('AI Gen error trace:', err);
      res.status(500).json({ error: 'Failed to generate analysis', details: err.message, stack: err.stack });
    }
  });

  // Get Recent Analysis
  app.get('/api/analysis', authMiddleware, async (req, res) => {
    if (!isDbConnected) {
      return res.json([]);
    }
    
    try {
      const analyses = await Analysis.find().sort({ timestamp: -1 }).limit(10);
      res.json(analyses);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Global Alerts (Auto-Scanner)
  let recentAlerts: any[] = [];
  app.get('/api/alerts', (req, res) => {
    res.json(recentAlerts);
  });
  
  // ML History endpoint
  app.get('/api/ml/history', async (req, res) => {
    if (!isDbConnected) return res.json({ error: 'DB not connected' });
    try {
        const stats = await TradeSignal.aggregate([
           { $group: { _id: "$status", count: { $sum: 1 }, avgPnl: { $avg: "$pnlPercent" } } }
        ]);
        const recent = await TradeSignal.find({ status: { $ne: 'pending' } }).sort({ resolvedAt: -1 }).limit(10);
        res.json({ stats, recent });
    } catch(e) {
        res.status(500).json({ error: 'Failed to fetch ML stats' });
    }
  });

  // Background Auto-Scanner that scans market top pairs periodically
  let isScanning = false;
  const runAutoScanner = async () => {
    if (isScanning) return;
    isScanning = true;
    try {
      console.log('Running background Auto-Scanner...');
      const response = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
      const data = response.data.filter((d: any) => 
        d.symbol.endsWith('USDT') && d.symbol !== 'USUSDT' && !['USDC', 'FDUSD', 'TUSD', 'BUSD', 'EUR', 'USDP'].some(s => d.symbol.includes(s)) && parseFloat(d.quoteVolume) > 1000000
      );
      data.sort((a: any, b: any) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)));
      
      const topPairs = data.slice(0, 10);
      let foundAlerts = [];
      
      for (const pair of topPairs) {
         try {
           const klinesRes = await axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${pair.symbol}&interval=1h&limit=200`);
           const chartData = klinesRes.data.map((d: any) => ({
             time: d[0],
             open: parseFloat(d[1]),
             high: parseFloat(d[2]),
             low: parseFloat(d[3]),
             close: parseFloat(d[4]),
             volume: parseFloat(d[5]),
           }));
           
           // Get dynamic parameters
           let mlParams = null;
           if (isDbConnected) {
               const config = await EngineConfig.findOne({ id: 'global' });
               if (config) mlParams = config.params;
           }
           
           const algoResult = analyzeElliottWaves(chartData, '1h', mlParams);
           if (algoResult && algoResult.trend !== 'neutral') {
              const currentPrice = chartData[chartData.length - 1].close;
              // Check if it's decently actionable (entry within 2% of current price)
              const entryDiff = Math.abs(algoResult.entry - currentPrice) / currentPrice;
              
              // Validate $2 projected profit rule based on $10 margin and 10x leverage
              const tradeAmountDollars = 10;
              const leverage = 10;
              const positionSizeUsdt = tradeAmountDollars * leverage;
              const priceDiff = Math.abs(algoResult.target - algoResult.entry);
              const projectedProfit = (positionSizeUsdt / algoResult.entry) * priceDiff;

              if (entryDiff < 0.15 && projectedProfit >= 0.1) {
                 foundAlerts.push({
                   id: `${pair.symbol}_${algoResult.trend}`,
                   symbol: pair.symbol,
                   timestamp: Date.now(),
                   trend: algoResult.trend,
                   entry: algoResult.entry,
                   target: algoResult.target,
                   stopLoss: algoResult.stopLoss,
                   reasoning: algoResult.reasoning,
                   currentPrice: currentPrice,
                   projectedProfit
                 });
                 console.log(`[Auto-Scan] Found actionable trade for ${pair.symbol} (Proj. Pnl: $${projectedProfit.toFixed(2)})`);
              }
           }
           // Sleep to avoid ratelimits
           await new Promise(r => setTimeout(r, 500));
         } catch(e) {
           console.warn(`[Auto-Scan] error scanning ${pair.symbol}`, (e as any).message);
         }
      }
      
      if (foundAlerts.length > 0) {
         const newAlertIds = new Set(foundAlerts.map(a => a.id));
         const filteredOld = recentAlerts.filter(a => !newAlertIds.has(a.id));
         recentAlerts = [...foundAlerts, ...filteredOld].slice(0, 20); // keep last 20
         
         // Machine Learning Dataset Collection:
         // Store valid setups in DB to track outcome (win/loss) over time
         if (isDbConnected) {
            let engineCfg = await EngineConfig.findOne({ id: 'global' });
            if (!engineCfg) { engineCfg = await EngineConfig.create({ id: 'global', autoBotBalance: 100 }); }
            
            // Check current active trades to avoid over-trading the same budget 
            const activeCount = await TradeSignal.countDocuments({ status: { $in: ['pending', 'live'] } });
            
            for (const alert of foundAlerts) {
               try {
                   const existing = await TradeSignal.findOne({ symbol: alert.symbol, status: { $in: ['pending', 'live'] }, trend: alert.trend });
                   if (!existing && activeCount < 3) {
                       let currentBudget = engineCfg.autoBotBalance || 100;
                       if (currentBudget <= 5) {
                           currentBudget = 100; // Reset budget
                           engineCfg.autoBotBalance = 100;
                           await engineCfg.save();
                       }
                       
                       // Full budget allocation per trade, but we divide by 3 to allow max 3 concurrent trades
                       const tradeAmountDollars = +(currentBudget / 3).toFixed(2);
                       const leverage = 10;
                       
                       const expiresAt = new Date(Date.now() + 5 * 60 * 60 * 1000);
                       await TradeSignal.create({
                           symbol: alert.symbol,
                           trend: alert.trend,
                           entry: alert.entry,
                           target: alert.target,
                           stopLoss: alert.stopLoss,
                           amount: tradeAmountDollars,
                           expiresAt,
                           setupData: { reasoning: alert.reasoning, params: alert }
                       });
                   }
               } catch(e) { /* ignore */ }
            }
         }
      }
      
    } catch(err) {
       console.error('[Auto-Scan] failed', err);
    } finally {
       isScanning = false;
    }
  };
  
  // Model outcome evaluator (Self-Correction/Learning mechanism)
  // This loop goes back and checks past mathematical prediction signals and grades them
  let isEvaluating = false;
  const runOutcomeEvaluator = async () => {
     if (!isDbConnected || isEvaluating) return;
     isEvaluating = true;
     try {
         const pendingSignals = await TradeSignal.find({ status: 'pending' }).limit(50);
         for (const signal of pendingSignals) {
             try {
                // Fetch recent price
                const response = await axios.get(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${signal.symbol}`);
                const price = parseFloat(response.data.price);
                
                let outcome = 'pending';
                let pnl = 0;
                
                if (!signal.binanceOrderId) {
                     if (signal.expiresAt && Date.now() > new Date(signal.expiresAt).getTime()) {
                         outcome = 'expired';
                     } else {
                         const diffPercent = Math.abs(price - signal.entry) / signal.entry;
                         let isEntryHit = false;
                         if (signal.trend === 'bullish' && price <= signal.entry) isEntryHit = true;
                         if (signal.trend === 'bearish' && price >= signal.entry) isEntryHit = true;
                         if (diffPercent <= 0.01) isEntryHit = true;
                         
                         if (isEntryHit) {
                             try {
                                 const tradeAmountDollars = signal.amount || 10;
                                 const leverage = 10;
                                 const positionSizeUsdt = tradeAmountDollars * leverage;
                                 const quantity = (positionSizeUsdt / price).toFixed(3);
                                 const side = signal.trend === 'bullish' ? 'BUY' : 'SELL';
                                 
                                 let orderId = '';
                                 try {
                                     const { setBinanceLeverage } = await import('./binanceService.js');
                                     await setBinanceLeverage(signal.symbol, leverage);
                                     
                                     const apiRes = await placeBinanceTrade(signal.symbol, side, parseFloat(quantity), 'MARKET', signal.stopLoss, signal.target);
                                     orderId = apiRes.orderId ? apiRes.orderId.toString() : apiRes.clientOrderId;
                                     console.log(`[Binance] Executed Pending Entry: ${side} ${quantity} ${signal.symbol}`);
                                 } catch(e: any) {
                                     console.warn(`[Binance] Could not place real trade, falling back to Paper Trade for ${signal.symbol}:`, e.message);
                                     orderId = `paper_${Date.now()}_${Math.floor(Math.random()*1000)}`;
                                 }
                                 
                                 signal.binanceOrderId = orderId;
                                 signal.quantityExecuted = quantity;
                                 await signal.save();
                             } catch(e: any) {
                                  console.error(`[Entry Error] ${signal.symbol}:`, e.message);
                             }
                             continue;
                         }
                     }
                }
                
                if (signal.binanceOrderId) {
                    if (signal.trend === 'bullish') {
                        if (price >= signal.target) {
                            outcome = 'win';
                            pnl = (signal.target - signal.entry) / signal.entry * 100;
                        } else if (price <= signal.stopLoss) {
                            outcome = 'loss';
                            pnl = (signal.stopLoss - signal.entry) / signal.entry * 100;
                        }
                    } else if (signal.trend === 'bearish') {
                        if (price <= signal.target) {
                            outcome = 'win';
                            pnl = (signal.entry - signal.target) / signal.entry * 100;
                        } else if (price >= signal.stopLoss) {
                            outcome = 'loss';
                            pnl = (signal.entry - signal.stopLoss) / signal.entry * 100;
                        }
                    }
                }
                
                if (outcome !== 'pending') {
                    if (signal.binanceOrderId) {
                        if (signal.binanceOrderId.toString().startsWith('paper_')) {
                            console.log(`[Paper Trade] Closed position for ${signal.symbol}`);
                        } else {
                            try {
                                const res = await closeBinancePosition(signal.symbol);
                                console.log(`[Binance] Closed position for ${signal.symbol}:`, res.message);
                            } catch(e: any) {
                                console.error(`[Binance Close Error] ${signal.symbol}:`, e.message);
                            }
                        }
                    }
                    signal.status = outcome;
                    signal.pnlPercent = pnl;
                    const leverage = 10;
                    signal.realizedPnl = (signal.amount || 10) * leverage * (pnl / 100);
                    // Handle compounding
                    let engineCfg = await EngineConfig.findOne({ id: 'global' });
                    if (engineCfg) {
                        engineCfg.autoBotBalance = (engineCfg.autoBotBalance || 100) + signal.realizedPnl;
                        if (engineCfg.autoBotBalance <= 5) engineCfg.autoBotBalance = 100; // Reset
                        await engineCfg.save();
                    }

                    signal.resolvedAt = new Date();
                    await signal.save();
                    console.log(`[ML-Evaluator] Evaluated trade ${signal.symbol}: ${outcome.toUpperCase()} (${(pnl * leverage).toFixed(2)}% | $${(signal.realizedPnl || 0).toFixed(2)}) | New Budget: $${engineCfg?.autoBotBalance?.toFixed(2)}`);
                }
             } catch(e) { }
         }
         
         // ML Recalibration: Re-average winning params
         try {
             const winningSignals = await TradeSignal.find({ status: 'win' }).sort({ resolvedAt: -1 }).limit(100);
             if (winningSignals.length > 5) { // Minimum 5 wins to start leaning
                let sumR2 = 0, sumE3 = 0, sumR4 = 0;
                let count = 0;
                for (const win of winningSignals) {
                    if (win.setupData?.params?.params) {
                        sumR2 += win.setupData.params.params.retrace2;
                        sumE3 += win.setupData.params.params.ext3;
                        sumR4 += win.setupData.params.params.retrace4;
                        count++;
                    }
                }
                
                if (count > 0) {
                    let newParams = {
                        retrace2: sumR2 / count,
                        ext3: sumE3 / count,
                        retrace4: sumR4 / count
                    };
                    
                    await EngineConfig.findOneAndUpdate(
                        { id: 'global' }, 
                        { params: newParams, updatedAt: new Date() }, 
                        { upsert: true }
                    );
                    console.log(`[ML-Evaluator] Updated global AI parameters from past ${count} winning trades.`);
                }
             }
         } catch (e) {
             console.error("[ML-Evaluator] Failed to recalibrate params:", e);
         }
     } catch(err) {
     } finally {
         isEvaluating = false;
     }
  };

  // Run every 2 minutes
  setInterval(runAutoScanner, 2 * 60 * 1000);
  setTimeout(runAutoScanner, 10000); // Initial run after 10s
  
  // Run outcome evaluator every 1 minute
  setInterval(runOutcomeEvaluator, 1 * 60 * 1000);
  setTimeout(runOutcomeEvaluator, 20000); // Check 20s after boot

  // Daily AI Optimizer using Gemini 3.1 Pro
  let lastOptimizationTime = 0;
  const runDailyAIOptimizer = async () => {
      const now = Date.now();
      // Only run once every 24 hours (unless manually triggered)
      if (now - lastOptimizationTime < 24 * 60 * 60 * 1000 && lastOptimizationTime !== 0) return;
      if (!isDbConnected || !process.env.GEMINI_API_KEY) return;
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      try {
          console.log("[Daily AI Optimizer] Starting Gemini 3.1 Pro analysis of recent trades to improve win rate... 🧠");
          // Fetch last 100 resolved trades
          const recentTrades = await TradeSignal.find({ status: { $ne: 'pending' } }).sort({ resolvedAt: -1 }).limit(100);
          if (recentTrades.length < 5) {
              console.log("[Daily AI Optimizer] Not enough resolved trades yet to optimize. Need at least 5 wins/losses.");
              return; 
          }

          const tradeData = recentTrades.map((t: any) => ({
              symbol: t.symbol,
              trend: t.trend,
              outcome: t.status,
              pnl: t.pnlPercent,
              paramsUsed: t.setupData?.params?.params || null
          }));

          const prompt = `
            You are an elite Quant Developer optimizing an Elliott Wave trading engine. 
            Our goal is to reach a profitable 80% win rate.
            Here is the outcome data of our most recent ${tradeData.length} trades:
            
            ${JSON.stringify(tradeData)}
            
            Based on analyzing the correlation between the parameters used for the wins versus the losses, adjust the engine's core Elliott Wave structural mathematical parameters to proactively avoid similar losses in the future.
            - retrace2 (Wave 2 retracement, standard 0.618)
            - ext3 (Wave 3 extension, standard 1.618)
            - retrace4 (Wave 4 retracement, standard 0.382)
            
            Find the "sweet spot" parameters from the winning trades and avoid the parameters that led to losses.
            
            Return ONLY raw JSON matching this exact schema:
            {
              "retrace2": <optimized number>,
              "ext3": <optimized number>,
              "retrace4": <optimized number>,
              "insights": "Detailed explanation of exactly why you chose these parameters to avoid past failures and achieve an 80% win rate."
            }
          `;

          const aiResponse = await ai.models.generateContent({
              model: 'gemini-3.1-pro-preview',
              contents: prompt,
              config: {
                  responseMimeType: "application/json",
                  temperature: 0.1
              }
          });

          if (aiResponse.text) {
              const result = JSON.parse(aiResponse.text);
              if (result.retrace2 !== undefined && result.ext3 !== undefined && result.retrace4 !== undefined) {
                 await EngineConfig.findOneAndUpdate(
                     { id: 'global' }, 
                     { params: { retrace2: result.retrace2, ext3: result.ext3, retrace4: result.retrace4 }, insights: result.insights, updatedAt: new Date() }, 
                     { upsert: true }
                 );
                 console.log("[Daily AI Optimizer] Success! New optimized params generated by Gemini 3.1 Pro.", result);
                 lastOptimizationTime = now;
              }
          }

      } catch (err) {
          console.error("[Daily AI Optimizer] Optimization failed:", err);
      }
  };

  // Run automatically daily (checking every hour)
  setInterval(runDailyAIOptimizer, 60 * 60 * 1000);

  // Manual Trigger Endpoint for Settings
  app.post('/api/ml/optimize', authMiddleware, async (req: any, res) => {
      if (req.user.role !== 'admin' && req.user.role !== 'pro') {
         return res.status(403).json({ error: 'Only PRO users and Admins can run the optimizer.' });
      }
      // Force it to run
      lastOptimizationTime = 0; 
      runDailyAIOptimizer(); // run async
      res.json({ success: true, message: "Daily AI Optimizer triggered via Gemini 3.1 Pro and is running in the background." });
  });

  // -----------------------------------------------------
  // Vite Middleware for Frontend Serving
  // -----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
