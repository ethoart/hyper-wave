const fs = require('fs');

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// Replace standard trade display
const tradeDisplayTarget = `<span className="font-bold text-white text-sm"><span className={trade.trend === 'bullish' ? 'text-[#089981]' : 'text-[#f23645]'}>{trade.trend === 'bullish' ? 'LONG' : 'SHORT'}</span> {trade.symbol}</span>`;
const tradeDisplayRepl = `<span className="font-bold text-white text-sm">
 <span className={trade.trend === 'bullish' ? 'text-[#089981]' : 'text-[#f23645]'}>{trade.trend === 'bullish' ? 'LONG' : 'SHORT'}</span> {trade.symbol}
 {trade.termStyle === 'SHORT_TERM' ? <span className="ml-2 text-[9px] bg-[#f59e0b]/20 text-[#f59e0b] px-1 py-0.5 rounded uppercase tracking-wider">SHORT TERM</span> : trade.termStyle === 'LONG_TERM' ? <span className="ml-2 text-[9px] bg-[#2962ff]/20 text-[#2962ff] px-1 py-0.5 rounded uppercase tracking-wider">LONG TERM</span> : null}
</span>`;

code = code.replace(new RegExp(tradeDisplayTarget.replace(/[.*+?^$\{\}\(\)|\[\]\\]/g, '\\$&'), 'g'), tradeDisplayRepl);

const liveTradeDisplayTarget = `<span className="font-bold text-white text-sm">
                                              <span className={pos.side === 'BUY' ? 'text-[#089981]' : 'text-[#f23645]'}>{pos.side === 'BUY' ? 'LONG' : 'SHORT'}</span> {pos.symbol}
                                          </span>`;

const liveTradeDisplayRepl = `<span className="font-bold text-white text-sm">
                                              <span className={pos.side === 'BUY' ? 'text-[#089981]' : 'text-[#f23645]'}>{pos.side === 'BUY' ? 'LONG' : 'SHORT'}</span> {pos.symbol}
                                              {pos.termStyle === 'SHORT_TERM' ? <span className="ml-2 text-[9px] bg-[#f59e0b]/20 text-[#f59e0b] px-1 py-0.5 rounded uppercase tracking-wider">SHORT TERM</span> : pos.termStyle === 'LONG_TERM' ? <span className="ml-2 text-[9px] bg-[#2962ff]/20 text-[#2962ff] px-1 py-0.5 rounded uppercase tracking-wider">LONG TERM</span> : null}
                                          </span>`;

code = code.replace(liveTradeDisplayTarget, liveTradeDisplayRepl);


fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
