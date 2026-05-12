import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import { computeRSI, computeSMA, computeBB, computeEMA, computeMACD } from '../lib/indicators';
import { Search, Plus, ShoppingCart, User, Code, X } from 'lucide-react';
import axios from 'axios';
import { ethers } from 'ethers';

interface ChartProps {
  data: any[];
  symbol?: string;
  interval?: string;
  liveCandle?: any;
  entryPoint?: number;
  exitPoint?: number;
  stopLoss?: number;
  wavePoints?: { time: number | string; price: number, label?: string }[];
  trend?: "bullish" | "bearish" | "neutral" | string;
  activeTool?: string;
  drawingColor?: string;
  clearDrawings?: number;
  channelPoints?: { time: number; price: number }[][];
  flagPoints?: { time: number; price: number }[][];
  onToolDone?: () => void;
}

const AVAILABLE_INDICATORS = [
  { id: 'sma', name: 'SMA', defaultOptions: { period: 20 }, description: 'Simple Moving Average' },
  { id: 'ema', name: 'EMA', defaultOptions: { period: 20 }, description: 'Exponential Moving Average' },
  { id: 'bb', name: 'Bollinger Bands', defaultOptions: { period: 20, multiplier: 2 }, description: 'Bollinger Bands' },
  { id: 'rsi', name: 'RSI', defaultOptions: { period: 14 }, description: 'Relative Strength Index' },
  { id: 'macd', name: 'MACD', defaultOptions: { fast: 12, slow: 26, signal: 9 }, description: 'Moving Avg Convergence Divergence' },
];

const getNumericTime = (t: any): number => { if (typeof t === "number") return t; if (typeof t === "string") return new Date(t).getTime(); if (t && typeof t === "object" && t.year) return new Date(t.year, t.month - 1, t.day).getTime(); return 0; };

export function WaveChart({ data, symbol, interval, liveCandle, entryPoint, exitPoint, stopLoss, wavePoints, trend, activeTool, drawingColor = '#2962ff', clearDrawings = 0, channelPoints, flagPoints, onToolDone }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  
  const [activeIndicators, setActiveIndicators] = useState<Record<string, boolean>>({
    rsi: true,
  });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketplaceItems, setMarketplaceItems] = useState<any[]>([]);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [showCustomPineEditor, setShowCustomPineEditor] = useState(false);
  const [newScript, setNewScript] = useState({ name: '', description: '', code: '//@version=5\nindicator("My Custom Script")\n\nplot(close)', type: 'indicator', priceUSDC: 0 });
  const [submittingScript, setSubmittingScript] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handlePublishScript = async () => {
    if (!newScript.name || !newScript.code) return alert("Name and Code are required");
    setSubmittingScript(true);
    try {
      const res = await axios.post('/api/marketplace', newScript);
      setMarketplaceItems([res.data, ...marketplaceItems]);
      setShowCustomPineEditor(false);
      setNewScript({ name: '', description: '', code: '//@version=5\nindicator("My Custom Script")\n\nplot(close)', type: 'indicator', priceUSDC: 0 });
    } catch(err: any) {
      alert("Failed to publish: " + (err.response?.data?.error || err.message));
    }
    setSubmittingScript(false);
  };

  const handleBuyScript = async (item: any) => {
     try {
       if (item.priceUSDC && item.priceUSDC > 0) {
          // @ts-ignore
          if (typeof window === 'undefined' || typeof window.ethereum === 'undefined') {
              return alert("Please install a Web3 wallet (like MetaMask) to purchase with USDC.");
          }
          // @ts-ignore
          const provider = new ethers.BrowserProvider(window.ethereum);
          await provider.send("eth_requestAccounts", []);
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          
          const network = await provider.getNetwork();
          if (network.chainId !== 8453n && network.chainId !== BigInt(8453)) {
              try {
                  // @ts-ignore
                  await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
              } catch (e) {
                  return alert("Please switch to Base Network to use USDC.");
              }
          }
          
          const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
          const contractAddress = "0x000000000000000000000000000000000000dEaD"; // Default demo treasury
          const amt = ethers.parseUnits(item.priceUSDC.toString(), 6);
          
          const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function transfer(address, uint256) returns (bool)"];
          const tokenContract = new ethers.Contract(usdcAddress, erc20Abi, signer);
          
          const currentBalance = await tokenContract.balanceOf(address);
          if (currentBalance < amt) {
              return alert(`Insufficient USDC balance. You need at least ${item.priceUSDC} USDC on Base.`);
          }
          
          alert("Please confirm the USDC transfer transaction in your wallet.");
          const tx = await tokenContract.transfer(contractAddress, amt);
          await tx.wait();
       }
       
       const res = await axios.post('/api/marketplace/buy', { id: item._id });
       alert(res.data.message);
       // Refresh marketplace items to see it owned
       const updated = await axios.get('/api/marketplace');
       setMarketplaceItems(updated.data);
     } catch (err: any) {
       alert("Failed to buy: " + (err.response?.data?.error || err.message));
     }
  };

  useEffect(() => {
    // Fetch marketplace items
    axios.get('/api/marketplace').then(res => setMarketplaceItems(res.data)).catch(console.error);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowIndicatorMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleIndicator = (id: string) => {
    setActiveIndicators(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Ref to hold user drawn lines
  const userDrawings = useRef<Array<{time: number, value: number}>>([]);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const userSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const auxiliarySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const targetPriceLinesRef = useRef<any[]>([]);
  const completedShapesRef = useRef<Array<{ series: any[], priceLines: any[] }>>([]);
  const serializedDrawingsRef = useRef<any[]>([]);

  // Function to save drawings
  const saveChartDrawings = async () => {
     if (!symbol) return alert("Must have a symbol to save");
     try {
       await axios.post(`/api/drawings/${symbol}?interval=${interval || '1d'}`, {
         drawings: serializedDrawingsRef.current
       }, { headers: { Authorization: `Bearer ${localStorage.getItem('hyperwave_token')}` }});
       alert("Chart drawings saved!");
     } catch (err: any) {
       alert("Failed to save: " + (err.response?.data?.error || err.message));
     }
  };

  const shareChartDrawings = async () => {
     if (!symbol) return;
     try {
       const res = await axios.post(`/api/drawings/share/${symbol}?interval=${interval || '1d'}`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem('hyperwave_token')}` }});
       const url = `${window.location.origin}/chart/${res.data.shareId}`;
       navigator.clipboard.writeText(url);
       alert("Link copied to clipboard!\n" + url);
     } catch(err: any) {
       alert("Failed to share: " + (err.response?.data?.error || err.message));
     }
  };

  // Function to reconstruct abstract shapes
  const reconstructShape = (chart: IChartApi, candleSeries: ISeriesApi<"Candlestick">, shape: any) => {
     let userSrs = chart.addSeries(LineSeries, {
         color: shape.color, lineWidth: 2, lineStyle: 0,
         crosshairMarkerVisible: true, lastValueVisible: false, priceLineVisible: false
     });
     let auxSeries: any[] = [];
     let pLines: any[] = [];

     if (shape.tool === 'measure' && shape.points.length === 2) {
         const sortedPoints = [...shape.points].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time));
         try { userSrs.setData(sortedPoints); } catch(e) {}
         const p1 = shape.points[0];
         const p2 = shape.points[1];
         const pct = ((p2.value - p1.value) / p1.value * 100).toFixed(2);
         try {
            (userSrs as any).setMarkers([{
                time: p2.time, position: pct.startsWith('-') ? 'belowBar' : 'aboveBar',
                color: pct.startsWith('-') ? '#f23645' : '#089981',
                shape: pct.startsWith('-') ? 'arrowDown' : 'arrowUp', text: `${pct}% / ${p2.value.toFixed(2)}`
            }]);
         } catch(e) {}
     } else if (shape.tool === 'fibonacci' && shape.points.length === 2) {
         const sortedPoints = [...shape.points].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time));
         try { userSrs.setData(sortedPoints); } catch(e) {}
         const p1 = shape.points[0]; const p2 = shape.points[1];
         const diff = p2.value - p1.value;
         const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
         const colors = ['#787b86', '#ef5350', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#787b86', '#089981'];
         levels.forEach((l, i) => {
             const line = chart.addSeries(LineSeries, {
                 color: colors[i] || shape.color,
                 lineWidth: 1, lineStyle: 2,
                 crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false
             });
             const levelPrice = p1.value + diff * l;
             try {
                const t1 = p1.time as number;
                let t2 = p2.time as number;
                if (t1 === t2) t2 = t1 + 1000;
                const pData = getNumericTime(t1) < getNumericTime(t2) ? [
                    { time: t1 as any, value: levelPrice },
                    { time: t2 as any, value: levelPrice }
                ] : [
                    { time: t2 as any, value: levelPrice },
                    { time: t1 as any, value: levelPrice }
                ];
                line.setData(pData);
             } catch(e) {}
             auxSeries.push(line);
         });
     } else if (shape.tool === 'rectangle' && shape.points.length === 2) {
         const p1 = shape.points[0]; const p2 = shape.points[1];
         const topSrs = chart.addSeries(LineSeries, { color: shape.color, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
         const botSrs = chart.addSeries(LineSeries, { color: shape.color, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
         try {
             topSrs.setData([{ time: p1.time, value: Math.max(p1.value, p2.value) }, { time: p2.time, value: Math.max(p1.value, p2.value) }].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time)));
             botSrs.setData([{ time: p1.time, value: Math.min(p1.value, p2.value) }, { time: p2.time, value: Math.min(p1.value, p2.value) }].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time)));
         } catch(e) {}
         auxSeries.push(topSrs, botSrs);
         try {
            (userSrs as any).setMarkers([
               { time: p1.time, position: 'inBar', color: shape.color, shape: 'square', text: '' },
               { time: p2.time, position: 'inBar', color: shape.color, shape: 'square', text: '' }
            ].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time)));
         } catch(e) {}
     } else if (shape.tool === 'parallel' && shape.points.length === 3) {
         const p1 = shape.points[0]; const p2 = shape.points[1]; const p3 = shape.points[2];
         const slope = (p2.value - p1.value) / (p2.time - p1.time);
         const newIntercept = p3.value - slope * p3.time;
         const parLine = chart.addSeries(LineSeries, { color: shape.color, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
         try {
             parLine.setData([{ time: p1.time, value: slope * p1.time + newIntercept }, { time: p2.time, value: slope * p2.time + newIntercept }].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time)));
         } catch(e) {}
         auxSeries.push(parLine);
         try { userSrs.setData([p1, p2].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time))); } catch(e) {}
     } else {
         const sortedPoints = [...shape.points].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time));
         try { userSrs.setData(sortedPoints); } catch(e) {} // trend, pen, etc
     }

     completedShapesRef.current.push({ series: [userSrs, ...auxSeries].filter(Boolean), priceLines: pLines });
  };

  useEffect(() => {
     if (!symbol) return;
     let isMounted = true;
     axios.get(`/api/drawings/${symbol}?interval=${interval || '1d'}`, {
         headers: { Authorization: `Bearer ${localStorage.getItem('hyperwave_token')}` }
     }).then(res => {
         if (isMounted && res.data && Array.isArray(res.data)) {
            serializedDrawingsRef.current = res.data;
            if (chartRef.current && candlestickSeriesRef.current) {
                // reconstruct them
                res.data.forEach(shape => reconstructShape(chartRef.current!, candlestickSeriesRef.current!, shape));
            } else {
               // wait and check interval
               let attempts = 0;
               let intv = setInterval(() => {
                  if (chartRef.current && candlestickSeriesRef.current) {
                     clearInterval(intv);
                     res.data.forEach((shape: any) => reconstructShape(chartRef.current!, candlestickSeriesRef.current!, shape));
                  }
                  if (attempts++ > 10) clearInterval(intv);
               }, 200);
            }
         }
     }).catch(console.error);
     return () => { isMounted = false; };
  }, [symbol, interval]);

  useEffect(() => {
    if (liveCandle && chartRef.current && candlestickSeriesRef.current) {
        // liveCandle.time implies it's already properly formatted in Dashboard OR it's a number we should just use.
        // Dashboard does: Math.floor(kline.t / 1000)
        let timeVal = liveCandle.time;
        if (timeVal > 1e11) {
            timeVal = Math.floor(timeVal / 1000); 
        }

        const formattedLiveCandle = {
            time: timeVal as any,
            open: liveCandle.open,
            high: liveCandle.high,
            low: liveCandle.low,
            close: liveCandle.close,
        };
        try {
            // Optional debug
            // console.log("Live timeVal:", timeVal, typeof timeVal);
            candlestickSeriesRef.current.update(formattedLiveCandle);
        } catch(e: any) {
            console.error("Live candle update error:", e.message, formattedLiveCandle);
        }
    }
  }, [liveCandle]);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    // Format data first
    const formattedData = data.map(d => ({
      time: Math.floor(new Date(d.time).getTime() / 1000) as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    formattedData.sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time));

    if (chartRef.current && candlestickSeriesRef.current) {
        // If chart exists, just update data to avoid full recreation flash
        candlestickSeriesRef.current.setData(formattedData);
        return;
    }

    if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
    }

    // Main Chart
    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#787b86',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
      }
    });
    
    chartRef.current = chart;

    let precision = 2;
    let minMove = 0.01;
    if (formattedData.length > 0) {
       const avgPrice = formattedData[0].close;
       if (avgPrice < 0.00001) { precision = 8; minMove = 0.00000001; }
       else if (avgPrice < 0.001) { precision = 6; minMove = 0.000001; }
       else if (avgPrice < 1) { precision = 4; minMove = 0.0001; }
       else if (avgPrice > 1000) { precision = 2; minMove = 0.1; }
    }

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      priceFormat: {
        type: 'price',
        precision: precision,
        minMove: minMove,
      }
    });
    candlestickSeries.setData(formattedData);
    candlestickSeriesRef.current = candlestickSeries;

    // Indicators: SMA
    if (activeIndicators.sma) {
      const smaData = computeSMA(data, 20);
      const smaSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        title: 'SMA 20',
      });
      smaSeries.setData(smaData);
    }
    
    // Indicators: EMA
    if (activeIndicators.ema) {
      const emaData = computeEMA(data, 20);
      if (emaData.length > 0) {
        const emaSeries = chart.addSeries(LineSeries, {
          color: '#10b981',
          lineWidth: 1,
          title: 'EMA 20',
        });
        emaSeries.setData(emaData);
      }
    }
    
    // Indicators: BB
    if (activeIndicators.bb) {
      const bbData = computeBB(data, 20, 2);
      if (bbData.length > 0) {
        const upperSeries = chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 1, title: 'BB Upper' });
        const lowerSeries = chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 1, title: 'BB Lower' });
        const basisSeries = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'BB Basis' });
        upperSeries.setData(bbData.map(d => ({ time: d.time, value: d.upper })));
        lowerSeries.setData(bbData.map(d => ({ time: d.time, value: d.lower })));
        basisSeries.setData(bbData.map(d => ({ time: d.time, value: d.basis })));
      }
    }

    // Elliott Wave Drawer
    if (wavePoints && wavePoints.length > 0) {
      const waveColor = trend === 'bullish' ? '#089981' : trend === 'bearish' ? '#f23645' : '#3b82f6';
      const waveSeries = chart.addSeries(LineSeries, {
        color: waveColor,
        lineWidth: 2,
        lineStyle: 0,
        crosshairMarkerVisible: true,
        lastValueVisible: false,
        priceLineVisible: false
      });
      // Filter out points that are outside the domain or invalid
      let validPoints = wavePoints
        .filter(p => p && p.time && p.price)
        .map(p => {
            let timeVal = p.time!;
            if (typeof timeVal === 'string' || (typeof timeVal === 'number' && timeVal > 1e11)) {
              timeVal = Math.floor(new Date(timeVal).getTime() / 1000);
            }
            return { time: timeVal as any, value: Number(p.price!) };
        });

      // Deduplicate by time and sort
      const uniqueTimes = new Set();
      validPoints = validPoints
        .sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time))
        .filter(p => {
            if (uniqueTimes.has(p.time)) return false;
            uniqueTimes.add(p.time);
            return true;
        });
      
      try {
         if (validPoints.length > 0) {
             waveSeries.setData(validPoints);
             
             const markers: any[] = [];
             wavePoints.forEach((p, idx) => {
                 let text = p.label || '';
                 if (!text) {
                     if (idx === 0) text = '0';
                     else if (idx === 1) text = '1';
                     else if (idx === 2) text = '2';
                     else if (idx === 3) text = '3';
                     else if (idx === 4) text = '4';
                     else if (idx === 5) text = '5';
                 }
                 
                 let timeVal = p.time!;
                 if (typeof timeVal === 'string' || (typeof timeVal === 'number' && timeVal > 1e11)) {
                   timeVal = Math.floor(new Date(timeVal).getTime() / 1000);
                 }
                 
                 const position = trend === 'bullish' 
                    ? (idx % 2 === 0 ? 'belowBar' : 'aboveBar')
                    : (idx % 2 === 0 ? 'aboveBar' : 'belowBar');

                 if (text) {
                    markers.push({
                        time: timeVal,
                        position: position,
                        color: waveColor,
                        shape: position === 'aboveBar' ? 'arrowDown' : 'arrowUp',
                        text: text,
                    });
                 }
             });
             
             markers.sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time));
             (candlestickSeries as any).setMarkers(markers);
         }
      } catch (err) {
         console.warn("Wavechart line series error:", err);
      }
    }
    
    // Draw channels and flag lines
    const drawExtraLines = (lineGroups: any[][], color: string, style: number) => {
        if (!lineGroups || lineGroups.length === 0) return;
        lineGroups.forEach(group => {
           if (group.length > 1) {
              const series = chart.addSeries(LineSeries, {
                color: color,
                lineWidth: 1,
                lineStyle: style,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false
              });
              
              let pts = group.map((p: any) => {
                 let timeVal = p.time;
                 if (typeof timeVal === 'string' || (typeof timeVal === 'number' && timeVal > 1e11)) {
                   timeVal = Math.floor(new Date(timeVal).getTime() / 1000);
                 }
                 return { time: timeVal, value: p.price };
              }).sort((a: any, b: any) => getNumericTime(a.time) - getNumericTime(b.time));
              
              // deduplicate
              const uTimes = new Set();
              pts = pts.filter((p: any) => {
                 if (uTimes.has(p.time)) return false;
                 uTimes.add(p.time);
                 return true;
              });
              
              if (pts.length > 0) {
                 series.setData(pts);
              }
           }
        });
    };
    
    if (channelPoints) drawExtraLines(channelPoints, '#3b82f6', 1); // dotted for channel
    if (flagPoints) drawExtraLines(flagPoints, '#f59e0b', 0); // solid for flag

    // Reference lines
    if (trend !== 'neutral') {
      if (entryPoint) {
        candlestickSeries.createPriceLine({
          price: entryPoint, color: '#3b82f6', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Entry',
        });
      }
      if (exitPoint) {
        candlestickSeries.createPriceLine({
          price: exitPoint, color: '#089981', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Target',
        });
      }
      if (stopLoss) {
        candlestickSeries.createPriceLine({
          price: stopLoss, color: '#f23645', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'Stop',
        });
      }
    }

    chart.timeScale().fitContent();

    // Oscillators
    let rsiChart: IChartApi | null = null;
    let macdChart: IChartApi | null = null;
    let syncTimeout: any;

    if (activeIndicators.rsi && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#787b86', attributionLogo: false },
        grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
        timeScale: { visible: false },
        rightPriceScale: { borderColor: '#2a2e39' }
      });
      
      const rsiSeries = rsiChart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1, title: 'RSI 14' });
      const rsiData = computeRSI(data, 14);
      rsiSeries.setData(rsiData);
      rsiSeries.createPriceLine({ price: 70, color: '#2a2e39', lineWidth: 1, lineStyle: 2 });
      rsiSeries.createPriceLine({ price: 30, color: '#2a2e39', lineWidth: 1, lineStyle: 2 });
    }

    if (activeIndicators.macd && macdContainerRef.current) {
      macdChart = createChart(macdContainerRef.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#787b86', attributionLogo: false },
        grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
        timeScale: { visible: false },
        rightPriceScale: { borderColor: '#2a2e39' }
      });
      
      const macdSeries = macdChart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 1, title: 'MACD' });
      const signalSeries = macdChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'Signal' });
      const histogramSeries = macdChart.addSeries(HistogramSeries, { color: '#26a69a' });
      
      const macdData = computeMACD(data, 12, 26, 9);
      macdSeries.setData(macdData.map((d: any) => ({ time: d.time, value: d.macd })));
      signalSeries.setData(macdData.map((d: any) => ({ time: d.time, value: d.signal })));
      histogramSeries.setData(macdData.map((d: any) => ({ 
        time: d.time, 
        value: d.histogram, 
        color: d.histogram >= 0 ? '#26a69a' : '#ef5350' 
      })));
    }

    // Sync Logical Range
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (!chartRef.current) return;
      if (range) {
        if (rsiChart) { try { rsiChart.timeScale().setVisibleLogicalRange(range); } catch(e) {} }
        if (macdChart) { try { macdChart.timeScale().setVisibleLogicalRange(range); } catch(e) {} }
      }
    });
    
    // Initial sync
    syncTimeout = setTimeout(() => {
        if (!chartRef.current) return;
        try {
          const mainRange = chart.timeScale().getVisibleLogicalRange();
          if (mainRange) {
            if (rsiChart) rsiChart.timeScale().setVisibleLogicalRange(mainRange);
            if (macdChart) macdChart.timeScale().setVisibleLogicalRange(mainRange);
          }
        } catch(e) {}
    }, 50);

    return () => {
      clearTimeout(syncTimeout);
      try { chart.remove(); } catch(e) {}
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      userSeriesRef.current = null;
      try { if (rsiChart) rsiChart.remove(); } catch(e) {}
      try { if (macdChart) macdChart.remove(); } catch(e) {}
    };
  }, [data, entryPoint, exitPoint, stopLoss, wavePoints, trend, activeIndicators]);

  useEffect(() => {
    if (clearDrawings > 0) {
       try {
           userDrawings.current = [];
           if (userSeriesRef.current) {
              userSeriesRef.current.setData([]);
              (userSeriesRef.current as any).setMarkers([]);
           }
           if (candlestickSeriesRef.current) {
             targetPriceLinesRef.current.forEach(line => {
                 try { candlestickSeriesRef.current?.removePriceLine(line); } catch(e) {}
             });
           }
           targetPriceLinesRef.current = [];

           auxiliarySeriesRef.current.forEach(s => {
               try { chartRef.current?.removeSeries(s); } catch (e) {}
           });
           auxiliarySeriesRef.current = [];
           
           completedShapesRef.current.forEach(shape => {
               shape.series.forEach(s => {
                   try { chartRef.current?.removeSeries(s); } catch(e) {}
               });
               if (candlestickSeriesRef.current) {
                   shape.priceLines.forEach(line => {
                       try { candlestickSeriesRef.current?.removePriceLine(line); } catch(e) {}
                   });
               }
           });
           completedShapesRef.current = [];
           
           serializedDrawingsRef.current = [];
       } catch (err: any) {
           console.error("Error clearing drawings:", err.message);
       }
    }
  }, [clearDrawings]);

  // Handle active tool updates and user drawings without recreating the entire chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
         // Pop last shape
         if (completedShapesRef.current.length > 0) {
            const lastShape = completedShapesRef.current.pop();
            if (lastShape) {
                lastShape.series.forEach(s => {
                    try { chart.removeSeries(s); } catch(err) {}
                });
                if (candlestickSeriesRef.current) {
                    lastShape.priceLines.forEach(line => {
                       try { candlestickSeriesRef.current?.removePriceLine(line); } catch(err) {}
                    });
                }
            }
         } else if (userDrawings.current.length > 0) {
            // Alternatively pop from current drawing if in progress
            userDrawings.current.pop();
            if (userSeriesRef.current) {
               userSeriesRef.current.setData(userDrawings.current as any);
            }
         }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Apply cursor options
    chart.applyOptions({
      crosshair: {
        mode: activeTool === 'pointer' ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: { 
          visible: activeTool !== 'pointer', 
          labelVisible: activeTool !== 'pointer' 
        },
        horzLine: { 
          visible: activeTool !== 'pointer', 
          labelVisible: activeTool !== 'pointer' 
        }
      }
    });

    const drawingTools = ['pen', 'trend', 'fibonacci', 'parallel', 'rectangle', 'measure'];
    if (drawingTools.includes(activeTool as string)) {
      chart.applyOptions({
        handleScroll: false,
        handleScale: false,
      });

      if (!userSeriesRef.current) {
        userSeriesRef.current = chart.addSeries(LineSeries, {
          color: drawingColor,
          lineWidth: 2,
          lineStyle: 0,
          crosshairMarkerVisible: true,
          lastValueVisible: false,
          priceLineVisible: false
        });
      } else {
        userSeriesRef.current.applyOptions({
          color: drawingColor,
        });
      }

      const handleClick = (param: any) => {
        if (!param.point || !param.time || !candlestickSeriesRef.current || !userSeriesRef.current) return;
        
        const y = param.point.y;
        const price = candlestickSeriesRef.current.coordinateToPrice(y as any);
        
        if (price !== null) {
          if (activeTool !== 'pen') {
             let maxPoints = 2;
             if (activeTool === 'parallel') maxPoints = 3;
             
             const newPoint = { time: param.time as number, value: price };
             const existingIndex = userDrawings.current.findIndex(p => p.time === param.time);
             if (existingIndex >= 0) {
                 userDrawings.current[existingIndex].value = price;
             } else {
                 userDrawings.current.push(newPoint);
             }
             
             const sortedPts = [...userDrawings.current].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time));
             try { userSeriesRef.current.setData(sortedPts as any[]); } catch(e) {}
             
             if (activeTool === 'measure' && userDrawings.current.length === 2) {
                const p1 = userDrawings.current[0];
                const p2 = userDrawings.current[1]; // actual second click
                const pct = ((p2.value - p1.value) / p1.value * 100).toFixed(2);
                try {
                   (userSeriesRef.current as any).setMarkers([{
                       time: p2.time,
                       position: pct.startsWith('-') ? 'belowBar' : 'aboveBar',
                       color: pct.startsWith('-') ? '#f23645' : '#089981',
                       shape: pct.startsWith('-') ? 'arrowDown' : 'arrowUp',
                       text: `${pct}% / ${p2.value.toFixed(2)}`,
                   }]);
                } catch(e) {}
             } else if (activeTool === 'fibonacci' && userDrawings.current.length === 2) {
                const p1 = userDrawings.current[0];
                const p2 = userDrawings.current[1];
                const diff = p2.value - p1.value;
                const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
                const colors = ['#787b86', '#ef5350', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#787b86', '#089981'];
                
                if (auxiliarySeriesRef.current.length === 0) {
                    levels.forEach((l, i) => {
                        const line = chart.addSeries(LineSeries, {
                            color: colors[i] || drawingColor,
                            lineWidth: 1, lineStyle: 2,
                            crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false
                        });
                        auxiliarySeriesRef.current.push(line);
                    });
                }
                
                levels.forEach((l, i) => {
                    const levelPrice = p1.value + diff * l;
                    if (auxiliarySeriesRef.current[i]) {
                        try {
    const nt1 = getNumericTime(p1.time);
    const nt2 = getNumericTime(p2.time);
    if (nt1 === nt2) return;
    const pData = nt1 < nt2 ? [
        { time: p1.time as any, value: levelPrice },
        { time: p2.time as any, value: levelPrice }
    ] : [
        { time: p2.time as any, value: levelPrice },
        { time: p1.time as any, value: levelPrice }
    ];
    auxiliarySeriesRef.current[i].setData(pData);
} catch(e) {}
                    }
                });
             } else if (activeTool === 'rectangle' && userDrawings.current.length === 2) {
                const p1 = userDrawings.current[0];
                const p2 = userDrawings.current[1];
                const topSeries = chart.addSeries(LineSeries, { color: drawingColor, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
                const bottomSeries = chart.addSeries(LineSeries, { color: drawingColor, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
                try {
                    topSeries.setData([{ time: p1.time, value: Math.max(p1.value, p2.value) }, { time: p2.time, value: Math.max(p1.value, p2.value) }].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time)));
                    bottomSeries.setData([{ time: p1.time, value: Math.min(p1.value, p2.value) }, { time: p2.time, value: Math.min(p1.value, p2.value) }].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time)));
                } catch(e) {}
                auxiliarySeriesRef.current.push(topSeries, bottomSeries);
                
                try {
                   (userSeriesRef.current as any).setMarkers([
                      { time: p1.time, position: 'inBar', color: drawingColor, shape: 'square', text: '' },
                      { time: p2.time, position: 'inBar', color: drawingColor, shape: 'square', text: '' },
                   ].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time)));
                } catch(e) {}
                try { userSeriesRef.current.setData([]); } catch(e) {}
             } else if (activeTool === 'parallel' && userDrawings.current.length === 3) {
                const p1 = userDrawings.current[0];
                const p2 = userDrawings.current[1];
                const p3 = userDrawings.current[2];
                
                const slope = (p2.value - p1.value) / (p2.time - p1.time);
                const newIntercept = p3.value - slope * p3.time;
                
                const parallelLine = chart.addSeries(LineSeries, { color: drawingColor, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
                try {
                   parallelLine.setData([
                      { time: p1.time, value: slope * p1.time + newIntercept },
                      { time: p2.time, value: slope * p2.time + newIntercept }
                   ].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time)));
                } catch(e) {}
                auxiliarySeriesRef.current.push(parallelLine);
                
                try { userSeriesRef.current.setData([p1, p2]); } catch(e) {}
             }

             if (userDrawings.current.length >= maxPoints) {
                // Commit previous shape
                completedShapesRef.current.push({
                   series: [userSeriesRef.current, ...auxiliarySeriesRef.current].filter(Boolean) as any[],
                   priceLines: [...targetPriceLinesRef.current]
                });
                
                serializedDrawingsRef.current.push({
                   tool: activeTool,
                   color: drawingColor,
                   points: [...userDrawings.current]
                });
                
                userDrawings.current = [];
                auxiliarySeriesRef.current = [];
                targetPriceLinesRef.current = [];
                
                // Create new series for next drawing
                userSeriesRef.current = chart.addSeries(LineSeries, {
                  color: drawingColor,
                  lineWidth: 2,
                  lineStyle: 0,
                  crosshairMarkerVisible: true,
                  lastValueVisible: false,
                  priceLineVisible: false
                });

                if (onToolDone) onToolDone();
             }
          }
        }
      };

      const handleCrosshairMove = (param: any) => {
        if (!param.point || !param.time || !candlestickSeriesRef.current || !userSeriesRef.current) return;
        if (activeTool === 'pen') return;
        
        let maxPoints = 2;
        if (activeTool === 'parallel') maxPoints = 3;
        
        if (userDrawings.current.length > 0 && userDrawings.current.length < maxPoints) {
           const y = param.point.y;
           const price = candlestickSeriesRef.current.coordinateToPrice(y as any);
           if (price !== null) {
              const livePoint = { time: param.time as number, value: price };
              const filteredDrawings = userDrawings.current.filter(p => p.time !== param.time);
              const pts = [...filteredDrawings, livePoint].sort((a,b) => getNumericTime(a.time) - getNumericTime(b.time));
              
              if (activeTool === 'measure') {
                 try {
                     userSeriesRef.current.setData(pts as any[]);
                     const p1 = userDrawings.current[0];
                     const p2 = livePoint;
                     const pct = ((p2.value - p1.value) / p1.value * 100).toFixed(2);
                     (userSeriesRef.current as any).setMarkers([{
                         time: p2.time,
                         position: pct.startsWith('-') ? 'belowBar' : 'aboveBar',
                         color: pct.startsWith('-') ? '#f23645' : '#089981',
                         shape: pct.startsWith('-') ? 'arrowDown' : 'arrowUp',
                         text: `${pct}% / ${p2.value.toFixed(2)}`,
                     }]);
                 } catch(e) {}
              } else if (activeTool === 'fibonacci') {
                 try { userSeriesRef.current.setData(pts as any[]); } catch(e) {}
                 const p1 = userDrawings.current[0];
                 const p2 = livePoint;
                 const diff = p2.value - p1.value;
                 const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
                 const colors = ['#787b86', '#ef5350', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#787b86', '#089981'];
                 
                 if (auxiliarySeriesRef.current.length === 0) {
                     levels.forEach((l, i) => {
                         const line = chart.addSeries(LineSeries, {
                             color: colors[i] || drawingColor,
                             lineWidth: 1, lineStyle: 2,
                             crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false
                         });
                         auxiliarySeriesRef.current.push(line);
                     });
                 }
                 
                 levels.forEach((l, i) => {
                     const levelPrice = p1.value + diff * l;
                     if (auxiliarySeriesRef.current[i]) {
                         try {
    const nt1 = getNumericTime(p1.time);
    const nt2 = getNumericTime(p2.time);
    if (nt1 === nt2) return;
    const pData = nt1 < nt2 ? [
        { time: p1.time as any, value: levelPrice },
        { time: p2.time as any, value: levelPrice }
    ] : [
        { time: p2.time as any, value: levelPrice },
        { time: p1.time as any, value: levelPrice }
    ];
    auxiliarySeriesRef.current[i].setData(pData);
} catch(e) {}
                     }
                 });
                 
              } else if (activeTool !== 'rectangle') {
                 try { userSeriesRef.current.setData(pts as any[]); } catch(e) {}
              }
           }
        }
      };

      chart.subscribeClick(handleClick);
      chart.subscribeCrosshairMove(handleCrosshairMove);

      return () => {
        chart.unsubscribeClick(handleClick);
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      // Re-enable scrolling using the mouse
      chart.applyOptions({
        handleScroll: {
          mouseWheel: false,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        }
      });
    }
  }, [activeTool]);

  if (!data || data.length === 0) return <div>No data available</div>;
  
  return (
    <div className="w-full h-full flex flex-col relative">
      <div className="absolute top-12 left-2 z-[9] flex gap-2" ref={menuRef}>
        <button 
          onClick={() => setShowIndicatorMenu(!showIndicatorMenu)} 
          className="pointer-events-auto text-xs px-3 py-1.5 rounded bg-[#131722]/90 backdrop-blur border border-[#2a2e39] text-[#d1d4dc] hover:text-white hover:bg-[#2a2e39] cursor-pointer transition-colors shadow-sm font-medium flex items-center gap-1.5"
        >
          <span className="font-serif italic text-blue-400 font-bold">fx</span>
          Indicators
        </button>
        
        {showIndicatorMenu && (
          <div className="absolute top-10 left-0 w-80 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl overflow-hidden pointer-events-auto flex flex-col z-[100]">
            <div className="flex border-b border-[#2a2e39]">
               <button onClick={() => setShowMarketplace(false)} className={`flex-1 py-2 text-xs font-medium text-center ${!showMarketplace ? 'text-white border-b-2 border-blue-500' : 'text-[#787b86] hover:text-white'}`}>Library</button>
               <button onClick={() => setShowMarketplace(true)} className={`flex-1 py-2 text-xs font-medium text-center ${showMarketplace ? 'text-white border-b-2 border-blue-500' : 'text-[#787b86] hover:text-white'}`}>Marketplace</button>
            </div>
            
            <div className="p-2 border-b border-[#2a2e39] flex items-center bg-[#131722]">
               <Search className="w-4 h-4 text-[#787b86] mr-2" />
               <input 
                  type="text" 
                  placeholder={showMarketplace ? "Search community scripts..." : "Search indicators..."} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm text-[#d1d4dc] w-full"
               />
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {!showMarketplace && AVAILABLE_INDICATORS.filter(ind => ind.name.toLowerCase().includes(searchQuery.toLowerCase()) || ind.description.toLowerCase().includes(searchQuery.toLowerCase())).map(ind => (
                <div 
                  key={ind.id} 
                  onClick={() => toggleIndicator(ind.id)}
                  className="px-3 py-2.5 flex items-center justify-between hover:bg-[#2a2e39] cursor-pointer transition-colors border-b border-[#2a2e39]/50 last:border-0"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-[#d1d4dc] font-medium">{ind.name}</span>
                    <span className="text-[10px] text-[#787b86] mt-0.5">{ind.description}</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border ${activeIndicators[ind.id] ? 'bg-blue-500 border-blue-500' : 'border-[#787b86]'} flex items-center justify-center transition-colors`}>
                    {activeIndicators[ind.id] && (
                      <svg viewBox="0 0 14 14" className="w-2.5 h-2.5 text-white stroke-current fill-none stroke-2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 7.5 6 10.5 11 4" />
                      </svg>
                    )}
                  </div>
                </div>
              ))}
              
              {showMarketplace && marketplaceItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
                 <div key={item._id} className="px-3 py-2.5 flex items-center justify-between hover:bg-[#2a2e39] transition-colors border-b border-[#2a2e39]/50 last:border-0">
                    <div className="flex flex-col">
                      <span className="text-sm text-yellow-400 font-medium flex items-center gap-1"><Code className="w-3 h-3"/> {item.name}</span>
                      <span className="text-[10px] text-[#787b86] mt-0.5">By {item.author || 'Anonymous'} • {item.type}</span>
                    </div>
                    <button onClick={() => handleBuyScript(item)} className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                       <ShoppingCart className="w-3 h-3" />
                       {item.priceUSDC > 0 ? `${item.priceUSDC} USDC` : 'Free'}
                    </button>
                 </div>
              ))}
              
              {showMarketplace && marketplaceItems.length === 0 && (
                 <div className="p-4 text-center text-xs text-[#787b86]">No community scripts found.</div>
              )}
            </div>
            
            <div className="p-2 border-t border-[#2a2e39] bg-[#1a1e26]">
               <button onClick={() => setShowCustomPineEditor(true)} className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium rounded hover:bg-blue-400/10 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  Create Custom Script (Pine)
               </button>
            </div>
          </div>
        )}
      </div>

      <div className="w-full flex-1 relative min-h-0" ref={chartContainerRef} />
      
      {/* Fullscreen & Additional buttons */}
      <div className="absolute top-2 right-14 z-[9] flex gap-2">
         {symbol && (
            <>
              <button 
                 onClick={() => {
                    // if pen tool is active, push its current path before saving
                    if (activeTool === 'pen' && userDrawings.current.length > 0 && userSeriesRef.current) {
                        completedShapesRef.current.push({ series: [userSeriesRef.current], priceLines: [] });
                        serializedDrawingsRef.current.push({ tool: 'pen', color: drawingColor, points: [...userDrawings.current] });
                        userDrawings.current = [];
                        userSeriesRef.current = chartRef.current?.addSeries(LineSeries, { color: drawingColor, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: true, lastValueVisible: false, priceLineVisible: false }) || null;
                    }
                    saveChartDrawings();
                 }}
                 className="p-1.5 text-[#787b86] hover:bg-[#2962ff] hover:text-white rounded bg-[#1e222d] border border-[#2a2e39] transition-colors text-xs font-bold"
                 title="Save Chart"
              >
                 SAVE
              </button>
              <button 
                 onClick={shareChartDrawings}
                 className="p-1.5 text-[#787b86] hover:bg-[#2962ff] hover:text-white rounded bg-[#1e222d] border border-[#2a2e39] transition-colors text-xs font-bold"
                 title="Share Chart"
              >
                 SHARE
              </button>
            </>
         )}
      </div>
      <button 
         onClick={() => {
            if (chartContainerRef.current) {
               if (document.fullscreenElement) {
                  document.exitFullscreen();
               } else {
                  chartContainerRef.current.parentElement?.requestFullscreen();
               }
            }
         }}
         className="absolute top-2 right-2 z-[9] p-1.5 text-[#787b86] hover:bg-[#2a2e39] hover:text-white rounded bg-[#1e222d] border border-[#2a2e39] transition-colors"
         title="Toggle Fullscreen"
      >
         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
      </button>

      {activeIndicators.rsi && (
        <div className="w-full h-[150px] md:h-[100px] mt-2 relative border-t border-[#2a2e39]" ref={rsiContainerRef} />
      )}
      {activeIndicators.macd && (
        <div className="w-full h-[150px] md:h-[100px] mt-2 relative border-t border-[#2a2e39]" ref={macdContainerRef} />
      )}

      {showCustomPineEditor && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div className="bg-[#1e222d] border border-[#2a2e39] rounded shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-[#2a2e39]">
               <h2 className="text-white font-bold flex items-center gap-2"><Code className="w-5 h-5 text-blue-400"/> Pine Editor (BETA)</h2>
               <button onClick={() => setShowCustomPineEditor(false)} className="text-[#787b86] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[#787b86] mb-1">Script Name</label>
                  <input type="text" value={newScript.name} onChange={e => setNewScript({...newScript, name: e.target.value})} className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="e.g., Ultimate RSI + MACD" />
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-[#787b86] mb-1">Type</label>
                  <select value={newScript.type} onChange={e => setNewScript({...newScript, type: e.target.value})} className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                     <option value="indicator">Indicator</option>
                     <option value="strategy">Strategy</option>
                     <option value="signal">Signal Algorithm</option>
                  </select>
                </div>
              </div>
              
              <div>
                 <label className="block text-xs font-medium text-[#787b86] mb-1">Pine Script v5 Code</label>
                 <textarea value={newScript.code} onChange={e => setNewScript({...newScript, code: e.target.value})} className="w-full h-48 bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-sm text-green-400 font-mono focus:outline-none focus:border-blue-500" />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[#787b86] mb-1">Description (Optional)</label>
                  <input type="text" value={newScript.description} onChange={e => setNewScript({...newScript, description: e.target.value})} className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Explain what this does..." />
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-[#787b86] mb-1">Price (USDC Base)</label>
                  <input type="number" min="0" step="1" value={newScript.priceUSDC} onChange={e => setNewScript({...newScript, priceUSDC: Number(e.target.value)})} className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-[#2a2e39] flex justify-end gap-3 bg-[#131722] rounded-b">
               <button onClick={() => setShowCustomPineEditor(false)} className="px-4 py-2 text-sm font-medium text-[#787b86] hover:text-white transition-colors">Cancel</button>
               <button onClick={handlePublishScript} disabled={submittingScript} className="px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2">
                  {submittingScript ? 'Publishing...' : 'Publish to Marketplace'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
