import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useAuth } from './AuthProvider';
import axios from 'axios';
import { WaveChart } from './WaveChart';
import { MiniChart } from './MiniChart';
import {
  MousePointer2, Crosshair, PenTool, TrendingUp, Search,
  PlayCircle, Loader2, List, Activity, Settings, LogOut, Code,
  Bell, BellRing, DollarSign, Send, Menu, X, PlusSquare
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ethers } from 'ethers';

export function Dashboard() {
  const { user, logout } = useAuth();
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<any>(null);
  
  const [symbolInput, setSymbolInput] = useState('BTCUSDT');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setChartInterval] = useState('1d');
  
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [rightSidebarTab, setRightSidebarTab] = useState<'watchlist' | 'trades'>('watchlist');
  const [additionalCharts, setAdditionalCharts] = useState<Array<{symbol: string, interval: string}>>([]);
  
  const [drawingColor, setDrawingColor] = useState('#2962ff');
  const [clearDrawings, setClearDrawings] = useState(0);

  useEffect(() => {
    const savedWatchlist = localStorage.getItem('hyperwave_watchlist');
    if (savedWatchlist) {
      setWatchlist(JSON.parse(savedWatchlist));
    }
  }, []);

  const toggleWatchlist = (sym: string) => {
    const updated = watchlist.includes(sym) ? watchlist.filter(s => s !== sym) : [...watchlist, sym];
    setWatchlist(updated);
    localStorage.setItem('hyperwave_watchlist', JSON.stringify(updated));
  };
  
  const [chartData, setChartData] = useState<any[]>([]);
  const [liveCandle, setLiveCandle] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  // Side tools state
  const [activeTool, setActiveTool] = useState('crosshair');
  
  // Notifications / Scanner
  const [notifications, setNotifications] = useState<any[]>([]);
  const [hasNewNotif, setHasNewNotif] = useState(false);
  const [scanning, setScanning] = useState(false);
  
  // Trading Form
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeLeverage, setTradeLeverage] = useState('1');
  const [tradeTP, setTradeTP] = useState('');
  const [tradeSL, setTradeSL] = useState('');
  const [placingTrade, setPlacingTrade] = useState(false);
  const [openTrades, setOpenTrades] = useState<any[]>([
    { id: '1', symbol: 'BTCUSDT', side: 'BUY', amount: '100', pnl: '+4.50' },
    { id: '2', symbol: 'ETHUSDT', side: 'SELL', amount: '200', pnl: '-1.20' }
  ]);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'admin'>('profile');
  const [usersList, setUsersList] = useState<any[]>([]);

  // Mobile responsive state
  const [showRightSidebar, setShowRightSidebar] = useState(window.innerWidth >= 1024);

  const [walletAddress, setWalletAddress] = useState<string>('');
  const [buyingPro, setBuyingPro] = useState(false);

  const connectWallet = async () => {
    // @ts-ignore
    if (typeof window !== 'undefined' && typeof window.ethereum !== 'undefined') {
        try {
            // @ts-ignore
            const provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();
            setWalletAddress(address);
        } catch (err) {
            console.error(err);
            alert("Failed to connect wallet");
        }
    } else {
        alert("Please install MetaMask or another Web3 wallet extending window.ethereum.");
    }
  };

  const handleBuyPro = async () => {
    if (!walletAddress) {
        alert("Please connect wallet first");
        return;
    }
    setBuyingPro(true);
    try {
        // @ts-ignore
        const provider = new ethers.BrowserProvider(window.ethereum);

        const network = await provider.getNetwork();
        if (network.chainId !== 8453n && network.chainId !== BigInt(8453)) {
            try {
                // @ts-ignore
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x2105' }], // 8453 in Hex
                });
            } catch (switchError: any) {
                if (switchError.code === 4902) {
                    throw new Error("Base network is not added to your wallet. Please add it manually.");
                }
                throw new Error("Please switch your wallet network to Base Mainnet (Chain ID 8453).");
            }
        }

        const signer = await provider.getSigner();
        
        // Example Subscription Contract Address on Base
        let contractAddress = import.meta.env.VITE_PRO_CONTRACT_ADDRESS || "";
        const usdcAddress = import.meta.env.VITE_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC Address
        
        if (!contractAddress || contractAddress === "0xYourContractAddressHere") {
            // Provide a graceful fallback to a known address if none provided
            alert("No PRO receiver address configured. Using a default test address for demonstration.");
            contractAddress = "0x000000000000000000000000000000000000dEaD";
        }

        if (!ethers.isAddress(contractAddress)) {
            throw new Error(`Invalid receiver address configured: ${contractAddress}`);
        }

        const amt = ethers.parseUnits("5", 6); // 5 USDC (6 decimals)
        const code = await provider.getCode(contractAddress);

        // NATIVE BALANCE CHECK FIRST TO PREVENT GAS ESTIMATION CRASHES
        const erc20BalanceAbi = ["function balanceOf(address owner) view returns (uint256)"];
        const balanceContract = new ethers.Contract(usdcAddress, erc20BalanceAbi, provider);
        const currentBalance = await balanceContract.balanceOf(walletAddress);
        if (currentBalance < amt) {
            throw new Error(`Insufficient USDC balance. You need at least 5 USDC, but you have ${ethers.formatUnits(currentBalance, 6)} USDC.`);
        }

        if (code === "0x") {
            // If the configured address is a WALLET (EOA), just send USDC directly.
            const erc20TransferAbi = ["function transfer(address to, uint256 amount) public returns (bool)"];
            const tokenContract = new ethers.Contract(usdcAddress, erc20TransferAbi, signer);
            
            const tx = await tokenContract.transfer(contractAddress, amt);
            await tx.wait();
        } else {
            // If the configured address is a SMART CONTRACT, do approve + subscribe.
            const erc20Abi = ["function approve(address spender, uint256 amount) public returns (bool)"];
            const subAbi = ["function subscribe(uint256 months) external"];
            
            const tokenContract = new ethers.Contract(usdcAddress, erc20Abi, signer);
            const subContract = new ethers.Contract(contractAddress, subAbi, signer);
            
            const tx1 = await tokenContract.approve(contractAddress, amt);
            await tx1.wait();
            
            const tx2 = await subContract.subscribe(1);
            await tx2.wait();
        }
        
        // Auto upgrade role on backend
        await axios.post('/api/users/upgrade-pro', {});
        alert("Subscribed successfully! Returning to app, please refresh to load Pro features.");
        // We could refresh user state here or reload
        window.location.reload();
    } catch (err: any) {
        console.error(err);
        
        let msg = err.message;
        if (msg.includes("value.hash") || msg.includes("UNPREDICTABLE_GAS_LIMIT")) {
            msg = "Transaction failed to simulate. This usually means you don't have enough USDC on the current network, or you are on the wrong network. Ensure you have 5 USDC and native gas tokens.";
        } else if (msg.includes("user rejected")) {
            msg = "Transaction rejected by user.";
        }
        alert("Transaction failed: " + msg);
    }
    setBuyingPro(false);
  };

  useEffect(() => {
    fetchAnalyses();
  }, []);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchChartData();

    // Setup Binance WebSocket for live candles
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    const safeInterval = (!interval || interval === 'undefined') ? '1d' : interval;
    
    let reconnectAttempts = 0;
    
    const connectWs = () => {
      const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${safeInterval}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.e === 'kline') {
          const kline = message.k;
          const liveCandle = {
            time: Math.floor(kline.t / 1000),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
          };
          setLiveCandle(liveCandle);
        }
      };

      ws.onclose = () => {
        if (reconnectAttempts < 5) {
          reconnectAttempts++;
          setTimeout(connectWs, 2000 * reconnectAttempts);
        }
      };

      ws.onerror = (err) => {
         console.error('WebSocket Error:', err);
      };
    };
    
    connectWs();

    return () => {
       if (wsRef.current) wsRef.current.close();
    };
  }, [symbol, interval]);

  const fetchAnalyses = async () => {
    try {
      const res = await axios.get('/api/analysis');
      setAnalyses(res.data);
      if (res.data.length > 0) {
        // If we want to initially load the first active analysis
        // setActiveAnalysis(res.data[0]);
        // setSymbol(res.data[0].symbol);
        // setChartInterval(res.data[0].timeframe);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchChartData = async () => {
    setLoadingConfig(true);
    try {
      const safeInterval = (!interval || interval === 'undefined') ? '1d' : interval;
      const res = await axios.get(`/api/market/klines?symbol=${symbol}&interval=${safeInterval}&limit=500`);
      setChartData(res.data);
      
      // Clear active analysis if it doesn't match symbol/interval
      if (activeAnalysis && (activeAnalysis.symbol !== symbol || activeAnalysis.timeframe !== safeInterval)) {
        setActiveAnalysis(null);
      }
    } catch (err) {
      console.error(err);
    }
    setLoadingConfig(false);
  };

  const handleGenerate = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'pro')) return;
    setGenerating(true);
    try {
      const safeInterval = (!interval || interval === 'undefined') ? '1d' : interval;
      
      // Analyze mathematically locally instead of sending to server
      // We import analyzeElliottWaves dynamically or we should have it imported at the top
      const analyzeElliottWaves = (await import('../../ewEngine')).analyzeElliottWaves;
      const dataToAnalyze = chartData.slice(-200);
      const algoResult = analyzeElliottWaves(dataToAnalyze);
      
      const mathOutputText = algoResult 
        ? `Algorithmic Math Engine found a ${algoResult.trend} Wave 4 setup. 
           Calculated Entry Point: ${algoResult.entry}, Target: ${algoResult.target}, Invalidation Stop Loss: ${algoResult.stopLoss}. 
           Pivots Found: Start={time: ${algoResult.waves.start.time}, price: ${algoResult.waves.start.price}}, ...
           Reasoning: ${algoResult.reasoning}`
        : `Algorithmic Math Engine did not find a strict 100% textbook 5-wave structure matching constraints. Please provide a best-effort structural analysis based on patterns.`;

      let aiResult;
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `
          You are a highly skilled professional crypto trader and quantitative analyst specializing in Elliott Wave Theory.
          
          We have an algorithmic pure-math engine that scans for pivot points and evaluates strict Elliott Wave mathematical constraints & Fibonacci relationships.
          Math Engine Output for Context: ${mathOutputText}
          
          Recent Candlestick Data Snapshop for ${symbol} on ${safeInterval} TF:
          ${JSON.stringify(dataToAnalyze.slice(-25))}
          
          Your task is to synthesize the math engine's output with your AI capability.
          Confirm the Entry, Target, and Stop Loss points, and adjust them if you detect local support/resistance or candlestick exhaustion patterns. 
          If the engine found no setup, find the closest structural opportunity or give a neutral standing. Provide a theoretical winning probability percentage based on the strength of the setup (e.g. "85%").
          
          You must return the result as a valid JSON object matching this schema exactly, just raw JSON (no markdown):
          {
            "analysisText": "Your expert synthesis: How does the raw data support the engine's finding? What's the final trade rationale? EXPLAIN the reasoning for the exit point, entry point, and stop-loss targets.",
            "winRate": "<percentage>%",
            "entryPoint": <number>,
            "exitPoint": <number>,
            "stopLoss": <number>,
            "trend": "bullish" | "bearish" | "neutral",
            "wavePoints": [ {"time": <number exact same from time in provided array>, "price": <number>}, ...]
          }
        `;

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        });
        
        let text = aiResponse.text?.trim() || "{}";
        text = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        if (text.startsWith('```')) {
            text = text.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        aiResult = JSON.parse(text);
      } catch (aiError: any) {
        console.warn("AI generation failed or had incorrect scopes. Falling back to math engine output.", aiError);
        aiResult = {
          analysisText: `⚠️ AI connection failed: ${aiError.message}\n\nShowing pure algorithmic math engine output:\n\n${algoResult?.reasoning || 'No mathematical logic computed.'}`,
          winRate: algoResult ? "70%" : "N/A",
          entryPoint: algoResult?.entry || dataToAnalyze[dataToAnalyze.length - 1].close,
          exitPoint: algoResult?.target || dataToAnalyze[dataToAnalyze.length - 1].close * 1.05,
          stopLoss: algoResult?.stopLoss || dataToAnalyze[dataToAnalyze.length - 1].close * 0.95,
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

      // Format for saving locally (fake persistence in UI without db for now to be fast)
      // or optionally post to a save backend endpoint if needed.
      const newAnalysis = {
         _id: 'local-' + Date.now(),
         ...aiResult,
         symbol,
         timeframe: safeInterval,
         timestamp: new Date().toISOString(),
      };
      
      setAnalyses([newAnalysis, ...analyses]);
      setActiveAnalysis(newAnalysis);
      
      // Auto-add a notification
      addNotification(`Engine processed ${symbol} - Trend: ${newAnalysis.trend}`);
    } catch (err: any) {
      alert('Failed to generate: ' + err.message);
    }
    setGenerating(false);
  };

  useEffect(() => {
    if (showSettings && settingsTab === 'admin' && user?.role === 'admin') {
      fetchUsers();
    }
  }, [showSettings, settingsTab]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/users');
      setUsersList(res.data);
    } catch(err) {
      console.error(err);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      await axios.put(`/api/users/${userId}`, { role: newRole });
      fetchUsers();
    } catch(err: any) {
      alert('Failed to update user: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleScanBestPair = async () => {
    setScanning(true);
    try {
      const res = await axios.get('/api/market/scan');
      if (res.data && res.data.topPairs && res.data.topPairs.length > 0) {
        const topPairs = res.data.topPairs;
        const best = topPairs[0];
        const newSymbols = topPairs.map((p: any) => p.symbol);
        
        setWatchlist((prev: string[]) => {
          const updated = Array.from(new Set([...prev, ...newSymbols]));
          localStorage.setItem('hyperwave_watchlist', JSON.stringify(updated));
          return updated;
        });
        
        addNotification(`Engine found best pairs: ${newSymbols.join(', ')}`);
        setSymbol(best.symbol);
        setSymbolInput(best.symbol);
      }
    } catch(err) {
      console.error("Scan error", err);
    }
    setScanning(false);
  };
  
  // Flash notifications every 5 mins or so auto scan
  useEffect(() => {
    const scanInterval = setInterval(() => {
       if (user?.role === 'admin' || user?.role === 'pro') {
         handleScanBestPair();
       }
    }, 60000 * 5); // every 5 minutes
    return () => clearInterval(scanInterval);
  }, [user]);

  const addNotification = (msg: string) => {
    setNotifications(prev => [{ id: Date.now(), msg, time: new Date() }, ...prev]);
    setHasNewNotif(true);
  };
  
  const handlePlaceTrade = async () => {
    setPlacingTrade(true);
    try {
      const res = await axios.post('/api/trade/place', {
        symbol,
        side: tradeSide,
        amount: tradeAmount,
        leverage: tradeLeverage,
        takeProfit: tradeTP,
        stopLoss: tradeSL
      });
      alert(res.data.message);
      setOpenTrades(prev => [{
        id: Date.now().toString(),
        symbol,
        side: tradeSide,
        amount: tradeAmount,
        pnl: '+0.00'
      }, ...prev]);
    } catch(err: any) {
      alert('Trade failed: ' + (err.response?.data?.error || err.message));
    }
    setPlacingTrade(false);
  };

  const selectAnalysis = (item: any) => {
    setActiveAnalysis(item);
    let newInterval = item.timeframe;
    if (!newInterval || newInterval === 'undefined') {
       newInterval = '1d';
    }
    
    if (symbol !== item.symbol || interval !== newInterval) {
      setSymbol(item.symbol || 'BTCUSDT');
      setChartInterval(newInterval);
      setSymbolInput(item.symbol || 'BTCUSDT');
    } else if (item.chartData) {
      // Just swap to active immediately
      // Actually we are always showing the live chartData instead of the saved one for better UX,
      // but if we wanted to show historical snapshot:
      // setChartData(item.chartData);
    }
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#000] text-[#d1d4dc] flex flex-col font-sans overflow-hidden">
      {/* Top Header */}
      <header className="h-[52px] md:h-14 border-b border-[#2a2e39] flex justify-between items-center px-3 md:px-4 bg-[#131722] shrink-0 w-full z-30">
        {/* Left section: App Name & Mobile menu */}
        <div className="flex items-center gap-3 md:gap-4 flex-shrink-0">
          <button 
             className="lg:hidden p-1.5 text-[#787b86] hover:text-white rounded border border-[#2a2e39] bg-[#1e222d]"
             onClick={() => setShowRightSidebar(true)}
          >
             <Menu className="w-5 h-5" />
          </button>
          
          <div className="font-bold text-white text-base md:text-lg tracking-tight italic">Hyper Wave</div>
          <div className="h-5 w-[1px] bg-[#2a2e39] hidden md:block"></div>
        </div>

        {/* Middle section: Desktop Search & Timeframe */}
        <div className="hidden lg:flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#1e222d] px-2 py-1 rounded">
            <Search className="w-4 h-4 text-[#787b86]" />
            <input 
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && setSymbol(symbolInput)}
              onBlur={() => setSymbol(symbolInput)}
              className="bg-transparent border-none outline-none text-[#d1d4dc] w-24 text-sm font-medium focus:ring-0 uppercase placeholder:text-[#363a45]"
              placeholder="SYMBOL"
            />
          </div>
          
          <div className="h-5 w-[1px] bg-[#2a2e39] mx-2"></div>
          
          <div className="flex items-center space-x-1">
             {['15m', '1h', '4h', '1d', '1w'].map(tf => (
               <button 
                 key={tf}
                 onClick={() => setChartInterval(tf)}
                 className={`px-2 py-1 text-sm rounded transition-colors ${tf === interval ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:bg-[#2a2e39]'}`}
               >
                 {tf}
               </button>
             ))}
          </div>
        </div>

        {/* Right section: Admin Tools + Context + User */}
        <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
          <button 
            title="Add Split Chart"
             onClick={() => setAdditionalCharts([...additionalCharts, { symbol, interval }])}
             className="hidden md:flex items-center justify-center p-1.5 text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] rounded transition-colors"
          >
             <PlusSquare className="w-5 h-5" />
          </button>
          
          {/* Admin Tools - Mobile (Icons Only) */}
             {(user?.role === 'admin' || user?.role === 'pro') && (
               <>
                 <button 
                    onClick={handleScanBestPair} 
                    disabled={scanning}
                    className="lg:hidden flex items-center justify-center w-8 h-8 bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39] text-[#2962ff] rounded transition-colors"
                    title="Auto Select Pair"
                 >
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                 </button>

                 <button 
                    onClick={handleGenerate} 
                    disabled={generating || loadingConfig}
                    className="lg:hidden flex items-center justify-center w-8 h-8 bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded transition-colors disabled:opacity-50"
                    title="Auto Analyze"
                 >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                 </button>
               </>
             )}

          {/* Admin Tools - Desktop (With Text) */}
             {(user?.role === 'admin' || user?.role === 'pro') && (
               <>
                 <button 
                    onClick={handleScanBestPair} 
                    disabled={scanning}
                    className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39] text-[#2962ff] text-sm font-medium rounded transition-colors"
                 >
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span>Auto Select Pair</span>
                 </button>

                 <button 
                    onClick={handleGenerate} 
                    disabled={generating || loadingConfig}
                    className="hidden lg:flex items-center gap-1.5 px-4 py-1.5 bg-[#2962ff] hover:bg-[#1e53e5] text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
                 >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                    <span>Auto Analyze</span>
                 </button>
               </>
             )}

          <div className="h-5 w-[1px] bg-[#2a2e39] mx-1 md:mx-2 hidden sm:block"></div>
          
          <Dialog>
            <DialogTrigger 
              className={`p-1.5 rounded transition-all ${hasNewNotif ? 'text-[#f59e0b] animate-pulse bg-[#f59e0b]/10' : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'}`}
              onClick={() => setHasNewNotif(false)}
            >
              {hasNewNotif ? <BellRing className="w-5 h-5 md:w-4 md:h-4" /> : <Bell className="w-5 h-5 md:w-4 md:h-4" />}
            </DialogTrigger>
            <DialogContent className="bg-[#131722] border-[#2a2e39] text-[#d1d4dc] max-w-sm rounded-[8px]">
              <DialogHeader>
                <DialogTitle>Notifications</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto mt-4 pr-1">
                {notifications.length === 0 ? <p className="text-[#787b86] text-sm">No new notifications</p> : 
                  notifications.map(n => (
                    <div key={n.id} className="p-2 border-b border-[#2a2e39] text-sm">
                      <div className="text-white">{n.msg}</div>
                      <div className="text-xs text-[#787b86]">{n.time.toLocaleTimeString()}</div>
                    </div>
                  ))
                }
              </div>
            </DialogContent>
          </Dialog>

          <span className="text-[#787b86] text-xs ml-2 hidden xl:block">{user?.email}</span>
          <button onClick={() => setShowSettings(true)} className="p-1.5 text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] rounded transition-colors" title="Settings">
            <Settings className="w-5 h-5 md:w-4 md:h-4" />
          </button>
          <button onClick={() => setShowRightSidebar(!showRightSidebar)} className="hidden lg:flex p-1.5 text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] rounded transition-colors" title="Toggle Sidebar">
            {showRightSidebar ? <X className="w-5 h-5 md:w-4 md:h-4" /> : <Menu className="w-5 h-5 md:w-4 md:h-4" />}
          </button>
          <button onClick={logout} className="p-1.5 text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] rounded transition-colors" title="Log Out">
            <LogOut className="w-5 h-5 md:w-4 md:h-4" />
          </button>
        </div>
      </header>

      {/* Mobile Sub-Header: Search & Interval */}
      <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-[#131722] border-b border-[#2a2e39] shrink-0 z-20">
         <div className="flex items-center gap-1.5 bg-[#1e222d] px-2 py-1.5 rounded flex-1 mr-3 border border-[#2a2e39]">
            <Search className="w-3.5 h-3.5 text-[#787b86]" />
            <input 
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && setSymbol(symbolInput)}
              onBlur={() => setSymbol(symbolInput)}
              className="bg-transparent border-none outline-none text-[#d1d4dc] w-full text-xs font-bold focus:ring-0 uppercase placeholder:text-[#363a45]"
              placeholder="SYMBOL"
            />
         </div>
         
         <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
             {['15m', '1h', '4h', '1d', '1w'].map(tf => (
               <button 
                 key={tf}
                 onClick={() => setChartInterval(tf)}
                 className={`px-2.5 py-1.5 text-xs rounded font-medium ${tf === interval ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] active:bg-[#2a2e39]'}`}
               >
                 {tf}
               </button>
             ))}
         </div>
      </div>

      {/* Main App Body */}
      <div className="flex flex-col-reverse md:flex-row flex-1 overflow-hidden relative">
        
        {/* Left/Bottom Toolbar */}
        <aside className="w-full h-auto min-h-[52px] md:w-[52px] md:h-full border-t md:border-t-0 md:border-r border-[#2a2e39] flex flex-row md:flex-col items-center md:items-center py-2 md:py-4 px-4 md:px-0 gap-2 md:gap-4 shrink-0 bg-[#131722] z-[15] overflow-x-auto no-scrollbar justify-start">
           <button onClick={() => setActiveTool('crosshair')} className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'crosshair' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><Crosshair className="w-5 h-5" /></button>
           <button onClick={() => setActiveTool('pointer')} className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'pointer' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><MousePointer2 className="w-5 h-5" /></button>
           
           <div className="flex flex-row md:flex-col items-center gap-1">
             <button onClick={() => setActiveTool('pen')} className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'pen' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><PenTool className="w-5 h-5" /></button>
             {activeTool === 'pen' && (
                <div className="flex flex-row md:flex-col gap-1.5 items-center p-1 bg-[#1e222d] border border-[#2a2e39] rounded">
                  {['#2962ff', '#e2e8f0', '#f23645', '#089981', '#f59e0b'].map(c => (
                    <button key={c} onClick={() => setDrawingColor(c)} style={{backgroundColor: c}} className={`w-3.5 h-3.5 rounded-full ${drawingColor === c ? 'ring-2 ring-white/50' : ''}`}/>
                  ))}
                  <button onClick={() => setClearDrawings(c => c + 1)} className="text-[10px] md:text-xs text-red-500 font-bold hover:bg-[#2a2e39] px-1 rounded ml-1 md:ml-0 md:mt-1">CLR</button>
                </div>
             )}
           </div>

           <button onClick={() => setActiveTool('trend')} className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'trend' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><TrendingUp className="w-5 h-5" /></button>
           
           <Dialog>
             <DialogTrigger className="p-1.5 flex-shrink-0 md:p-2 ml-auto mt-0 md:ml-0 md:mt-auto md:mb-4 text-[#787b86] hover:text-[#d1d4dc]">
               <Code className="w-5 h-5" />
             </DialogTrigger>
             <DialogContent className="bg-[#131722] border-[#2a2e39] text-[#d1d4dc]">
               <DialogHeader>
                 <DialogTitle className="text-white font-mono flex items-center gap-2">
                   <Code className="w-5 h-5 text-[#2962ff]" /> Pine Script Engine (Edge)
                 </DialogTitle>
               </DialogHeader>
               <div className="mt-4">
                 <p className="text-sm text-[#787b86] mb-4">Paste your custom Pine Script below. It will be compiled and executed via the backend mathematical parser before rendering.</p>
                 <textarea 
                   className="w-full h-40 bg-[#1e222d] border border-[#2a2e39] rounded p-3 text-sm font-mono focus:outline-none focus:border-[#2962ff] text-[#089981]"
                   placeholder="// @version=5
indicator('Custom Script', overlay=true)
plot(close)"
                 ></textarea>
                 <button className="mt-4 w-full py-2 bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium rounded transition-colors">
                   Compile & Apply to Chart
                 </button>
               </div>
             </DialogContent>
           </Dialog>
        </aside>

        {/* Center Canvas */}
        <main className="flex-1 relative bg-[#000000] flex flex-col min-h-0 w-full overflow-y-auto">
          {chartData.length > 0 ? (
            <div className={`flex-1 w-full relative grid gap-1 p-1 bg-[#131722] ${additionalCharts.length > 0 ? (additionalCharts.length === 1 ? 'grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1' : additionalCharts.length === 2 ? 'grid-cols-1 grid-rows-3 md:grid-cols-2 md:grid-rows-2' : 'grid-cols-2 md:grid-cols-2') : 'grid-cols-1'}`}>
              <div className="relative border border-[#2a2e39] flex flex-col min-h-[400px]">
                <WaveChart 
                   data={chartData} 
                   liveCandle={liveCandle}
                   entryPoint={activeAnalysis?.entryPoint} 
                   exitPoint={activeAnalysis?.exitPoint} 
                   stopLoss={activeAnalysis?.stopLoss} 
                   wavePoints={activeAnalysis?.wavePoints}
                   trend={activeAnalysis?.trend}
                   activeTool={activeTool}
                   drawingColor={drawingColor}
                   clearDrawings={clearDrawings}
                />
              </div>
              {additionalCharts.map((c, i) => (
                <div key={i} className="relative border border-[#2a2e39] flex flex-col min-h-[300px]">
                  <MiniChart 
                     symbol={c.symbol} 
                     interval={c.interval} 
                     activeTool={activeTool} 
                     onClose={() => setAdditionalCharts(additionalCharts.filter((_, idx) => idx !== i))} 
                  />
                </div>
              ))}
            </div>
          ) : (
             <div className="flex-1 flex items-center justify-center text-[#787b86]">
                {loadingConfig ? <Loader2 className="w-8 h-8 animate-spin" /> : 'No Chart Data'}
             </div>
          )}
        </main>

        {/* Right Sidebar - Analysis & Tools */}
        {showRightSidebar && (
        <div className={`fixed mt-0 top-[52px] lg:top-0 right-0 z-20 h-[calc(100vh-52px)] lg:h-full w-[85%] max-w-[340px] lg:w-[340px] lg:static border-l border-[#2a2e39] flex flex-col bg-[#131722] shrink-0 overflow-y-auto shadow-2xl lg:shadow-none translate-x-0`}>
           {/* Mobile header inside right sidebar */}
           <div className="lg:hidden flex justify-between items-center p-3 border-b border-[#2a2e39]">
             <span className="font-bold text-white text-sm">Dashboard</span>
             <button onClick={() => setShowRightSidebar(false)} className="p-1.5 text-[#787b86] hover:text-white rounded bg-[#1e222d]"><X className="w-4 h-4"/></button>
           </div>
           
           {activeAnalysis ? (
             <div className="p-3 md:p-4 flex flex-col gap-4 md:gap-6">
                <div>
                   <h2 className="text-lg md:text-xl font-bold text-white leading-none tracking-tight">{activeAnalysis.symbol}</h2>
                   <div className="text-[#787b86] text-sm mt-1">{activeAnalysis.timeframe} • Generated Analysis</div>
                </div>

                <div className="bg-[#1e222d] border border-[#2a2e39] rounded p-3 text-sm">
                   <div className="text-xs uppercase text-[#787b86] font-semibold mb-2 flex items-center gap-1">
                      <Activity className="w-3 h-3" /> System Output
                   </div>
                   <div className="leading-relaxed text-[#d1d4dc] whitespace-pre-wrap">
                      {activeAnalysis.analysisText}
                   </div>
                </div>

                <div className="flex flex-col gap-3">
                   <div className="text-xs uppercase text-[#787b86] font-semibold">Trade Setup</div>
                   <div className="grid grid-cols-2 gap-2">
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Direction</div>
                       <div className={`text-sm font-bold uppercase mt-1 ${
                          activeAnalysis.trend === 'bullish' ? 'text-[#089981]' :
                          activeAnalysis.trend === 'bearish' ? 'text-[#f23645]' : 'text-[#d1d4dc]'
                       }`}>
                         {activeAnalysis.trend}
                       </div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Win Rate</div>
                       <div className="text-[#2962ff] font-mono text-sm mt-1">{activeAnalysis.winRate || '-'}</div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Entry</div>
                       <div className="text-[#2962ff] font-mono text-sm mt-1">{activeAnalysis.entryPoint || '-'}</div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Target</div>
                       <div className="text-[#089981] font-mono text-sm mt-1">{activeAnalysis.exitPoint || '-'}</div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Stop Loss</div>
                       <div className="text-[#f23645] font-mono text-sm mt-1">{activeAnalysis.stopLoss || '-'}</div>
                     </div>
                   </div>
                   
                   <div className="text-[10px] text-[#787b86] italic text-center mt-2">
                      This is not financial advice, it is just data.
                   </div>
                </div>
                

                
                <button 
                  onClick={() => setActiveAnalysis(null)} 
                  className="mt-4 w-full py-2 hover:bg-[#2a2e39] text-[#787b86] rounded text-sm transition-colors"
                >
                  Clear Active Setup
                </button>
             </div>
           ) : (
             <div className="flex-1 flex flex-col pt-2">
                <div className="flex border-b border-[#2a2e39]">
                   <button 
                     onClick={() => setRightSidebarTab('watchlist')}
                     className={`flex-1 py-3 text-[10px] sm:text-xs uppercase font-bold tracking-wider border-b-2 transition-colors ${rightSidebarTab === 'watchlist' ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'}`}
                   >
                     Watchlist
                   </button>
                   <button 
                     onClick={() => setRightSidebarTab('trades')}
                     className={`flex-1 py-3 text-[10px] sm:text-xs uppercase font-bold tracking-wider border-b-2 transition-colors ${rightSidebarTab === 'trades' ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'}`}
                   >
                     Trades
                   </button>
                </div>
                
                <div className="p-4 flex flex-col flex-1 overflow-y-auto">
                   {rightSidebarTab === 'watchlist' ? (
                      <div className="flex flex-col gap-2">
                         <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-[#787b86]">Your Pairs</span>
                            <button 
                               onClick={() => toggleWatchlist(symbol)}
                               className="text-xs bg-[#1e222d] border border-[#2a2e39] px-2 py-1 rounded text-[#2962ff] font-medium hover:bg-[#2a2e39] transition-colors"
                            >
                               {watchlist.includes(symbol) ? '- Remove Current' : '+ Add Current'}
                            </button>
                         </div>
                         {watchlist.length === 0 ? (
                            <div className="text-sm text-[#787b86] italic text-center py-8">
                               Watchlist is empty.
                            </div>
                         ) : (
                            watchlist.map((sym, idx) => (
                               <button 
                                 key={`${sym}-${idx}`}
                                 onClick={() => {
                                    setSymbol(sym);
                                    setSymbolInput(sym);
                                    if(window.innerWidth < 768) setShowRightSidebar(false);
                                 }}
                                 className="flex justify-between items-center p-3 rounded border border-[#2a2e39] bg-[#1e222d] hover:bg-[#2a2e39] text-left transition-colors"
                               >
                                  <span className="font-bold text-white text-sm">{sym}</span>
                                  <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(sym); }} className="text-[#787b86] hover:text-[#f23645]"><X className="w-3.5 h-3.5"/></button>
                               </button>
                            ))
                         )}
                      </div>
                   ) : rightSidebarTab === 'trades' ? (
                      <div className="flex flex-col gap-2">
                         <div className="text-xs text-[#787b86] mb-1">Active Positions</div>
                         {openTrades.length === 0 ? (
                           <div className="text-sm text-[#787b86] italic text-center py-8">
                              No open trades.
                           </div>
                         ) : (
                           openTrades.map((trade) => (
                              <div key={trade.id} className="flex flex-col p-3 rounded border border-[#2a2e39] bg-[#1e222d] text-left">
                                 <div className="flex justify-between items-center w-full mb-2">
                                    <span className="font-bold text-white text-sm"><span className={trade.side === 'BUY' ? 'text-[#089981]' : 'text-[#f23645]'}>{trade.side}</span> {trade.symbol}</span>
                                    <span className={`text-sm font-bold ${trade.pnl.startsWith('+') ? 'text-[#089981]' : trade.pnl.startsWith('-') ? 'text-[#f23645]' : 'text-[#787b86]'}`}>{trade.pnl} USDT</span>
                                 </div>
                                 <div className="text-xs text-[#787b86] mb-3">Amount: {trade.amount} USDT</div>
                                 {user?.role === 'admin' && (
                                 <div className="flex gap-2">
                                   <button onClick={() => alert('Take Profit Set!')} className="flex-1 bg-[#2a2e39] py-1 text-white text-[10px] rounded hover:bg-[#363a45] transition-colors">Set TP/SL</button>
                                   <button onClick={() => setOpenTrades(prev => prev.filter(t => t.id !== trade.id))} className="flex-1 bg-[#2a2e39] py-1 text-white text-[10px] rounded hover:bg-[#363a45] transition-colors">Close</button>
                                 </div>
                                 )}
                              </div>
                           ))
                         )}
                      </div>
                   ) : null}
                </div>
              </div>
            )}
            
            {/* Trade Section - Only visible to super admin */}
            {user?.role === 'admin' && (
            <div className="bg-[#1e222d] border-t border-[#2a2e39] p-4 text-sm mt-auto shrink-0 flex flex-col z-20 w-full" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
                <div className="text-xs uppercase text-[#787b86] font-semibold mb-3 flex items-center justify-between">
                   <div className="flex flex-row items-center gap-1"><DollarSign className="w-3 h-3" /> Execute Trade</div>
                   <div className="text-white bg-[#131722] px-2 py-0.5 rounded border border-[#2a2e39]">{symbol}</div>
                </div>
                <div className="flex gap-2 mb-3">
                   <button 
                      onClick={() => setTradeSide('BUY')}
                      className={`flex-1 py-1.5 rounded font-bold text-xs ${tradeSide === 'BUY' ? 'bg-[#089981] text-white' : 'bg-[#2a2e39] text-[#787b86] hover:bg-[#363a45]'}`}
                   >
                      BUY
                   </button>
                   <button 
                      onClick={() => setTradeSide('SELL')}
                      className={`flex-1 py-1.5 rounded font-bold text-xs ${tradeSide === 'SELL' ? 'bg-[#f23645] text-white' : 'bg-[#2a2e39] text-[#787b86] hover:bg-[#363a45]'}`}
                   >
                      SELL
                   </button>
                </div>
                <div className="flex gap-2 mb-3">
                   <div className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-3 py-1.5 flex items-center">
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
                   </div>
                </div>
                <div className="flex gap-2 mb-3">
                   <div className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-3 py-1.5 flex flex-col">
                      <span className="text-[10px] text-[#787b86]">Target (TP)</span>
                      <input 
                        value={tradeTP}
                        onChange={e => setTradeTP(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-white text-sm mt-0.5" 
                        placeholder="Price" 
                      />
                   </div>
                   <div className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-3 py-1.5 flex flex-col">
                      <span className="text-[10px] text-[#787b86]">Stop (SL)</span>
                      <input 
                        value={tradeSL}
                        onChange={e => setTradeSL(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-white text-sm mt-0.5" 
                        placeholder="Price" 
                      />
                   </div>
                </div>
                <button 
                   onClick={handlePlaceTrade}
                   disabled={placingTrade}
                   className={`w-full py-2 rounded text-white font-bold flex flex-col items-center justify-center gap-0.5 transition-colors ${
                       (placingTrade) ? 'bg-[#2a2e39] text-[#787b86] cursor-not-allowed' :
                       tradeSide === 'BUY' ? 'bg-[#089981] hover:bg-[#067a67]' : 'bg-[#f23645] hover:bg-[#c92b3a]'
                   }`}
                >
                   <div className="flex items-center gap-2">
                     {placingTrade ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                     Place {tradeSide} Order
                   </div>
                </button>
            </div>
            )}
        </div>
        )}

        {/* Overlay for mobile when sidebar is open */}
        {showRightSidebar && (
          <div 
            className="fixed inset-0 bg-black/50 z-10 md:hidden mt-[52px]" 
            onClick={() => setShowRightSidebar(false)}
          />
        )}
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[700px] bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]">
          <DialogHeader className="border-b border-[#2a2e39] pb-4 mb-4">
            <DialogTitle className="text-white text-xl">Settings</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col md:flex-row gap-6 min-h-[400px]">
             {/* Settings Sidebar */}
             <div className="w-full md:w-1/4 flex flex-col gap-2 border-b md:border-b-0 md:border-r border-[#2a2e39] pb-4 md:pb-0 pr-0 md:pr-4">
                <button 
                  onClick={() => setSettingsTab('profile')}
                  className={`text-left p-2 rounded text-sm font-bold transition-colors ${settingsTab === 'profile' ? 'bg-[#2962ff] text-white' : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-white'}`}
                >
                  My Profile & Wallet
                </button>
                <button 
                  onClick={() => setSettingsTab('admin')}
                  className={`text-left p-2 rounded text-sm font-bold transition-colors ${settingsTab === 'admin' ? 'bg-[#2962ff] text-white' : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-white'}`}
                >
                  Super Admin
                </button>
             </div>

             {/* Settings Content */}
             <div className="flex-1 overflow-y-auto">
                {settingsTab === 'profile' ? (
                   <div className="space-y-6">
                      <div>
                         <h3 className="text-white font-bold mb-4">Personal Details</h3>
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                               <label className="block text-xs text-[#787b86] mb-1">Email</label>
                               <div className="bg-[#131722] border border-[#2a2e39] p-2 text-sm rounded text-white">{user?.email}</div>
                            </div>
                            <div>
                               <label className="block text-xs text-[#787b86] mb-1">Role</label>
                               <div className={`bg-[#131722] border border-[#2a2e39] p-2 text-sm rounded font-bold tracking-wide ${user?.role === 'admin' ? 'text-[#089981]' : user?.role === 'pro' ? 'text-[#2962ff]' : 'text-white'}`}>{user?.role?.toUpperCase() || 'USER'}</div>
                            </div>
                         </div>
                      </div>

                      <div className="border-t border-[#2a2e39] pt-6">
                         <h3 className="text-white font-bold mb-4">Pro Subscription</h3>
                         {user?.role === 'pro' || user?.role === 'admin' ? (
                           <div className="bg-[#2962ff]/10 border border-[#2962ff] p-4 rounded text-[#d1d4dc] text-sm">
                             <div className="text-[#2962ff] font-bold mb-1">PRO Active</div>
                             You currently have PRO access.
                           </div>
                         ) : (
                           <div className="bg-[#131722] border border-[#2a2e39] p-4 rounded text-[#d1d4dc] text-sm">
                             <p className="mb-4 text-[#787b86]">Upgrade to PRO to generate automated AI Elliott Wave Analyses directly on the charts.</p>
                             
                             {!walletAddress ? (
                               <button onClick={connectWallet} className="w-full bg-[#0052ff] hover:bg-[#0042cc] text-white font-bold py-2 rounded transition-colors mb-2">
                                 Connect Web3 Wallet (Base)
                               </button>
                             ) : (
                               <div className="mb-2 text-xs bg-[#2a2e39] p-2 rounded text-center text-[#d1d4dc] font-mono break-all border border-[#363a45]">
                                 💳 Connected: {walletAddress.slice(0,6)}...{walletAddress.slice(-4)}
                               </div>
                             )}

                             <button 
                                onClick={handleBuyPro} 
                                disabled={!walletAddress || buyingPro}
                                className="w-full bg-transparent border border-[#2962ff] hover:bg-[#2962ff]/10 text-[#2962ff] font-bold py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                             >
                                {buyingPro ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Buy PRO ($5 / mo)
                             </button>
                           </div>
                         )}
                      </div>
                    </div>
                 ) : (
                   <div className="space-y-6">
                      <div className="bg-[#2962ff]/10 border border-[#2962ff]/30 text-[#2962ff] px-4 py-3 rounded text-sm mb-6 flex items-center gap-2">
                         <Activity className="w-4 h-4" />
                         You have Super Admin privileges.
                      </div>
                      
                      <div>
                         <h3 className="text-white font-bold mb-4">All Users & Permissions</h3>
                         
                         <div className="bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden">
                           <div className="flex justify-between items-center p-3 border-b border-[#2a2e39] text-xs font-bold uppercase text-[#787b86]">
                              <div className="w-1/3">User</div>
                              <div className="w-1/4">Role</div>
                              <div className="w-1/4">Action</div>
                           </div>
                           
                           {usersList.map((u, idx) => (
                              <div key={u._id || idx} className="flex justify-between items-center p-4 border-b border-[#2a2e39] last:border-0">
                                 <div className="w-1/3">
                                   <div className="text-sm font-bold text-white">{u.email}</div>
                                   <div className={`text-xs ${u.role === 'admin' ? 'text-[#089981]' : u.role === 'pro' ? 'text-[#2962ff]' : 'text-[#787b86]'}`}>{u.role.toUpperCase()}</div>
                                 </div>
                                 <div className="w-1/4">
                                    <select 
                                      value={u.role} 
                                      onChange={(e) => updateUserRole(u._id, e.target.value)}
                                      className="bg-[#2a2e39] text-white text-xs border border-[#363a45] rounded p-1"
                                      disabled={u.email === user?.email}
                                    >
                                       <option value="user">User</option>
                                       <option value="pro">Pro</option>
                                       <option value="admin">Admin</option>
                                    </select>
                                 </div>
                                 <div className="w-1/4"><span className="text-xs bg-[#2a2e39] px-2 py-1 rounded text-white cursor-pointer hover:bg-[#363a45]">Manage</span></div>
                              </div>
                           ))}
                         </div>
                      </div>

                      <div className="border-t border-[#2a2e39] pt-6">
                         <h3 className="text-white font-bold mb-4">DeFi Pool Multi-Trade API</h3>
                         <div className="space-y-3">
                           <div>
                              <label className="block text-xs text-[#787b86] mb-1">DEX Aggregator Contract</label>
                              <input type="text" className="w-full bg-[#131722] border border-[#2a2e39] p-2 text-sm rounded text-white outline-none focus:border-[#2962ff]" placeholder="0x..." />
                           </div>
                           <div>
                              <label className="block text-xs text-[#787b86] mb-1">Global Fee Collection Wallet</label>
                              <input type="text" className="w-full bg-[#131722] border border-[#2a2e39] p-2 text-sm rounded text-white outline-none focus:border-[#2962ff]" placeholder="0x..." />
                           </div>
                           <div className="flex items-center justify-between bg-[#131722] border border-[#2a2e39] p-3 rounded">
                              <div>
                                 <div className="text-sm text-white font-bold">Charge Platform Fee</div>
                                 <div className="text-xs text-[#787b86]">Deduct a small transparent fee dynamically</div>
                              </div>
                              <div className="w-10 h-5 bg-[#089981] rounded-full relative cursor-pointer">
                                 <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5" />
                              </div>
                           </div>
                           <button className="w-full bg-[#089981] hover:bg-[#067a67] text-white text-sm font-bold py-2 rounded transition-colors mt-2">Save Platform Settings</button>
                         </div>
                      </div>
                   </div>
                )}
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
