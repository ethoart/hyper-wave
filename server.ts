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

  // Binance & Analysis Data
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
        response = await axios.get(url);
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

  app.get('/api/market/scan', async (req: any, res) => {
    try {
      // 24hr ticker to find top pairs from Binance Futures
      const response = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
      
      const data = response.data.filter((d: any) => 
        d.symbol.endsWith('USDT') && 
        !d.symbol.includes('USDC') &&
        !d.symbol.includes('FDUSD') &&
        !d.symbol.includes('TUSD') &&
        !d.symbol.includes('BUSD') &&
        !d.symbol.includes('EUR') &&
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
      // 1. Run Pure Math / Algorithmic Engine
      const algoResult = analyzeElliottWaves(data);
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
          CRITICAL: If the math engine's suggested entry point has already been missed (the price has moved significantly away from it and already hit target), you MUST ignore it and formulate a NEW actionable trade based on a current pattern (like a wedge breakout or cup and handle). If there is NO pattern to trade, set the "trend" to "neutral" and explain why.
          Confirm or adjust the Entry, Target, and Stop Loss points based on local support/resistance.
          Provide a theoretical winning probability percentage based on the strength of the setup (e.g. "85%"). If neutral, put "-".
          
          You must return the result as a valid JSON object matching this schema exactly, just raw JSON:
          {
            "analysisText": "Your expert synthesis: State the main pattern driving this trade (e.g., 'Cup and Handle breakout', 'Rising Wedge setup', 'Elliott Wave 4 pullback'). Include the final trade rationale. EXPLAIN the reasoning for the exit point, entry point, and stop-loss targets.",
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
          model: 'gemini-1.5-flash',
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
           errorMsg = "The AI service free-tier quota was exceeded. Please try again in 1 minute.";
        } else if (errorMsg.includes("503") || aiError.status === 503 || errorMsg.includes("high demand") || errorMsg.includes("overloaded")) {
           errorMsg = "The AI model is overloaded with high demand. Please try again later.";
        } else if (errorMsg.includes("scopes")) {
           errorMsg = "Invalid API key or permissions.";
        } else if (errorMsg.includes("JSON") || errorMsg.includes("Unexpected token")) {
           errorMsg = "The AI returned malformed logic JSON. Utilizing math engine backup.";
        }
        
        result = {
          analysisText: `⚠️ AI connection failed: ${errorMsg}\n\nDisplaying strictly algorithmic math engine output:\n\n${algoResult?.reasoning || 'No actionable trade could be computed at this time. Market structure is unclear.'}`,
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
