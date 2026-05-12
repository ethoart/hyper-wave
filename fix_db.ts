import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const userTradeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  symbol: String,
  side: { type: String, enum: ['BUY', 'SELL'] },
  amount: Number,
  entry: Number,
  entryPrice: Number, // Handle both entry structures from history
  target: Number,
  takeProfit: Number, // Handle both
  stopLoss: Number,
  binanceOrderId: String,
  status: { type: String, enum: ['pending', 'live', 'win', 'loss', 'expired', 'closed'], default: 'pending' },
  isAuto: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  resolvedAt: Date
}, { strict: false });

const UserTrade = mongoose.models.UserTrade || mongoose.model('UserTrade', userTradeSchema);

async function fixTrades() {
  if (!process.env.MONGO_URI) return console.log('No Mongo URI');
  await mongoose.connect(process.env.MONGO_URI);
  
  const trades = await UserTrade.find({ status: 'live' });
  let fixed = 0;
  for (const t of trades) {
      const entry = t.entryPrice || t.entry;
      const target = t.takeProfit || t.target;
      let changed = false;
      
      if (entry && target) {
          if (t.side === 'BUY' && target < entry) {
              t.side = 'SELL';
              changed = true;
          } else if (t.side === 'SELL' && target > entry) {
              t.side = 'BUY';
              changed = true;
          }
      }
      
      if (changed) {
          await t.save();
          fixed++;
          console.log(`Fixed trade ${t._id}: changed side to ${t.side}`);
      }
  }
  console.log(`Fixed ${fixed} trades.`);
  process.exit(0);
}

fixTrades();
