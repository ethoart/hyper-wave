import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import { computeRSI, computeSMA, computeBB, computeEMA, computeMACD } from '../lib/indicators';

interface ChartProps {
  data: any[];
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
}

const AVAILABLE_INDICATORS = [
  { id: 'sma', name: 'SMA', defaultOptions: { period: 20 }, description: 'Simple Moving Average' },
  { id: 'ema', name: 'EMA', defaultOptions: { period: 20 }, description: 'Exponential Moving Average' },
  { id: 'bb', name: 'Bollinger Bands', defaultOptions: { period: 20, multiplier: 2 }, description: 'Bollinger Bands' },
  { id: 'rsi', name: 'RSI', defaultOptions: { period: 14 }, description: 'Relative Strength Index' },
  { id: 'macd', name: 'MACD', defaultOptions: { fast: 12, slow: 26, signal: 9 }, description: 'Moving Avg Convergence Divergence' },
];

export function WaveChart({ data, liveCandle, entryPoint, exitPoint, stopLoss, wavePoints, trend, activeTool, drawingColor = '#2962ff', clearDrawings = 0, channelPoints, flagPoints }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  
  const [activeIndicators, setActiveIndicators] = useState<Record<string, boolean>>({
    rsi: true,
  });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    formattedData.sort((a, b) => a.time - b.time);

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

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
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
        .sort((a, b) => a.time - b.time)
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
             
             markers.sort((a, b) => a.time - b.time);
             candlestickSeries.setMarkers(markers);
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
              }).sort((a: any, b: any) => a.time - b.time);
              
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
       userDrawings.current = [];
       if (userSeriesRef.current) {
          userSeriesRef.current.setData([]);
          userSeriesRef.current.setMarkers([]);
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
             if (userDrawings.current.length >= maxPoints) {
                // Commit previous shape
                completedShapesRef.current.push({
                   series: [userSeriesRef.current, ...auxiliarySeriesRef.current].filter(Boolean) as any[],
                   priceLines: [...targetPriceLinesRef.current]
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
             }
          }
          
          const existingIndex = userDrawings.current.findIndex(p => p.time === param.time);
          if (existingIndex >= 0) {
            userDrawings.current[existingIndex].value = price;
          } else {
            userDrawings.current.push({ time: param.time as number, value: price });
          }
          userDrawings.current.sort((a, b) => a.time - b.time);
          
          userSeriesRef.current.setData(userDrawings.current as any[]);
          
          if (activeTool === 'measure' && userDrawings.current.length === 2) {
             const p1 = userDrawings.current[0];
             const p2 = userDrawings.current[1];
             const pct = ((p2.value - p1.value) / p1.value * 100).toFixed(2);
             userSeriesRef.current.setMarkers([{
                 time: p2.time,
                 position: pct.startsWith('-') ? 'belowBar' : 'aboveBar',
                 color: pct.startsWith('-') ? '#f23645' : '#089981',
                 shape: pct.startsWith('-') ? 'arrowDown' : 'arrowUp',
                 text: `${pct}% / ${p2.value.toFixed(2)}`,
             }]);
          } else if (activeTool === 'fibonacci' && userDrawings.current.length === 2) {
             const p1 = userDrawings.current[0];
             const p2 = userDrawings.current[1];
             const diff = p2.value - p1.value;
             const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
             const colors = ['#787b86', '#ef5350', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#787b86', '#089981'];
             levels.forEach((l, i) => {
                 const levelPrice = p1.value + diff * l;
                 if (candlestickSeriesRef.current) {
                     const pl = candlestickSeriesRef.current.createPriceLine({
                         price: levelPrice,
                         color: colors[i] || drawingColor,
                         lineWidth: 1,
                         lineStyle: 2,
                         axisLabelVisible: true,
                         title: `Fib ${l}`
                     });
                     targetPriceLinesRef.current.push(pl);
                 }
             });
          } else if (activeTool === 'rectangle' && userDrawings.current.length === 2) {
             const p1 = userDrawings.current[0];
             const p2 = userDrawings.current[1];
             const topSeries = chart.addSeries(LineSeries, { color: drawingColor, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
             const bottomSeries = chart.addSeries(LineSeries, { color: drawingColor, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
             topSeries.setData([{ time: p1.time, value: Math.max(p1.value, p2.value) }, { time: p2.time, value: Math.max(p1.value, p2.value) }]);
             bottomSeries.setData([{ time: p1.time, value: Math.min(p1.value, p2.value) }, { time: p2.time, value: Math.min(p1.value, p2.value) }]);
             auxiliarySeriesRef.current.push(topSeries, bottomSeries);
             
             userSeriesRef.current.setMarkers([
                { time: p1.time, position: 'inBar', color: drawingColor, shape: 'square', text: '' },
                { time: p2.time, position: 'inBar', color: drawingColor, shape: 'square', text: '' },
             ]);
             userSeriesRef.current.setData([]);
          } else if (activeTool === 'parallel' && userDrawings.current.length === 3) {
             const p1 = userDrawings.current[0];
             const p2 = userDrawings.current[1];
             const p3 = userDrawings.current[2];
             
             const slope = (p2.value - p1.value) / (p2.time - p1.time);
             const newIntercept = p3.value - slope * p3.time;
             
             const parallelLine = chart.addSeries(LineSeries, { color: drawingColor, lineWidth: 2, lineStyle: 0, crosshairMarkerVisible: false });
             parallelLine.setData([
                { time: p1.time, value: slope * p1.time + newIntercept },
                { time: p2.time, value: slope * p2.time + newIntercept }
             ]);
             auxiliarySeriesRef.current.push(parallelLine);
             
             userSeriesRef.current.setData([p1, p2]);
          }
        }
      };

      chart.subscribeClick(handleClick);

      return () => {
        chart.unsubscribeClick(handleClick);
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
          <div className="absolute top-10 left-0 w-64 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl overflow-hidden pointer-events-auto flex flex-col">
            <div className="px-3 py-2 border-b border-[#2a2e39] font-medium text-xs text-[#787b86] uppercase tracking-wider">
              Indicator Library
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {AVAILABLE_INDICATORS.map(ind => (
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
            </div>
          </div>
        )}
      </div>

      <div className="w-full flex-1 relative min-h-0" ref={chartContainerRef} />
      {activeIndicators.rsi && (
        <div className="w-full h-[150px] md:h-[100px] mt-2 relative border-t border-[#2a2e39]" ref={rsiContainerRef} />
      )}
      {activeIndicators.macd && (
        <div className="w-full h-[150px] md:h-[100px] mt-2 relative border-t border-[#2a2e39]" ref={macdContainerRef} />
      )}
    </div>
  );
}
