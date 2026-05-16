const fs = require('fs');

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// For openTrades
const targetOpen = `                                     <div className="flex justify-between items-center w-full mt-1">
                                       <span className="text-[10px] text-[#787b86]">Amt: \${trade.amount}</span>`;

const replacementOpen = `                                     {trade.setupData && trade.setupData.reasoning && (
                                       <div className="mt-2 p-2 bg-[rgba(41,98,255,0.05)] border border-[rgba(41,98,255,0.2)] rounded text-[10px] text-[#b2b5be] leading-relaxed">
                                          <div className="flex items-center gap-1 mb-1 text-[#2962ff] font-bold uppercase"><Brain className="w-3 h-3"/> AI Rationale</div>
                                          {trade.setupData.reasoning}
                                       </div>
                                     )}
                                     <div className="flex justify-between items-center w-full mt-1">
                                       <span className="text-[10px] text-[#787b86]">Amt: \${trade.amount}</span>`;

if (code.includes(targetOpen)) {
    code = code.replace(targetOpen, replacementOpen);
    console.log("Patched open trades in Dashboard.tsx");
}

// For closedTrades
const targetClosed = `                                     <div className="flex justify-between items-center w-full cursor-pointer" onClick={() => setSymbol(trade.symbol)}>
                                        <span className="text-xs text-[#787b86]">Realized:</span>
                                        <span className={\`text-xs font-bold \${trade.realizedPnl > 0 ? 'text-[#089981]' : 'text-[#f23645]'}\`}>\${(trade.realizedPnl || 0).toFixed(2)} ({trade.pnlPercent?.toFixed(2)}%)</span>
                                     </div>
                                  </div>`;

const replacementClosed = `                                     <div className="flex justify-between items-center w-full cursor-pointer" onClick={() => setSymbol(trade.symbol)}>
                                        <span className="text-xs text-[#787b86]">Realized:</span>
                                        <span className={\`text-xs font-bold \${trade.realizedPnl > 0 ? 'text-[#089981]' : 'text-[#f23645]'}\`}>\${(trade.realizedPnl || 0).toFixed(2)} ({trade.pnlPercent?.toFixed(2)}%)</span>
                                     </div>
                                     {trade.setupData && trade.setupData.reasoning && (
                                       <div className="mt-2 p-2 bg-[rgba(41,98,255,0.05)] border border-[rgba(41,98,255,0.2)] rounded text-[10px] text-[#b2b5be] leading-relaxed">
                                          <div className="flex items-center gap-1 mb-1 text-[#2962ff] font-bold uppercase"><Brain className="w-3 h-3"/> AI Rationale</div>
                                          {trade.setupData.reasoning}
                                       </div>
                                     )}
                                  </div>`;

if (code.includes(targetClosed)) {
    code = code.replace(targetClosed, replacementClosed);
    console.log("Patched closed trades in Dashboard.tsx");
} else {
    // maybe try to replace just a part
    console.log("TARGET CLOSED NOT FOUND");
}

if (!code.includes('import { Brain') && !code.includes('Brain,')) {
    code = code.replace('import { Play, Square, Settings, Share2, LogOut, ChevronDown, Check, X, RefreshCw, Layers, Database, Lock, Search } from "lucide-react";', 
                        'import { Play, Square, Settings, Share2, LogOut, ChevronDown, Check, X, RefreshCw, Layers, Database, Lock, Search, Brain } from "lucide-react";');
    console.log("Patched imports");
}

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
