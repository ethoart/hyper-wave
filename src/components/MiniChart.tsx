import { useState, useEffect } from 'react';
import axios from 'axios';
import { WaveChart } from './WaveChart';
import { Loader2, X } from 'lucide-react';

export function MiniChart({ symbol, interval, activeTool, onClose }: { symbol: string, interval: string, activeTool: string, onClose: () => void }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const safeInterval = (!interval || interval === 'undefined') ? '1d' : interval;
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${safeInterval}&limit=200`);
        const formatted = res.data.map((d: any) => ({
          time: d[0] / 1000,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4])
        }));
        setData(formatted);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchData();
  }, [symbol, interval]);

  return (
    <div className="w-full h-full flex flex-col relative bg-[#000]">
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <div className="bg-[#1e222d]/80 backdrop-blur px-2 py-1 rounded text-xs font-bold text-white border border-[#2a2e39]">
          {symbol} {interval}
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
      ) : (
        <WaveChart data={data} activeTool={activeTool} />
      )}
    </div>
  );
}
