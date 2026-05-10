import { useEffect, useState } from 'react';
import axios from 'axios';
import { WaveChart } from './WaveChart';
import { Loader2 } from 'lucide-react';
import { useParams } from 'wouter';

export function ShareChart() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState('');
  const [interval, setInterval] = useState('1d');

  useEffect(() => {
    const fetchSharedChart = async () => {
      try {
        const res = await axios.get(`/api/drawings/share/${params.id}`);
        setSymbol(res.data.symbol);
        setInterval(res.data.interval || '1d');
        const marketRes = await axios.get(`/api/market/klines?symbol=${res.data.symbol}&interval=${res.data.interval || '1d'}&limit=100`);
        setData(marketRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (params.id) fetchSharedChart();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex w-full h-full min-h-screen items-center justify-center bg-[#131722]">
        <Loader2 className="w-8 h-8 animate-spin text-[#2962ff]" />
      </div>
    );
  }

  if (!symbol) {
    return (
       <div className="flex w-full h-full min-h-screen items-center justify-center bg-[#131722] text-white">
         <h1 className="text-xl">Chart not found.</h1>
       </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[#131722] flex-col overflow-hidden">
       <div className="h-[52px] border-b border-[#2a2e39] flex items-center px-4 bg-[#1e222d] flex-shrink-0">
          <div className="font-bold text-white text-lg tracking-tight italic mr-4">Hyper Wave</div>
          <div className="text-sm font-bold text-[#2962ff]">{symbol}</div>
          <div className="text-xs text-[#787b86] ml-2">{interval}</div>
       </div>
       <div className="flex-1 min-h-[0px] flex flex-col relative w-full h-full overflow-hidden">
          <WaveChart data={data} symbol={symbol} interval={interval} activeTool="crosshair" />
       </div>
    </div>
  );
}
