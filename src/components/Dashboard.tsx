import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useAuth } from './AuthProvider';
import axios from 'axios';
import { WaveChart } from './WaveChart';
import { MiniChart } from './MiniChart';
import {
  MousePointer2, Crosshair, PenTool, TrendingUp, Search,
  PlayCircle, Loader2, List, Activity, Settings, LogOut, Code,
  Bell, BellRing, DollarSign, Send, Menu, X, PlusSquare,
  AlignJustify, Square, Ruler, Spline, PanelRightClose, PanelRightOpen, Share2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ethers } from 'ethers';

export function Dashboard() {
  const { user, logout } = useAuth();
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<any>(null);
  const [profitCard, setProfitCard] = useState<any>(null);
  
  const [symbolInput, setSymbolInput] = useState(() => localStorage.getItem('hyperwave_symbol') || 'BTCUSDT');
  const [symbol, setSymbol] = useState(() => localStorage.getItem('hyperwave_symbol') || 'BTCUSDT');
  const [interval, setChartInterval] = useState(() => localStorage.getItem('hyperwave_interval') || '1d');
  
  // Persist symbol and interval changes
  useEffect(() => {
    localStorage.setItem('hyperwave_symbol', symbol);
    setSymbolInput(symbol); // Keep input in sync
  }, [symbol]);

  useEffect(() => {
    localStorage.setItem('hyperwave_interval', interval);
  }, [interval]);
  
  const [watchlist, setWatchlist] = useState<Array<{symbol: string, pinned: boolean, timestamp: number}>>([]);
  const [rightSidebarTab, setRightSidebarTab] = useState<'watchlist' | 'trades' | 'market'>('watchlist');
  const [additionalCharts, setAdditionalCharts] = useState<Array<{symbol: string, interval: string}>>([]);
  
  const [drawingColor, setDrawingColor] = useState('#2962ff');
  const [clearDrawings, setClearDrawings] = useState(0);

  useEffect(() => {
    const savedWatchlist = localStorage.getItem('hyperwave_watchlist');
    if (savedWatchlist) {
      try {
        const parsed = JSON.parse(savedWatchlist);
        if (parsed.length > 0 && typeof parsed[0] === 'string') {
          // migrate
          const migrated = parsed.map((s: string) => ({ symbol: s, pinned: true, timestamp: Date.now() }));
          setWatchlist(migrated);
          localStorage.setItem('hyperwave_watchlist', JSON.stringify(migrated));
        } else {
          setWatchlist(parsed);
        }
      } catch(e) {}
    }
  }, []);

  const toggleWatchlist = (sym: string) => {
    const existing = watchlist.find(w => w.symbol === sym);
    let updated;
    if (existing) {
       // if it exists, remove it if it was manually toggled (meaning we unpin/remove)
       updated = watchlist.filter(w => w.symbol !== sym);
    } else {
       // manually added to watchlist so pinned is true
       updated = [...watchlist, { symbol: sym, pinned: true, timestamp: Date.now() }];
    }
    setWatchlist(updated);
    localStorage.setItem('hyperwave_watchlist', JSON.stringify(updated));
  };
  
  const pinUnpinPair = (sym: string, e: any) => {
      e.stopPropagation();
      const updated = watchlist.map(w => w.symbol === sym ? { ...w, pinned: !w.pinned } : w);
      setWatchlist(updated);
      localStorage.setItem('hyperwave_watchlist', JSON.stringify(updated));
  };
  
  const [chartData, setChartData] = useState<any[]>([]);
  const [liveCandle, setLiveCandle] = useState<any>(null);
  const [tickCount, setTickCount] = useState(0);
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
  const [openTrades, setOpenTrades] = useState<any[]>([]);
  const [closedTrades, setClosedTrades] = useState<any[]>([]);
  const [livePositions, setLivePositions] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'admin'>('profile');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [binanceBalance, setBinanceBalance] = useState<number | null>(null);
  const [autoBotBalance, setAutoBotBalance] = useState<number | null>(null);

  // Mobile responsive state
  const [showRightSidebar, setShowRightSidebar] = useState(window.innerWidth >= 1024);

  const [walletAddress, setWalletAddress] = useState<string>('');
  const [buyingPro, setBuyingPro] = useState(false);

  const [fng, setFng] = useState<{value: number, classification: string} | null>(null);
  const [orderBook, setOrderBook] = useState<{bids: any[], asks: any[]}>({bids: [], asks: []});

  useEffect(() => {
     // Fetch Fear and Greed
     axios.get('/api/fng').then(res => {
         if (res.data && res.data.data && res.data.data.length > 0) {
             const data = res.data.data[0];
             setFng({ value: parseInt(data.value), classification: data.value_classification });
         }
     }).catch(console.error);
  }, []);

  useEffect(() => {
     let active = true;
     const fetchOrderBook = async () => {
         if (!symbol) return;
         try {
             // using proxy to avoid CORS
             const res = await axios.get(`/api/market/depth?symbol=${symbol}&limit=15`);
             if (active) {
                 setOrderBook({
                     bids: res.data.bids || [],
                     asks: res.data.asks || []
                 });
             }
         } catch(err) {
             // ignore
         }
     };
     fetchOrderBook();
     const intervalId = setInterval(fetchOrderBook, 2000); // Poll every 2 seconds for fresh order book
     return () => {
         active = false;
         clearInterval(intervalId);
     };
  }, [symbol]);

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
    
    // We'll track two websockets to support both Futures and Spot symbols.
    // Whoever replies wins!
    let wsFutures: WebSocket | null = null;
    let wsSpot: WebSocket | null = null;
    let lastWsMessageTime = Date.now();
    let isPolling = false;
    
    // Polling fallback interval
    const pollingFallback = setInterval(async () => {
       if (Date.now() - lastWsMessageTime > 5000 && !isPolling) {
           isPolling = true;
           try {
               const res = await axios.get(`/api/market/klines?symbol=${symbol}&interval=${safeInterval}&limit=1`);
               if (res.data && res.data.length > 0) {
                   const d = res.data[0];
                   const liveCandle = {
                     time: Math.floor(new Date(d.time).getTime() / 1000),
                     open: parseFloat(d.open),
                     high: parseFloat(d.high),
                     low: parseFloat(d.low),
                     close: parseFloat(d.close),
                     volume: parseFloat(d.volume)
                   };
                   if (!(window as any).initialTickDone) {
                      console.log("Polling live candle:", liveCandle);
                      (window as any).initialTickDone = true;
                   }
                   setLiveCandle(liveCandle);
               }
           } catch(e) { }
           isPolling = false;
       }
    }, 2000);

    const connectWs = () => {
      const futuresWsUrl = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${safeInterval}`;
      const spotWsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${safeInterval}`;
      
      wsFutures = new WebSocket(futuresWsUrl);
      wsSpot = new WebSocket(spotWsUrl);

      const handleMessage = (event: MessageEvent) => {
        const message = JSON.parse(event.data);
        if (message.e === 'kline') {
          lastWsMessageTime = Date.now();
          const kline = message.k;
          const liveCandle = {
            time: Math.floor(kline.t / 1000),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
          };
          if (!(window as any).loggedCandle) {
             console.log("First live candle:", liveCandle);
             (window as any).loggedCandle = true;
          }
          setLiveCandle(liveCandle);
          setTickCount(c => c + 1);
        }
      };

      wsFutures.onmessage = handleMessage;
      wsSpot.onmessage = handleMessage;

      wsFutures.onclose = () => {
        if (reconnectAttempts < 5) {
          reconnectAttempts++;
          setTimeout(connectWs, 2000 * reconnectAttempts);
        }
      };
      // Ignore spot close event to prevent duplicate reconnect loops.
      wsSpot.onclose = () => {};

      wsFutures.onerror = (err) => {
         console.error('Futures WebSocket Error:', err);
      };
      
      wsRef.current = wsFutures; // for standard reference
    };
    
    connectWs();

    return () => {
       clearInterval(pollingFallback);
       if (wsFutures) wsFutures.close();
       if (wsSpot) wsSpot.close();
    };
  }, [symbol, interval]);

  const fetchAnalyses = async () => {
    try {
      const res = await axios.get('/api/analysis');
      setAnalyses(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const [globalAlerts, setGlobalAlerts] = useState<any[]>([]);

  const fetchGlobalAlerts = async () => {
    try {
      const res = await axios.get('/api/alerts');
      if (res.data && res.data.length > 0) {
         // Notify if new alert
         const newAlerts = res.data.filter((newAlert: any) => !globalAlerts.find(a => a.id === newAlert.id));
         if (newAlerts.length > 0) {
            newAlerts.forEach((na: any) => addNotification(`🚀 Setup: ${na.symbol} [${na.trend}] near ${na.entry}`));
            setGlobalAlerts(res.data);
         } else if (globalAlerts.length === 0) {
            setGlobalAlerts(res.data);
         }
      }
    } catch(e) {
      console.warn("Failed to fetch alerts", e);
    }
  };

  useEffect(() => {
    fetchGlobalAlerts();
    const interval = setInterval(fetchGlobalAlerts, 60000); // 1 minute
    return () => clearInterval(interval);
  }, [globalAlerts]);

  const fetchChartData = async () => {
    setLoadingConfig(true);
    setChartData([]); // Clear previous chart data before loading new
    try {
      const safeInterval = (!interval || interval === 'undefined') ? '1d' : interval;
      const res = await axios.get(`/api/market/klines?symbol=${symbol}&interval=${safeInterval}&limit=500`);
      setChartData(res.data);
      
      // Clear active analysis if it doesn't match symbol/interval
      if (activeAnalysis && (activeAnalysis.symbol !== symbol || activeAnalysis.timeframe !== safeInterval)) {
        setActiveAnalysis(null);
      }
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 400 || err.response?.status === 404 || err.response?.status === 500) {
          alert(`Pair ${symbol} not found on Binance. Please try a valid Binance Spot or Futures pair (e.g. BTCUSDT, ETHUSDT).`);
      }
    }
    setLoadingConfig(false);
  };

  const handleGenerate = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'pro')) return;
    setGenerating(true);
    try {
      const safeInterval = (!interval || interval === 'undefined') ? '1d' : interval;
      const dataToAnalyze = chartData.slice(-200);

      // Analyze mathematically locally for backup, or send to server to do both
      const analyzeElliottWaves = (await import('../../ewEngine')).analyzeElliottWaves;
      const algoResult = analyzeElliottWaves(dataToAnalyze, safeInterval);
      
      let aiResult;
      
      try {
         // Use the backend server to perform the Gemini API call safely
         // utilizing the backend's process.env.GEMINI_API_KEY
         const res = await axios.post('/api/analysis/generate', {
             symbol,
             interval: safeInterval,
             data: dataToAnalyze
         });
         aiResult = res.data;
         
         // Process the wave points returned from AI, adding labels if they exist
         if (aiResult.wavePoints && aiResult.wavePoints.length > 0) {
              aiResult.wavePoints = aiResult.wavePoints.map((wp: any, idx: number) => ({
                 time: wp.time,
                 price: wp.price,
                 label: idx.toString()
              }));
         } else if (aiResult.trend !== 'neutral' && algoResult && algoResult.waves) {
              // Only fallback to math engine waves IF AI determined a trend exists and just forgot points
              aiResult.wavePoints = [
                  { time: algoResult.waves.start.time, price: algoResult.waves.start.price, label: '0' },
                  { time: algoResult.waves.w1.time, price: algoResult.waves.w1.price, label: '1' },
                  { time: algoResult.waves.w2.time, price: algoResult.waves.w2.price, label: '2' },
                  { time: algoResult.waves.w3.time, price: algoResult.waves.w3.price, label: '3' },
                  { time: algoResult.waves.w4.time, price: algoResult.waves.w4.price, label: '4' }
              ];
         }
      } catch (err: any) {
         console.error("AI connection failed via backend. Falling back to math engine output.", err);
         const errorMsg = err.response?.data?.error || err.message || "Unknown error";
         
         aiResult = {
           analysisText: `⚠️ AI connection failed (Server Error): ${errorMsg}\n\nDisplaying strictly algorithmic math engine output:\n\n${algoResult?.reasoning || 'No mathematical logic computed.'}`,
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
         tradeStyle: algoResult?.tradeStyle,
         gainPct: algoResult?.gainPct,
         channelPoints: algoResult?.channelPoints,
         flagPoints: algoResult?.flagPoints,
         symbol,
         timeframe: safeInterval,
         timestamp: new Date().toISOString(),
      };
      
      setAnalyses([newAnalysis, ...analyses]);
      setActiveAnalysis(newAnalysis);
      
      // Hook auto trade 
      if (algoResult?.trend && algoResult.trend !== 'neutral') {
          axios.post('/api/trade/auto', {
             symbol,
             trend: algoResult.trend,
             entry: algoResult.entry,
             target: algoResult.target,
             stopLoss: algoResult.stopLoss,
             amount: 10,
             setupData: algoResult
          }).then(() => fetchTrades()).catch(()=>null);
      }
      
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

  const fetchTrades = async () => {
    try {
      const res = await axios.get('/api/trades');
      setOpenTrades(res.data.pending);
      setClosedTrades(res.data.closed);
      if (res.data.livePositions) setLivePositions(res.data.livePositions);
      if (res.data.balance !== undefined) setBinanceBalance(res.data.balance);
      if (res.data.autoBotBalance !== undefined) setAutoBotBalance(res.data.autoBotBalance);
    } catch(err) {
      // Failed to load
    }
  };

  useEffect(() => {
    fetchTrades();
    const intervalId = setInterval(fetchTrades, 15000); // every 15s
    return () => clearInterval(intervalId);
  }, []);

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      await axios.put(`/api/users/${userId}`, { role: newRole });
      fetchUsers();
    } catch(err: any) {
      alert('Failed to update user: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleRunOptimizer = async () => {
    try {
      addNotification("Starting background AI Optimizer using Gemini 3.1 Pro...");
      const res = await axios.post('/api/ml/optimize');
      addNotification(res.data.message || "Optimization complete.");
    } catch (err: any) {
      alert("Failed to run optimizer: " + (err.response?.data?.error || err.message));
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
        
        setWatchlist((prev) => {
          const pinned = prev.filter(p => p.pinned);
          const autoList = newSymbols.map((sym: string) => ({ symbol: sym, pinned: false, timestamp: Date.now() }));
          
          // As requested: auto remove old unpinned pairs, only keep manually pinned AND the newly scanned ones
          const finalUpdated = [...pinned];
          for (const a of autoList) {
             if (!finalUpdated.find(u => u.symbol === a.symbol)) {
                 finalUpdated.push(a);
             }
          }
          
          localStorage.setItem('hyperwave_watchlist', JSON.stringify(finalUpdated));
          return finalUpdated;
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
      fetchTrades();
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
      <header className="h-[52px] md:h-14 border-b border-[#2a2e39] flex justify-between items-center px-2 md:px-3 bg-[#131722] shrink-0 w-full z-30 gap-1 lg:gap-2">
        <div className="hidden 2xl:flex items-center text-xs text-[#089981] font-mono mr-2 gap-4 flex-shrink-0">
          <span>Live: {liveCandle?.close || '-'}</span>
          <span>Ticks: {tickCount}</span>
        </div>
        {/* Left section: App Name & Mobile menu */}
        <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
          <button 
             className="lg:hidden p-1.5 text-[#787b86] hover:text-white rounded border border-[#2a2e39] bg-[#1e222d]"
             onClick={() => setShowRightSidebar(true)}
          >
             <Menu className="w-5 h-5" />
          </button>
          
          <div className="font-bold text-white text-sm md:text-lg tracking-tight italic whitespace-nowrap hidden sm:block">Hyper Wave</div>
          <div className="font-bold text-white text-base tracking-tight italic whitespace-nowrap sm:hidden">HW</div>
          <div className="h-5 w-[1px] bg-[#2a2e39] hidden lg:block"></div>
        </div>

        {/* Middle section: Desktop Search & Timeframe */}
        <div className="hidden lg:flex items-center gap-1 xl:gap-2 flex-1 min-w-0 justify-center overflow-hidden">
          <div className="flex items-center gap-2 bg-[#1e222d] px-2 py-1 rounded w-[100px] xl:w-[120px] flex-shrink-0">
            <Search className="w-4 h-4 text-[#787b86] flex-shrink-0" />
            <input 
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && setSymbol(symbolInput)}
              onBlur={() => setSymbol(symbolInput)}
              className="bg-transparent border-none outline-none text-[#d1d4dc] w-full text-xs xl:text-sm font-medium focus:ring-0 uppercase placeholder:text-[#363a45]"
              placeholder="SYMBOL"
            />
          </div>
          
          <div className="h-5 w-[1px] bg-[#2a2e39] mx-1 flex-shrink-0"></div>
          
          <div className="flex items-center space-x-1 overflow-x-auto hide-scrollbar min-w-0">
             {['1m', '5m', '15m', '1h', '4h', '1d', '1w'].map(tf => (
               <button 
                 key={tf}
                 onClick={() => setChartInterval(tf)}
                 className={`px-1.5 xl:px-2 py-1 flex-shrink-0 text-xs rounded transition-colors ${tf === interval ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:bg-[#2a2e39]'}`}
               >
                 {tf}
               </button>
             ))}
          </div>
        </div>

        {/* Right section: Admin Tools + Context + User */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0 justify-end">
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
                    className="hidden lg:flex items-center gap-1.5 px-2 xl:px-3 py-1.5 bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39] text-[#2962ff] text-sm font-medium rounded transition-colors whitespace-nowrap"
                 >
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="hidden xl:inline">Auto Select Pair</span>
                 </button>

                 <button 
                    onClick={handleGenerate} 
                    disabled={generating || loadingConfig}
                    className="hidden lg:flex items-center gap-1.5 px-2 xl:px-4 py-1.5 bg-[#2962ff] hover:bg-[#1e53e5] text-white text-sm font-medium rounded transition-colors disabled:opacity-50 whitespace-nowrap"
                 >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                    <span className="hidden xl:inline">Auto Analyze</span>
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
            {showRightSidebar ? <PanelRightClose className="w-5 h-5 md:w-5 md:h-5 text-white" /> : <PanelRightOpen className="w-5 h-5 md:w-5 md:h-5" />}
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
             {['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'].map(tf => (
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
           </div>

           <button onClick={() => setActiveTool('trend')} title="Trend Line" className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'trend' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><TrendingUp className="w-5 h-5" /></button>
           <button onClick={() => setActiveTool('fibonacci')} title="Fibonacci Retracement" className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'fibonacci' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><AlignJustify className="w-5 h-5" /></button>
           <button onClick={() => setActiveTool('parallel')} title="Parallel Channel" className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'parallel' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><Spline className="w-5 h-5" /></button>
           <button onClick={() => setActiveTool('rectangle')} title="Rectangle" className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'rectangle' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><Square className="w-5 h-5" /></button>
           <button onClick={() => setActiveTool('measure')} title="Measure & Percentage" className={`p-1.5 flex-shrink-0 md:p-2 rounded ${activeTool === 'measure' ? 'text-[#2962ff] bg-[#2a2e39]' : 'text-[#787b86] hover:text-[#d1d4dc]'}`}><Ruler className="w-5 h-5" /></button>
           
           {['pen', 'trend', 'fibonacci', 'parallel', 'rectangle', 'measure'].includes(activeTool) && (
              <div className="flex flex-row md:flex-col gap-1.5 items-center p-1 bg-[#1e222d] border border-[#2a2e39] rounded mt-2">
                {['#2962ff', '#e2e8f0', '#f23645', '#089981', '#f59e0b'].map(c => (
                  <button key={c} onClick={() => setDrawingColor(c)} style={{backgroundColor: c}} className={`w-3.5 h-3.5 rounded-full ${drawingColor === c ? 'ring-2 ring-white/50' : ''}`}/>
                ))}
                <button onClick={() => setClearDrawings(c => c + 1)} className="text-[10px] md:text-xs text-red-500 font-bold hover:bg-[#2a2e39] px-1 rounded ml-1 md:ml-0 md:mt-1">CLR</button>
              </div>
           )}
           
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
              <div className="relative border border-[#2a2e39] flex flex-col min-h-[400px] resize-y overflow-hidden">
                <div className="absolute top-2 left-2 z-10 flex gap-2 pointer-events-none">
                  <div className="bg-[#1e222d]/80 backdrop-blur px-2 py-1 rounded text-xs font-bold text-white border border-[#2a2e39] flex items-center gap-2 pointer-events-auto shadow-md">
                    <span className="text-[#2962ff]">{symbol}</span>
                    <span className="text-[#787b86]">{interval}</span>
                    {liveCandle && <span className="ml-2 font-mono text-[#d1d4dc]">{liveCandle.close}</span>}
                  </div>
                </div>
                {(() => {
                  const activeAutoTrade = openTrades.find((t: any) => t.symbol === symbol && t.binanceOrderId);
                  const activeLivePosition = livePositions.find((p: any) => p.symbol === symbol);

                  const renderEntry = activeLivePosition?.entryPrice || activeAutoTrade?.entry || activeAnalysis?.entryPoint;
                  const renderExit = activeLivePosition?.target || activeAutoTrade?.target || activeAnalysis?.exitPoint;
                  const renderSL = activeLivePosition?.stopLoss || activeAutoTrade?.stopLoss || activeAnalysis?.stopLoss;
                  const renderTrend = activeLivePosition ? (activeLivePosition.side === 'BUY' ? 'bullish' : 'bearish') : activeAutoTrade?.trend || activeAnalysis?.trend;

                  return (
                    <WaveChart 
                       symbol={symbol}
                       interval={interval}
                       data={chartData} 
                       liveCandle={liveCandle}
                       entryPoint={renderEntry} 
                       exitPoint={renderExit} 
                       stopLoss={renderSL} 
                       wavePoints={activeAnalysis?.wavePoints}
                       channelPoints={activeAnalysis?.channelPoints}
                       flagPoints={activeAnalysis?.flagPoints}
                       trend={renderTrend}
                       activeTool={activeTool}
                       drawingColor={drawingColor}
                       clearDrawings={clearDrawings}
                       onToolDone={() => setActiveTool('crosshair')}
                    />
                  );
                })()}
              </div>
              {additionalCharts.map((c, i) => (
                <div key={i} className="relative border border-[#2a2e39] flex flex-col min-h-[300px] resize overflow-hidden">
                  <MiniChart 
                     symbol={c.symbol} 
                     interval={c.interval} 
                     activeTool={'crosshair'} 
                     onClose={() => setAdditionalCharts(additionalCharts.filter((_, idx) => idx !== i))}
                     onChange={(newSym, newInt) => {
                       const updated = [...additionalCharts];
                       updated[i] = { symbol: newSym, interval: newInt };
                       setAdditionalCharts(updated);
                     }}
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
                       <div className="text-[#787b86] text-xs">Trade Style</div>
                       <div className="text-[#2962ff] font-mono text-sm mt-1">{activeAnalysis.tradeStyle || 'STANDARD'}</div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Entry</div>
                       <div className="text-[#2962ff] font-mono text-sm mt-1">{activeAnalysis.entryPoint || '-'}</div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Stop Loss</div>
                       <div className="text-[#f23645] font-mono text-sm mt-1">{activeAnalysis.stopLoss || '-'}</div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Target</div>
                       <div className="text-[#089981] font-mono text-sm mt-1">{activeAnalysis.exitPoint || '-'}</div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                       <div className="text-[#787b86] text-xs">Predicted Gain</div>
                       <div className="text-[#089981] font-mono text-sm mt-1">{activeAnalysis.gainPct ? `+${activeAnalysis.gainPct}%` : '-'}</div>
                     </div>
                     <div className="bg-[#1e222d] p-3 rounded border border-[#2a2e39] col-span-2">
                       <div className="text-[#787b86] text-xs">AI Probability</div>
                       <div className="text-[#eab308] font-mono text-sm mt-1">{activeAnalysis.winRate || 'Calculating...'}</div>
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
                   <button 
                     onClick={() => setRightSidebarTab('market')}
                     className={`flex-1 py-3 text-[10px] sm:text-xs uppercase font-bold tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1 ${rightSidebarTab === 'market' ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'}`}
                   >
                     Order Book
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
                               {watchlist.some(w => w.symbol === symbol) ? '- Remove Current' : '+ Add Current'}
                            </button>
                         </div>
                         {watchlist.length === 0 ? (
                            <div className="text-sm text-[#787b86] italic text-center py-8">
                               Watchlist is empty.
                            </div>
                         ) : (
                            watchlist.map((item, idx) => (
                               <button 
                                 key={`${item.symbol}-${idx}`}
                                 onClick={() => {
                                    setSymbol(item.symbol);
                                    setSymbolInput(item.symbol);
                                    if(window.innerWidth < 768) setShowRightSidebar(false);
                                 }}
                                 className="flex justify-between items-center p-3 rounded border border-[#2a2e39] bg-[#1e222d] hover:bg-[#2a2e39] text-left transition-colors group"
                               >
                                  <span className="font-bold text-white text-sm">{item.symbol}</span>
                                  <div className="flex gap-2 items-center">
                                     <button onClick={(e) => pinUnpinPair(item.symbol, e)} className={`${item.pinned ? 'text-[#2962ff]' : 'text-[#787b86] opacity-0 group-hover:opacity-100'} hover:text-[#2962ff] transition-all`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
                                     </button>
                                     <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(item.symbol); }} className="text-[#787b86] hover:text-[#f23645]">
                                        <X className="w-3.5 h-3.5"/>
                                     </button>
                                  </div>
                               </button>
                            ))
                         )}
                      </div>
                   ) : rightSidebarTab === 'trades' ? (
                      <div className="flex flex-col gap-4">
                         {binanceBalance !== null && (
                            <div className="bg-[#2962ff]/10 border border-[#2962ff]/30 p-3 rounded flex justify-between items-center">
                               <span className="text-xs text-[#2962ff] font-bold uppercase">Binance Wallet</span>
                               <span className="text-white font-bold">${binanceBalance.toFixed(2)} USDT</span>
                            </div>
                         )}
                         <div className="flex-1">
                           <div className="text-xs text-[#2962ff] font-bold mb-2 uppercase">Live Binance Positions</div>
                           {livePositions.length === 0 ? (
                             <div className="text-sm text-[#787b86] italic py-2">No active positions.</div>
                           ) : (
                             <div className="flex flex-col gap-2">
                               {livePositions.map((pos: any, idx) => (
                                  <div 
                                     key={idx} 
                                     onClick={() => setSymbol(pos.symbol)}
                                     className="flex flex-col p-3 rounded border border-[#2a2e39] bg-[#1e222d] text-left cursor-pointer hover:border-[#2962ff] transition-colors"
                                  >
                                     <div className="flex justify-between items-center w-full mb-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-white text-sm">
                                              <span className={pos.side === 'BUY' ? 'text-[#089981]' : 'text-[#f23645]'}>{pos.side === 'BUY' ? 'LONG' : 'SHORT'}</span> {pos.symbol}
                                          </span>
                                          {pos.binanceOrderId && pos.binanceOrderId.startsWith('paper_') && <span className="text-[10px] bg-[#ff9800]/20 text-[#ff9800] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-[#ff9800]/50 shadow-[0_0_8px_rgba(255,152,0,0.3)] animate-pulse">PAPER</span>}
                                        </div>
                                        <span className={`text-xs font-bold ${pos.unRealizedProfit > 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                                          ${pos.unRealizedProfit.toFixed(2)}
                                        </span>
                                     </div>
                                     <div className="flex justify-between items-center w-full mb-1">
                                        <span className="text-xs text-[#787b86]">Entry: {pos.entryPrice.toFixed(4)}</span>
                                        <span className="text-xs text-[#787b86]">Size: {pos.amount} ({pos.leverage}x)</span>
                                     </div>
                                     <div className="flex gap-2 mt-2 pt-2 border-t border-[#2a2e39]">
                                       <button 
                                         onClick={async (e) => {
                                            e.stopPropagation();
                                            const setTp = prompt(`Set Take Profit for ${pos.symbol} (${pos.side}):`);
                                            const setSl = prompt(`Set Stop Loss for ${pos.symbol} (${pos.side}):`);
                                            if (!setTp && !setSl) return;
                                            try {
                                              await axios.post('/api/trade/tpsl', { symbol: pos.symbol, positionSide: pos.side, tp: setTp, sl: setSl });
                                              alert("TP/SL updated! ✅");
                                              fetchTrades();
                                            } catch (err: any) { alert("Error: " + (err.response?.data?.error || err.message)); }
                                         }}
                                         className="flex-1 bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[10px] uppercase font-bold py-1.5 rounded transition-colors"
                                       >
                                         Set TP/SL
                                       </button>
                                       <button 
                                         onClick={async (e) => {
                                           e.stopPropagation();
                                           if(window.confirm(`Close position for ${pos.symbol}?`)) {
                                             try {
                                                await axios.post('/api/trade/close', { symbol: pos.symbol });
                                                alert("Closed!");
                                                fetchTrades();
                                             } catch(err:any) { alert(err.response?.data?.error || err.message); }
                                           }
                                         }}
                                         className="flex-1 bg-[#f23645]/10 hover:bg-[#f23645]/20 text-[#f23645] text-[10px] uppercase font-bold py-1.5 rounded transition-colors"
                                       >
                                         Close Pos
                                       </button>
                                     </div>
                                  </div>
                               ))}
                             </div>
                           )}
                         </div>

                         <div className="mt-4">
                           <div className="flex justify-between items-end mb-2">
                              <div className="text-xs text-[#2962ff] font-bold uppercase">Pending Auto-Trades</div>
                              {autoBotBalance !== null && (
                                <div className="text-[10px] text-[#089981] font-bold bg-[#089981]/10 px-2 py-0.5 rounded">
                                  Bot Budget: ${autoBotBalance.toFixed(2)}
                                </div>
                              )}
                           </div>
                           {openTrades.length === 0 ? (
                             <div className="text-sm text-[#787b86] italic py-2">No pending trades.</div>
                           ) : (
                             <div className="flex flex-col gap-2">
                               {openTrades.map((trade: any) => (
                                  <div key={trade._id} onClick={() => setSymbol(trade.symbol)} className="flex flex-col p-3 rounded border border-[#2a2e39] bg-[#1e222d] text-left cursor-pointer hover:border-[#2962ff] transition-colors relative">
                                     <div className="flex justify-between items-center w-full mb-1">
                                        <span className="font-bold text-white text-sm"><span className={trade.trend === 'bullish' ? 'text-[#089981]' : 'text-[#f23645]'}>{trade.trend === 'bullish' ? 'LONG' : 'SHORT'}</span> {trade.symbol}</span>
                                        <div className="flex gap-2 items-center">
                                          {trade.binanceOrderId && trade.binanceOrderId.startsWith('paper_') && <span className="text-[10px] bg-[#ff9800]/20 text-[#ff9800] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-[#ff9800]/50 shadow-[0_0_8px_rgba(255,152,0,0.3)] animate-pulse">PAPER</span>}
                                          <span className="text-xs text-[#787b86]">
                                            {trade.binanceOrderId ? <span className="text-[#2962ff] font-bold">LIVE</span> : 'Waiting Entry'}
                                          </span>
                                        </div>
                                     </div>
                                     <div className="flex justify-between items-center w-full mb-1">
                                        <span className="text-xs text-[#787b86]">Entry: {trade.entry}</span>
                                        <span className="text-xs text-[#089981]">Target: {trade.target}</span>
                                        <span className="text-xs text-[#f23645]">SL: {trade.stopLoss}</span>
                                     </div>
                                     <div className="flex justify-between items-center w-full mt-1">
                                       <span className="text-[10px] text-[#787b86]">Amt: ${trade.amount}</span>
                                       {trade.unrealizedPnl !== undefined && (
                                           <span className={`text-xs font-bold ${trade.unrealizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                                              {trade.unrealizedPnl >= 0 ? '+' : ''}${trade.unrealizedPnl.toFixed(2)} ({trade.unrealizedPnlPct?.toFixed(2)}%)
                                           </span>
                                       )}
                                       {trade.unrealizedPnl === undefined && trade.binanceOrderId && <span className="text-xs text-[#787b86] animate-pulse">Pricing...</span>}
                                     </div>
                                  </div>
                               ))}
                             </div>
                           )}
                         </div>

                         <div className="mt-4 mb-4">
                           <div className="text-xs text-[#787b86] font-bold mb-2 uppercase">Recent Outcomes</div>
                           {closedTrades.length === 0 ? (
                             <div className="text-sm text-[#787b86] italic py-2">No completed trades yet.</div>
                           ) : (
                             <div className="flex flex-col gap-2">
                               {closedTrades.map((trade: any) => (
                                  <div key={trade._id} className="flex flex-col p-3 rounded border border-[#2a2e39] bg-[#1e222d] text-left hover:border-[#2962ff] transition-colors relative group">
                                     <div className="flex justify-between items-center w-full mb-1 cursor-pointer" onClick={() => setSymbol(trade.symbol)}>
                                        <span className="font-bold text-white text-sm"><span className={trade.trend === 'bullish' ? 'text-[#089981]' : 'text-[#f23645]'}>{trade.trend === 'bullish' ? 'LONG' : 'SHORT'}</span> {trade.symbol}</span>
                                        <div className="flex items-center gap-2">
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); setProfitCard(trade); }}
                                            className="text-[#787b86] hover:text-[#2962ff]"
                                            title="Share Profit Card"
                                          >
                                            <Share2 className="w-4 h-4" />
                                          </button>
                                          <span className={`text-sm font-bold ${trade.status === 'win' ? 'text-[#089981]' : trade.status === 'loss' ? 'text-[#f23645]' : 'text-[#787b86]'}`}>{trade.status.toUpperCase()}</span>
                                        </div>
                                     </div>
                                     <div className="flex justify-between items-center w-full mb-1 text-xs text-[#787b86] cursor-pointer" onClick={() => setSymbol(trade.symbol)}>
                                        <span>Entry: {trade.entry}</span>
                                        <span className={trade.status === 'win' ? 'text-[#089981]' : ''}>Target: {trade.target}</span>
                                        <span className={trade.status === 'loss' ? 'text-[#f23645]' : ''}>SL: {trade.stopLoss}</span>
                                     </div>
                                     <div className="flex justify-between items-center w-full mb-1 text-xs text-[#787b86] cursor-pointer" onClick={() => setSymbol(trade.symbol)}>
                                        <span>Exit: {trade.status === 'win' ? trade.target : trade.status === 'loss' ? trade.stopLoss : 'Manual'}</span>
                                     </div>
                                     <div className="flex justify-between items-center w-full cursor-pointer" onClick={() => setSymbol(trade.symbol)}>
                                        <span className="text-xs text-[#787b86]">Realized:</span>
                                        <span className={`text-xs font-bold ${trade.realizedPnl > 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>${(trade.realizedPnl || 0).toFixed(2)} ({trade.pnlPercent?.toFixed(2)}%)</span>
                                     </div>
                                  </div>
                               ))}
                             </div>
                           )}
                         </div>
                      </div>
                   ) : rightSidebarTab === 'market' ? (
                      <div className="flex flex-col gap-4 flex-1 h-full min-h-[500px]">
                         <div>
                            <div className="text-xs text-[#2962ff] font-bold mb-2 uppercase flex items-center justify-between">
                               <span>Fear & Greed</span>
                            </div>
                            <div className="bg-[#1e222d] border border-[#2a2e39] rounded p-4 flex flex-col items-center">
                               <div className="relative w-32 h-16 overflow-hidden rounded-t-full bg-[#131722] mb-4">
                                  <div className="absolute top-0 left-0 w-full h-[200%] rounded-full border-[10px] border-[#2a2e39]" />
                                  <div className="absolute top-0 left-0 w-full h-[200%] rounded-full border-[10px] border-t-transparent border-r-transparent border-l-[#f23645] border-b-[#089981] -rotate-45" />
                                  <div className="absolute bottom-0 left-1/2 w-2 h-16 origin-bottom transition-transform duration-1000 ease-out" style={{ transform: `translateX(-50%) rotate(${(fng?.value || 50) * 1.8 - 90}deg)` }}>
                                     <div className="w-1.5 h-10 bg-white rounded-t-full mx-auto shadow" />
                                     <div className="w-3 h-3 bg-white rounded-full mx-auto -mt-1" />
                                  </div>
                               </div>
                               <div className="text-2xl font-black text-white">{fng?.value || '-'}</div>
                               <div className="text-sm font-bold" style={{ color: fng?.value ? (fng.value > 50 ? '#089981' : '#f23645') : '#787b86' }}>{fng?.classification?.toUpperCase() || 'LOADING'}</div>
                               <div className="text-[10px] text-[#787b86] mt-2 text-center">Current market sentiment</div>
                            </div>
                         </div>
                         <div className="flex-1 flex flex-col min-h-0 relative">
                            <div className="text-xs text-[#2962ff] font-bold mb-2 uppercase flex items-center justify-between">
                               <span>Order Book</span>
                               <span className="text-[#787b86] font-normal">{symbol}</span>
                            </div>
                            <div className="flex flex-col flex-1 bg-[#1e222d] border border-[#2a2e39] rounded text-xs overflow-hidden font-mono">
                               <div className="flex w-full text-[#787b86] p-2 border-b border-[#2a2e39] bg-[#131722]">
                                  <div className="flex-1">Price</div>
                                  <div className="flex-1 text-right">Size</div>
                                  <div className="flex-1 text-right">Total</div>
                               </div>
                               <div className="flex flex-col flex-1 overflow-y-auto hide-scrollbar">
                                   <div className="flex flex-col justify-end min-h-[150px] p-1">
                                       {(() => {
                                           let askSum = 0;
                                           const processedAsks = [...orderBook.asks].slice(0, 15).map(ask => {
                                               askSum += parseFloat(ask[1]);
                                               return { price: parseFloat(ask[0]), size: parseFloat(ask[1]), total: askSum };
                                           });
                                           let bidSum = 0;
                                           const processedBids = [...orderBook.bids].slice(0, 15).map(bid => {
                                               bidSum += parseFloat(bid[1]);
                                               return { price: parseFloat(bid[0]), size: parseFloat(bid[1]), total: bidSum };
                                           });
                                           const maxTotal = Math.max(askSum, bidSum, 1);
                                           
                                           return [...processedAsks].reverse().map((ask, i) => {
                                               const w = (ask.total / maxTotal) * 100;
                                               return (
                                                   <div key={`ask-${i}`} className="flex w-full py-0.5 relative group hover:bg-[#2a2e39]">
                                                      <div className="absolute right-0 top-0 bottom-0 bg-[#f23645]/10 z-0 transition-all" style={{ width: `${w}%` }} />
                                                      <div className="flex-1 text-[#f23645] z-10 pl-1">{ask.price < 1 ? ask.price.toFixed(5) : ask.price.toFixed(2)}</div>
                                                      <div className="flex-1 text-right text-white z-10">{ask.size.toFixed(4)}</div>
                                                      <div className="flex-1 text-right text-[#787b86] z-10 pr-1">{ask.total.toFixed(4)}</div>
                                                   </div>
                                               );
                                           });
                                       })()}
                                   </div>
                                   
                                   <div className="flex items-center justify-between p-2 border-y border-[#2a2e39] bg-[#131722]">
                                      <span className="text-white font-bold text-sm" style={{ color: liveCandle?.close >= liveCandle?.open ? '#089981' : '#f23645' }}>
                                         {liveCandle?.close || '-'}
                                      </span>
                                      <span className="text-[#787b86] text-xs">Spread</span>
                                   </div>

                                   <div className="flex flex-col justify-start min-h-[150px] p-1">
                                       {(() => {
                                           let bidSum = 0;
                                           const processedBids = [...orderBook.bids].slice(0, 15).map(bid => {
                                               bidSum += parseFloat(bid[1]);
                                               return { price: parseFloat(bid[0]), size: parseFloat(bid[1]), total: bidSum };
                                           });
                                           let askSum = orderBook.asks.slice(0, 15).reduce((acc, a) => acc + parseFloat(a[1]), 0);
                                           const maxTotal = Math.max(bidSum, askSum, 1);
                                           
                                           return processedBids.map((bid, i) => {
                                               const w = (bid.total / maxTotal) * 100;
                                               return (
                                                   <div key={`bid-${i}`} className="flex w-full py-0.5 relative group hover:bg-[#2a2e39]">
                                                      <div className="absolute right-0 top-0 bottom-0 bg-[#089981]/10 z-0 transition-all" style={{ width: `${w}%` }} />
                                                      <div className="flex-1 text-[#089981] z-10 pl-1">{bid.price < 1 ? bid.price.toFixed(5) : bid.price.toFixed(2)}</div>
                                                      <div className="flex-1 text-right text-white z-10">{bid.size.toFixed(4)}</div>
                                                      <div className="flex-1 text-right text-[#787b86] z-10 pr-1">{bid.total.toFixed(4)}</div>
                                                   </div>
                                               );
                                           });
                                       })()}
                                   </div>
                               </div>
                            </div>
                         </div>
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
        <DialogContent className="sm:max-w-[700px] w-[95vw] h-[90vh] md:h-auto md:max-h-[85vh] overflow-hidden flex flex-col bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc] p-0 md:p-6 rounded-[8px]">
          <DialogHeader className="border-b border-[#2a2e39] p-4 md:p-0 md:pb-4 shrink-0">
            <DialogTitle className="text-white text-xl">Settings</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col md:flex-row gap-0 md:gap-6 min-h-0 flex-1 overflow-hidden">
             {/* Settings Sidebar */}
             <div className="flex flex-row md:flex-col gap-2 border-b md:border-b-0 md:border-r border-[#2a2e39] p-4 md:p-0 md:pr-4 shrink-0 overflow-x-auto md:overflow-x-visible w-full md:w-1/4 no-scrollbar">
                <button 
                  onClick={() => setSettingsTab('profile')}
                  className={`whitespace-nowrap text-left px-4 py-2 md:p-2 rounded text-sm font-bold transition-colors ${settingsTab === 'profile' ? 'bg-[#2962ff] text-white' : 'bg-[#131722] md:bg-transparent text-[#787b86] hover:bg-[#2a2e39] hover:text-white'}`}
                >
                  My Profile & Wallet
                </button>
                <button 
                  onClick={() => setSettingsTab('admin')}
                  className={`whitespace-nowrap text-left px-4 py-2 md:p-2 rounded text-sm font-bold transition-colors ${settingsTab === 'admin' ? 'bg-[#2962ff] text-white' : 'bg-[#131722] md:bg-transparent text-[#787b86] hover:bg-[#2a2e39] hover:text-white'}`}
                >
                  Super Admin
                </button>
             </div>

             {/* Settings Content */}
             <div className="flex-1 overflow-y-auto p-4 md:p-0 md:pr-2 no-scrollbar">
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
                         <h3 className="text-white font-bold mb-4">API Connections</h3>
                         <div className="bg-[#131722] border border-[#2a2e39] p-4 rounded text-[#d1d4dc] text-sm">
                           <div className="flex justify-between items-center mb-1">
                              <span className="font-bold text-white">Binance Wallet</span>
                              {binanceBalance !== null ? (
                                <span className="text-[#089981] font-bold">Connected</span>
                              ) : (
                                <span className="text-[#787b86]">Not Configured</span>
                              )}
                           </div>
                           <div className="text-[#787b86] text-xs mb-3">Uses account for auto execution</div>
                           {binanceBalance !== null && (
                              <div className="flex justify-between items-center bg-[#1e222d] p-3 rounded border border-[#2a2e39]">
                                 <span className="text-xs text-[#787b86]">Current Wallet Balance</span>
                                 <span className="font-bold text-white text-lg">${binanceBalance.toFixed(2)} USDT</span>
                              </div>
                           )}
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

                      <div className="border-t border-[#2a2e39] pt-6 mt-6">
                         <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-[#2962ff]" />
                            AI Engine Optimizer
                         </h3>
                         <p className="text-xs text-[#787b86] mb-4">
                           Forces the local ML evaluator to trigger the Gemini 3.1 Pro engine. It will analyze all recent win/loss mathematical predictions, recalibrate the wave structural parameters, and attempt to dynamically boost the system's win rate to 80%.
                         </p>
                         <button onClick={handleRunOptimizer} className="w-full bg-[#2962ff]/20 hover:bg-[#2962ff]/40 text-[#2962ff] border border-[#2962ff] text-sm font-bold py-2 rounded transition-colors flex items-center justify-center gap-2">
                            <PlayCircle className="w-4 h-4" />
                            Run Gemini Auto-Fix Optimizer
                         </button>
                      </div>

                      <div className="border-t border-[#2a2e39] pt-6 mt-6">
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

      {/* Profit Card Modal */}
      <Dialog open={!!profitCard} onOpenChange={(o) => !o && setProfitCard(null)}>
        <DialogContent className="bg-[#131722] border-none text-white max-w-sm rounded p-0 overflow-hidden shadow-[0_0_50px_rgba(41,98,255,0.15)] focus:outline-none">
           <DialogHeader className="hidden">
             <DialogTitle>Profit Card</DialogTitle>
           </DialogHeader>
           {profitCard && (
              <div className="flex flex-col relative w-full h-[400px] items-center justify-center bg-gradient-to-br from-[#131722] to-[#1e222d] border border-[#2a2e39] rounded overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2962ff] to-[#089981]" />
                
                <h2 className="text-xl font-bold tracking-widest text-[#787b86] uppercase mb-6">Hyperwave</h2>
                
                <div className="flex flex-col items-center z-10 mb-6">
                  <div className="text-3xl font-black text-white dropshadow-md mb-2 flex items-center gap-2">
                     {profitCard.symbol} <span className={profitCard.trend === 'bullish' ? 'text-[#089981]' : 'text-[#f23645]'}>{profitCard.trend === 'bullish' ? 'LONG' : 'SHORT'}</span>
                  </div>
                  <div className={`text-5xl font-black ${profitCard.realizedPnl > 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                    {profitCard.realizedPnl > 0 ? '+' : ''}{(profitCard.pnlPercent || 0).toFixed(2)}%
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-center z-10 bg-[#1e222d]/80 px-8 py-4 rounded border border-[#2a2e39]/50 shadow-inner">
                  <div className="flex flex-col">
                    <span className="text-[#787b86] text-[10px] uppercase tracking-wider font-bold mb-1">Entry</span>
                    <span className="text-white font-mono text-sm">{profitCard.entry}</span>
                  </div>
                  {profitCard.status === 'win' ? (
                     <div className="flex flex-col">
                       <span className="text-[#089981] text-[10px] uppercase tracking-wider font-bold mb-1">Target</span>
                       <span className="text-[#089981] font-mono text-sm">{profitCard.target}</span>
                     </div>
                  ) : (
                     <div className="flex flex-col">
                       <span className="text-[#f23645] text-[10px] uppercase tracking-wider font-bold mb-1">SL Hit</span>
                       <span className="text-[#f23645] font-mono text-sm">{profitCard.stopLoss}</span>
                     </div>
                  )}
                </div>
                
                <div className="absolute bottom-4 text-[10px] text-[#787b86] opacity-50 tracking-widest font-bold">
                  AI-POWERED ALGO ENGINE
                </div>
              </div>
           )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
