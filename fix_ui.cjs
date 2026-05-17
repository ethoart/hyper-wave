const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const target1 = ` <span className={trade.trend === 'bullish' ? 'text-[#089981]' : 'text-[#f23645]'}>{trade.trend === 'bullish' ? 'LONG' : 'SHORT'}</span> {trade.symbol}
 {trade.termStyle === 'SHORT_TERM' ? <span className="ml-2 text-[9px] bg-[#f59e0b]/20 text-[#f59e0b] px-1 py-0.5 rounded uppercase tracking-wider">SHORT TERM</span> : trade.termStyle === 'LONG_TERM' ? <span className="ml-2 text-[9px] bg-[#2962ff]/20 text-[#2962ff] px-1 py-0.5 rounded uppercase tracking-wider">LONG TERM</span> : null}
</span>`;
const repl1 = ` <span className={trade.trend === 'bullish' ? 'text-[#089981]' : 'text-[#f23645]'}>{trade.trend === 'bullish' ? 'LONG' : 'SHORT'}</span> {trade.symbol}
 {trade.termStyle === 'SHORT_TERM' ? <span className="ml-2 text-[9px] bg-[#f59e0b]/20 text-[#f59e0b] px-1 py-0.5 rounded uppercase tracking-wider">SHORT TERM</span> : trade.termStyle === 'LONG_TERM' ? <span className="ml-2 text-[9px] bg-[#2962ff]/20 text-[#2962ff] px-1 py-0.5 rounded uppercase tracking-wider">LONG TERM</span> : null}
 {trade.setupData?.timeframe ? <span className="ml-2 text-[9px] bg-[#089981]/20 text-[#089981] px-1 py-0.5 rounded uppercase tracking-wider">{trade.setupData.timeframe} TF</span> : null}
</span>`;

code = code.replaceAll(target1, repl1);

const target2 = `                                       <div className="mt-2 p-2 bg-[rgba(41,98,255,0.05)] border border-[rgba(41,98,255,0.2)] rounded text-[10px] text-[#b2b5be] leading-relaxed">
                                          <div className="flex items-center gap-1 mb-1 text-[#2962ff] font-bold uppercase"><Brain className="w-3 h-3"/> AI Rationale</div>
                                          {trade.setupData.reasoning}
                                       </div>`;
const repl2 = `                                       <div className="mt-2 p-2 bg-[rgba(41,98,255,0.05)] border border-[rgba(41,98,255,0.2)] rounded text-[10px] text-[#b2b5be] leading-relaxed whitespace-pre-wrap">
                                          <div className="flex items-center gap-1 mb-1 text-[#2962ff] font-bold uppercase"><Brain className="w-3 h-3"/> AI Rationale</div>
                                          {trade.setupData.reasoning}
                                       </div>`;

code = code.replaceAll(target2, repl2);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
