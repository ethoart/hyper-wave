import { useState, useEffect } from 'react';
import axios from 'axios';
import { WaveChart } from './WaveChart';
import { Loader2, X } from 'lucide-react';

export function MiniChart({ symbol, interval, activeTool, onClose, onChange }: { symbol: string, interval: string, activeTool: string, onClose: () => void, onChange: (symbol: string, interval: string) => void }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCandle, setLiveCandle] = useState<any>(null);
  const [symbolInput, setSymbolInput] = useState(symbol);

  useEffect(() => {
    setSymbolInput(symbol);
  }, [symbol]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const safeInterval = (!interval || interval === 'undefined') ? '1d' : interval;
        const res = await axios.get(`/api/market/klines?symbol=${symbol}&interval=${safeInterval}&limit=200`);
        if (isMounted) setData(res.data);
      } catch (err) {
        console.error("MiniChart fetch error:", err);
      }
      if (isMounted) setLoading(false);
    };
    fetchData();
    return () => { isMounted = false; };
  }, [symbol, interval]);

  // WebSocket for Live Data
  useEffect(() => {
    if (!symbol) return;
    const safeInterval = (!interval || interval === 'undefined') ? '1d' : interval;
    
    let wsFutures: WebSocket | null = null;
    let wsSpot: WebSocket | null = null;
    let reconnectAttempts = 0;
    
    let lastWsMessageTime = Date.now();
    let isPolling = false;
    
    const pollingFallback = setInterval(async () => {
       if (Date.now() - lastWsMessageTime > 5000 && !isPolling) {
           isPolling = true;
           try {
               const res = await axios.get(`/api/market/klines?symbol=${symbol}&interval=${safeInterval}&limit=1`);
               if (res.data && res.data.length > 0) {
                   const d = res.data[0];
                   const liveCdl = {
                     time: Math.floor(new Date(d.time).getTime() / 1000),
                     open: parseFloat(d.open),
                     high: parseFloat(d.high),
                     low: parseFloat(d.low),
                     close: parseFloat(d.close),
                     volume: parseFloat(d.volume)
                   };
                   setLiveCandle(liveCdl);
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
           const liveCdl = {
             time: Math.floor(kline.t / 1000),
             open: parseFloat(kline.o),
             high: parseFloat(kline.h),
             low: parseFloat(kline.l),
             close: parseFloat(kline.c),
             volume: parseFloat(kline.v),
           };
           setLiveCandle(liveCdl);
         }
       };

       wsFutures.onmessage = handleMessage;
       wsSpot.onmessage = handleMessage;

       const handleClose = () => {
          if (reconnectAttempts < 5) {
             reconnectAttempts++;
             setTimeout(connectWs, 2000 * reconnectAttempts);
          }
       };
       wsFutures.onclose = handleClose;
       wsSpot.onclose = handleClose;
    };

    connectWs();

    return () => {
       clearInterval(pollingFallback);
       if (wsFutures) wsFutures.close();
       if (wsSpot) wsSpot.close();
    };
  }, [symbol, interval]);

  return (
    <div className="w-full h-full flex flex-col relative bg-[#000]">
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <div className="bg-[#1e222d]/80 backdrop-blur px-2 py-1 rounded text-xs font-bold text-white border border-[#2a2e39] flex items-center gap-1">
          <input 
             type="text" 
             value={symbolInput} 
             onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
             onKeyDown={(e) => {
               if (e.key === 'Enter') {
                 onChange(symbolInput, interval);
               }
             }}
             onBlur={() => onChange(symbolInput, interval)}
             className="bg-transparent border-none outline-none text-white w-[70px] uppercase placeholder:text-[#787b86]"
             placeholder="Pair"
          />
          <select 
             value={interval} 
             onChange={(e) => onChange(symbol, e.target.value)}
             className="bg-transparent border-none outline-none text-[#787b86] cursor-pointer hover:text-white"
          >
             <option value="1m">1m</option>
             <option value="5m">5m</option>
             <option value="15m">15m</option>
             <option value="1h">1h</option>
             <option value="4h">4h</option>
             <option value="1d">1D</option>
             <option value="1w">1W</option>
          </select>
          {liveCandle && <span className="ml-2 text-[#2962ff]">{liveCandle.close}</span>}
        </div>
      </div>
      <button 
        onClick={onClose}
        className="absolute top-2 right-2 z-10 bg-[#1e222d]/80 hover:bg-[#f23645]/80 backdrop-blur p-1 rounded text-white border border-[#2a2e39] transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
      
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#787b86]" />
        </div>
      ) : (!data || data.length === 0) ? (
        <div className="flex-1 flex items-center justify-center text-[#787b86] text-sm flex-col">
          <span>No data available for {symbol}</span>
          <span className="text-xs mt-2 opacity-50">Checking valid interval or rate limits</span>
        </div>
      ) : (
        <WaveChart data={data} liveCandle={liveCandle} activeTool={activeTool} />
      )}
    </div>
  );
}
