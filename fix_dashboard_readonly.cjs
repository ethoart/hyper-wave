const fs = require('fs');

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const target1 = `  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeLeverage, setTradeLeverage] = useState('10');`;
const repl1 = `  const [tradeAmount, setTradeAmount] = useState('10');
  const [tradeLeverage, setTradeLeverage] = useState('10');`;

code = code.replace(target1, repl1);

const target2 = `                    <div className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-3 py-1.5 flex items-center">
                       <input 
                         value={tradeAmount}
                         onChange={e => setTradeAmount(e.target.value)}
                         className="bg-transparent border-none outline-none w-full text-white text-sm" 
                         placeholder="Qty" 
                       />
                       <span className="text-xs text-[#787b86] ml-1">USDT</span>
                    </div>
                    <div className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-3 py-1.5 flex items-center">
                       <input 
                         value={tradeLeverage}
                         onChange={e => setTradeLeverage(e.target.value)}
                         className="bg-transparent border-none outline-none w-full text-white text-sm" 
                         placeholder="Lev" 
                       />
                       <span className="text-xs text-[#787b86] ml-1">x</span>
                    </div>`;

const repl2 = `                    <div className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-3 py-1.5 flex items-center cursor-not-allowed opacity-80">
                       <input 
                         value={tradeAmount}
                         readOnly
                         className="bg-transparent border-none outline-none w-full text-white text-sm pointer-events-none" 
                         placeholder="Qty" 
                       />
                       <span className="text-xs text-[#787b86] ml-1">USDT</span>
                    </div>
                    <div className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-3 py-1.5 flex items-center cursor-not-allowed opacity-80">
                       <input 
                         value={tradeLeverage}
                         readOnly
                         className="bg-transparent border-none outline-none w-full text-white text-sm pointer-events-none" 
                         placeholder="Lev" 
                       />
                       <span className="text-xs text-[#787b86] ml-1">x</span>
                    </div>`;

code = code.replace(target2, repl2);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
