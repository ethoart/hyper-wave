const fs = require('fs');

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// 1. Add fields to Admin Settings
const adminSettingsTarget = `<label className="block text-xs text-[#787b86] mb-2 uppercase font-bold">Auto-Trade Strategy Model</label>`;
const adminSettingsRepl = `
                             <label className="block text-xs text-[#787b86] mb-2 mt-4 uppercase font-bold">Trade Size (USD)</label>
                             <input 
                               type="number" 
                               value={adminConfig.tradeAmountFixed || 15}
                               onChange={(e) => saveAdminConfig('tradeAmountFixed', Number(e.target.value))}
                               className="w-full bg-[#2a2e39] text-white text-sm border border-[#363a45] rounded p-2 outline-none focus:border-[#2962ff] mb-4"
                             />

                             <label className="block text-xs text-[#787b86] mb-2 uppercase font-bold">Telegram Notifications</label>
                             <div className="flex gap-2 mb-2">
                               <input placeholder="Bot Token" value={adminConfig.telegramBotToken || ''} onChange={(e) => saveAdminConfig('telegramBotToken', e.target.value)} className="w-1/2 bg-[#2a2e39] text-white text-xs border border-[#363a45] rounded p-2 outline-none" />
                               <input placeholder="Chat ID" value={adminConfig.telegramUserId || ''} onChange={(e) => saveAdminConfig('telegramUserId', e.target.value)} className="w-1/2 bg-[#2a2e39] text-white text-xs border border-[#363a45] rounded p-2 outline-none" />
                             </div>
                             
                             <label className="block text-xs text-[#787b86] mb-2 uppercase font-bold mt-4">WhatsApp Notifications (Twilio)</label>
                             <div className="flex gap-2 mb-2">
                               <input placeholder="Twilio SID" value={adminConfig.twilioSid || ''} onChange={(e) => saveAdminConfig('twilioSid', e.target.value)} className="flex-1 bg-[#2a2e39] text-white text-xs border border-[#363a45] rounded p-2 outline-none" />
                               <input placeholder="Auth Token" value={adminConfig.twilioToken || ''} onChange={(e) => saveAdminConfig('twilioToken', e.target.value)} className="flex-1 bg-[#2a2e39] text-white text-xs border border-[#363a45] rounded p-2 outline-none" />
                             </div>
                             <div className="flex gap-2 mb-4">
                               <input placeholder="From Number (+1...)" value={adminConfig.twilioFrom || ''} onChange={(e) => saveAdminConfig('twilioFrom', e.target.value)} className="w-1/2 bg-[#2a2e39] text-white text-xs border border-[#363a45] rounded p-2 outline-none" />
                               <input placeholder="To Number (+1...)" value={adminConfig.whatsappNumber || ''} onChange={(e) => saveAdminConfig('whatsappNumber', e.target.value)} className="w-1/2 bg-[#2a2e39] text-white text-xs border border-[#363a45] rounded p-2 outline-none" />
                             </div>

                             <label className="block text-xs text-[#787b86] mb-2 uppercase font-bold">Auto-Trade Strategy Model</label>
`;

code = code.replace(adminSettingsTarget, adminSettingsRepl);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
