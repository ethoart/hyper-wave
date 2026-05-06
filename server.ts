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


// -----------------------------------------------------
// 2. Main Server Setup
// -----------------------------------------------------
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Try connecting to MongoDB. If no URI, we will error out on DB endpoints
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
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
    } catch (err) {
      console.error('MongoDB connection error:', err);
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
    
    if (!process.env.MONGO_URI) {
       return res.status(500).json({ error: 'Database is not configured. Please set MONGO_URI in environment.' });
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
    if (!process.env.MONGO_URI) return res.status(500).json({error: 'No DB configured'});
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
    try {
       const users = await (User as any).find({}, { password: 0 }); // Exclude passwords
       res.json(users);
    } catch(err) {
       res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.put('/api/users/:id', authMiddleware, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
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

  // Binance & Analysis Data
  app.get('/api/market/klines', async (req: any, res) => {
    const { symbol = 'BTCUSDT', interval = '1d', limit = '100' } = req.query;
    try {
      // Free public endpoint
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
      const response = await axios.get(url);
      
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

  app.get('/api/market/scan', async (req: any, res) => {
    try {
      // 24hr ticker to find top pairs
      const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
      const data = response.data.filter((d: any) => d.symbol.endsWith('USDT') && parseFloat(d.volume) > 10000000);
      data.sort((a: any, b: any) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent));
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
    const baseEndpoint = 'https://fapi.binance.com';
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
        await axios.post(`${baseEndpoint}/fapi/v1/order?${tpQuery}&signature=${getSignature(tpQuery)}`, null, { headers: { 'X-MBX-APIKEY': apiKey }});
      }
      if (stopLoss) {
        const slSide = side === 'BUY' ? 'SELL' : 'BUY';
        const slQuery = `symbol=${symbol}&side=${slSide}&type=STOP_MARKET&stopPrice=${stopLoss}&closePosition=true&timestamp=${Date.now()}&recvWindow=${recvWindow}`;
        await axios.post(`${baseEndpoint}/fapi/v1/order?${slQuery}&signature=${getSignature(slQuery)}`, null, { headers: { 'X-MBX-APIKEY': apiKey }});
      }
      
      res.json({ success: true, message: 'Trade executed successfully on Binance via API', data: orderRes.data });
    } catch (err: any) {
      console.error('Binance API Error:', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.msg || err.message });
    }
  });

  app.post('/api/users/upgrade-pro', authMiddleware, async (req: any, res) => {
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
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
      // 1. Run Pure Math / Algorithmic Engine
      const algoResult = analyzeElliottWaves(data);
      const mathOutputText = algoResult 
        ? `Algorithmic Math Engine found a ${algoResult.trend} Wave 4 setup. 
           Calculated Entry Point: ${algoResult.entry}, Target: ${algoResult.target}, Invalidation Stop Loss: ${algoResult.stopLoss}. 
           Pivots Found: Start=${algoResult.waves.start}, W1=${algoResult.waves.w1}, W2=${algoResult.waves.w2}, W3=${algoResult.waves.w3}, W4=${algoResult.waves.w4}.`
        : `Algorithmic Math Engine did not find a strict 100% textbook 5-wave structure matching constraints. Please provide a best-effort structural analysis based on patterns.`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
        You are a highly skilled professional crypto trader and quantitative analyst specializing in Elliott Wave Theory.
        
        We have an algorithmic pure-math engine that scans for pivot points and evaluates strict Elliott Wave mathematical constraints & Fibonacci relationships.
        Math Engine Output for Context: ${mathOutputText}
        
        Recent Candlestick Data Snapshop for ${symbol} on ${interval} TF (Time, Open, High, Low, Close, Vol):
        ${JSON.stringify(data.slice(-25))}
        
        Your task is to synthesize the math engine's output with your AI capability.
        Read the candlesticks, confirm the mathematical Entry, Target, and Stop Loss points, and slightly adjust them if you detect local support/resistance or candlestick exhaustion patterns that the math missed. 
        If the engine found no setup, find the closest structural opportunity or give a neutral standing. Provide a theoretical winning probability percentage based on the strength of the setup (e.g. "85%").
        
        You must return the result as a valid JSON object matching this schema exactly, just raw JSON:
        {
          "analysisText": "Your expert synthesis: How does the raw data support the engine's finding? What's the final trade rationale?",
          "winRate": "<percentage>%",
          "entryPoint": <number>,
          "exitPoint": <number>,
          "stopLoss": <number>,
          "trend": "bullish" | "bearish" | "neutral",
          "wavePoints": [ {"time": <unix epoch ms>, "price": <number>}, ...up to 6 points representing the analyzed wave structure. IMPORTANT: The "time" value MUST exactly match one of the "time" values from the provided recent price data array, otherwise the chart will crash! ]
        }
      `;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
            responseMimeType: "application/json"
        }
      });
      
      const text = aiResponse.text?.trim() || "{}";
      const result = JSON.parse(text);

      if (process.env.MONGO_URI) {
        const newAnalysis = await Analysis.create({
          symbol,
          timeframe: interval,
          analysisText: result.analysisText,
          entryPoint: result.entryPoint,
          exitPoint: result.exitPoint,
          stopLoss: result.stopLoss,
          trend: result.trend,
          wavePoints: result.wavePoints,
          chartData: data.slice(-50)
        });
        res.json(newAnalysis);
      } else {
        res.json({ ...result, symbol, timeframe: interval, timestamp: new Date() });
      }

    } catch (err: any) {
      console.error('AI Gen error:', err);
      res.status(500).json({ error: 'Failed to generate analysis' });
    }
  });

  // Get Recent Analysis
  app.get('/api/analysis', authMiddleware, async (req, res) => {
    if (!process.env.MONGO_URI) {
      return res.status(500).json({ error: 'Database is not configured' });
    }
    
    try {
      const analyses = await Analysis.find().sort({ timestamp: -1 }).limit(10);
      res.json(analyses);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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
