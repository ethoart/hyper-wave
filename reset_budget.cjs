const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const engineConfigSchema = new mongoose.Schema({
  id: { type: String, default: 'global' },
  autoBotBalance: { type: Number, default: 100 },
}, { strict: false });

const tradeSignalSchema = new mongoose.Schema({
  status: String,
  resolvedAt: Date,
  closeReason: String,
}, { strict: false });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const EngineConfig = mongoose.models.EngineConfig || mongoose.model('EngineConfig', engineConfigSchema);
  const TradeSignal = mongoose.models.TradeSignal || mongoose.model('TradeSignal', tradeSignalSchema);

  // Reset Budget
  let cfg = await EngineConfig.findOne({ id: 'global' });
  if (cfg) {
    cfg.autoBotBalance = 100;
    await cfg.save();
    console.log("Budget reset to 100");
  }

  // Close Live Auto Trades
  const tsRes = await TradeSignal.updateMany({ status: { $in: ['pending', 'live'] } }, {
     $set: { status: 'invalidated', resolvedAt: new Date(), closeReason: 'Budget reset by user' }
  });
  console.log("Closed TradeSignals:", tsRes.modifiedCount);

  mongoose.disconnect();
}
run().catch(console.error);
