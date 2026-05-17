const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// 1. Update Schema
code = code.replace(
  /autoBotBalance: \{ type: Number, default: 100 \},/,
  `autoBotBalance: { type: Number, default: 100 },
  tradeAmountFixed: { type: Number, default: 15 },
  telegramUserId: String,
  telegramBotToken: String,
  whatsappNumber: String,
  twilioSid: String,
  twilioToken: String,
  twilioFrom: String,`
);

// 2. Update config POST endpoint
const configPostTarget = `        if (req.body.tradingModel) config.tradingModel = req.body.tradingModel;`;
const configPostRepl = `        if (req.body.tradingModel) config.tradingModel = req.body.tradingModel;
        if (req.body.tradeAmountFixed) config.tradeAmountFixed = req.body.tradeAmountFixed;
        if (req.body.telegramUserId) config.telegramUserId = req.body.telegramUserId;
        if (req.body.telegramBotToken) config.telegramBotToken = req.body.telegramBotToken;
        if (req.body.whatsappNumber) config.whatsappNumber = req.body.whatsappNumber;
        if (req.body.twilioSid) config.twilioSid = req.body.twilioSid;
        if (req.body.twilioToken) config.twilioToken = req.body.twilioToken;
        if (req.body.twilioFrom) config.twilioFrom = req.body.twilioFrom;`;

code = code.replace(configPostTarget, configPostRepl);

// 3. Trade amount logic
const tradeAmountTarget = `const tradeAmountDollars = +(currentBudget / 5).toFixed(2);`;
const tradeAmountRepl = `const tradeAmountDollars = engineCfg.tradeAmountFixed || 15;`;

code = code.replace(tradeAmountTarget, tradeAmountRepl);

// 4. Notification function
const sendNotifCode = `
async function sendNotification(engineCfg: any, message: string) {
    if (engineCfg.telegramBotToken && engineCfg.telegramUserId) {
        try {
            await axios.post(\`https://api.telegram.org/bot\${engineCfg.telegramBotToken}/sendMessage\`, {
                chat_id: engineCfg.telegramUserId,
                text: message,
                parse_mode: 'HTML'
            });
        } catch (e: any) {
            console.error("Telegram notification failed:", e.message);
        }
    }
    if (engineCfg.twilioSid && engineCfg.twilioToken && engineCfg.whatsappNumber && engineCfg.twilioFrom) {
        try {
            const auth = Buffer.from(engineCfg.twilioSid + ':' + engineCfg.twilioToken).toString('base64');
            await axios.post(\`https://api.twilio.com/2010-04-01/Accounts/\${engineCfg.twilioSid}/Messages.json\`, new URLSearchParams({
                From: \`whatsapp:\${engineCfg.twilioFrom}\`,
                To: \`whatsapp:\${engineCfg.whatsappNumber}\`,
                Body: message
            }), {
                headers: {
                    'Authorization': \`Basic \${auth}\`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        } catch (e: any) {
            console.error("WhatsApp notification failed:", e.message);
        }
    }
}
`;

// Insert the notification function after startServer() { ... } or something, or at the top. Let's put it before the endpoints.
code = code.replace(/\/\/ -----------------------------------------------------\n\/\/ 3\. API Routes/, sendNotifCode + '\n// -----------------------------------------------------\n// 3. API Routes');

// 5. Call sendNotification
const createTradeTarget = `signal = await TradeSignal.create({`;
const createTradeRepl = `const notifMessage = \`🚨 <b>HyperWave Signal</b> 🚨\\n\\n<b>Pair:</b> \${algoResult.symbol}\\n<b>Action:</b> \${algoResult.trend === 'bullish' ? 'LONG' : 'SHORT'}\\n<b>Entry:</b> \${algoResult.entry}\\n<b>Target:</b> \${algoResult.target}\\n<b>StopLoss:</b> \${algoResult.stopLoss}\\n<b>Size ($):</b> \${tradeAmountDollars}\\n\\n<b>Reasoning:</b>\\n\${algoResult.reasoning}\`;
                   await sendNotification(engineCfg, notifMessage);

                   signal = await TradeSignal.create({`;

code = code.replace(createTradeTarget, createTradeRepl);


fs.writeFileSync('server.ts', code, 'utf8');
