const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// Add History tab
const tabUnionTarget = "const [rightSidebarTab, setRightSidebarTab] = useState<'watchlist' | 'trades' | 'market'>('watchlist');";
const tabUnionRepl = "const [rightSidebarTab, setRightSidebarTab] = useState<'watchlist' | 'trades' | 'market' | 'history'>('watchlist');";
code = code.replace(tabUnionTarget, tabUnionRepl);

// Add the UI button for 'history'
const marketButtonTarget = `<button 
                     onClick={() => setRightSidebarTab('market')}
                     className={\`flex-1 py-3 text-[10px] sm:text-xs uppercase font-bold tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1 \${rightSidebarTab === 'market' ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'}\`}
                   >
                     <Activity className="w-3.5 h-3.5"/> Market
                   </button>
                </div>`;
const marketButtonRepl = `<button 
                     onClick={() => setRightSidebarTab('market')}
                     className={\`flex-1 py-3 text-[10px] sm:text-xs uppercase font-bold tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1 \${rightSidebarTab === 'market' ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'}\`}
                   >
                     <Activity className="w-3.5 h-3.5"/> Market
                   </button>
                   <button 
                     onClick={() => setRightSidebarTab('history')}
                     className={\`flex-1 py-3 text-[10px] sm:text-xs uppercase font-bold tracking-wider border-b-2 transition-colors \${rightSidebarTab === 'history' ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'}\`}
                   >
                     History
                   </button>
                </div>`;
code = code.replace(marketButtonTarget, marketButtonRepl);

// Hide Recent Outcomes from trades tab, move to history tab
// Just replace the rendering block.
const tradesTabEndTarget = `                           )}
                         </div>

                         <div className="mt-4 mb-4">
                           <div className="text-xs text-[#787b86] font-bold mb-2 uppercase">Recent Outcomes</div>`;

const tradesTabEndRepl = `                           )}
                         </div>
                       </div>
                    )}
                    
                    {rightSidebarTab === 'history' && (
                       <div className="flex-1 overflow-y-auto no-scrollbar p-3 relative">
                         <div className="mb-4">
                           <div className="text-xs text-[#787b86] font-bold mb-2 uppercase">Recent Outcomes</div>`;

code = code.replace(tradesTabEndTarget, tradesTabEndRepl);

// Stop auto-selecting pair if called automatically
const autoScanTarget = `const scanInterval = setInterval(() => {
       if ((user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'pro')) {
         handleScanBestPair();
       }
    }, 60000 * 5);`;
const autoScanRepl = `const scanInterval = setInterval(() => {
       if ((user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'pro')) {
         handleScanBestPair(true);
       }
    }, 60000 * 10);`;
code = code.replace(autoScanTarget, autoScanRepl);

// Need to change the function definition 
const handleScanDefTarget = `const handleScanBestPair = async () => {`;
const handleScanDefRepl = `const handleScanBestPair = async (isAuto: boolean = false) => {`;
code = code.replace(handleScanDefTarget, handleScanDefRepl);

const handleScanSetSymbolTarget = `        addNotification(\`Engine found best pairs: \${newSymbols.join(', ')}\`);
        setSymbol(best.symbol);
        setSymbolInput(best.symbol);`;
const handleScanSetSymbolRepl = `        addNotification(\`Engine found best pairs: \${newSymbols.join(', ')}\`);
        if (!isAuto) {
            setSymbol(best.symbol);
            setSymbolInput(best.symbol);
        }`;
code = code.replace(handleScanSetSymbolTarget, handleScanSetSymbolRepl);


fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
