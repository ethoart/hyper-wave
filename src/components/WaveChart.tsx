import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, CrosshairMode } from 'lightweight-charts';
import { computeRSI, computeSMA, computeBB } from '../lib/indicators';

interface ChartProps {
  data: any[];
  liveCandle?: any;
  entryPoint?: number;
  exitPoint?: number;
  stopLoss?: number;
  wavePoints?: { time: number | string; price: number }[];
  trend?: "bullish" | "bearish" | "neutral" | string;
  activeTool?: string;
  drawingColor?: string;
  clearDrawings?: number;
}

export function WaveChart({ data, liveCandle, entryPoint, exitPoint, stopLoss, wavePoints, trend, activeTool, drawingColor = '#2962ff', clearDrawings = 0 }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const [showRSI, setShowRSI] = useState(true);
  const [showSMA, setShowSMA] = useState(false);
  const [showBB, setShowBB] = useState(false);
  
  // Ref to hold user drawn lines
  const userDrawings = useRef<Array<{time: number, value: number}>>([]);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const userSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

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
            candlestickSeriesRef.current.update(formattedLiveCandle);
        } catch(e) {
            // ignore out of order errors
        }
    }
  }, [liveCandle]);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    if (chartRef.current) {
        // If chart exists, just update data
        const formattedData = data.map(d => ({
            time: Math.floor(new Date(d.time).getTime() / 1000) as any,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        })).sort((a, b) => a.time - b.time);
        
        candlestickSeriesRef.current?.setData(formattedData);
        return; // Early return to avoid recreating
    }

    const formattedData = data.map(d => ({
      time: Math.floor(new Date(d.time).getTime() / 1000) as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    formattedData.sort((a, b) => a.time - b.time);

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
    if (showSMA) {
      const smaData = computeSMA(data, 20);
      const smaSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        title: 'SMA 20',
      });
      smaSeries.setData(smaData);
    }
    
    // Indicators: BB
    if (showBB) {
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
      const validPoints = wavePoints
        .filter(p => p && p.time && p.price)
        .map(p => {
            let timeVal = p.time!;
            if (typeof timeVal === 'string' || (typeof timeVal === 'number' && timeVal > 1e11)) {
              timeVal = Math.floor(new Date(timeVal).getTime() / 1000);
            }
            return { time: timeVal as any, value: Number(p.price!) };
        })
        .sort((a, b) => a.time - b.time);
      
      if (validPoints.length > 0) waveSeries.setData(validPoints);
    }

    // Reference lines
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

    chart.timeScale().fitContent();

    // RSI Chart (Secondary Pane)
    let rsiChart: IChartApi | null = null;
    let rsiSeries: ISeriesApi<"Line"> | any = null;

    let syncTimeout: any;
    if (showRSI && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#787b86', attributionLogo: false },
        grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
        timeScale: { visible: false }, // Sync with main chart, hide axis
        rightPriceScale: { borderColor: '#2a2e39' }
      });
      
      rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 1,
        title: 'RSI 14',
      });
      const rsiData = computeRSI(data, 14);
      rsiSeries.setData(rsiData);

      // Add overbought/oversold lines
      rsiSeries.createPriceLine({ price: 70, color: '#2a2e39', lineWidth: 1, lineStyle: 2 });
      rsiSeries.createPriceLine({ price: 30, color: '#2a2e39', lineWidth: 1, lineStyle: 2 });

      // Sync Logical Range
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (!chartRef.current) return; // Prevent updating if unmounted/disposed
        if (range && rsiChart) {
          try { rsiChart.timeScale().setVisibleLogicalRange(range); } catch(e) {}
        }
      });
      
      // Initial sync
      syncTimeout = setTimeout(() => {
          if (!chartRef.current) return; // Disposed
          try {
            const mainRange = chart.timeScale().getVisibleLogicalRange();
            if (mainRange && rsiChart) rsiChart.timeScale().setVisibleLogicalRange(mainRange);
          } catch(e) {}
      }, 50);
    }

    return () => {
      clearTimeout(syncTimeout);
      try { chart.remove(); } catch(e) {}
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      userSeriesRef.current = null;
      try { if (rsiChart) rsiChart.remove(); } catch(e) {}
    };
  }, [data, entryPoint, exitPoint, stopLoss, wavePoints, trend, showRSI, showSMA, showBB]);

  useEffect(() => {
    if (clearDrawings > 0) {
       userDrawings.current = [];
       if (userSeriesRef.current) {
          userSeriesRef.current.setData([]);
       }
    }
  }, [clearDrawings]);

  // Handle active tool updates and user drawings without recreating the entire chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

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

    if (activeTool === 'pen' || activeTool === 'trend') {
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

      // If switching to trend, we typically want to clear previous or just let it continue
      // For now, let's keep all user drawings on the same series or let them click to draw new ones
      const handleClick = (param: any) => {
        if (!param.point || !param.time || !candlestickSeriesRef.current || !userSeriesRef.current) return;
        
        const y = param.point.y;
        const price = candlestickSeriesRef.current.coordinateToPrice(y as any);
        
        if (price !== null) {
          if (activeTool === 'trend') {
             // For a simple trendline, just collect the last 2 points max? Or reset if > 2?
             // Let's just reset if they click a 3rd time, to simulate drawing a new line
             if (userDrawings.current.length >= 2) {
                userDrawings.current = [];
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
        }
      };

      chart.subscribeClick(handleClick);

      return () => {
        chart.unsubscribeClick(handleClick);
      };
    } else {
      // Re-enable scrolling using the mouse
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
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
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <button onClick={() => setShowSMA(!showSMA)} className={`text-[10px] px-2 py-1 rounded bg-[#131722] border ${showSMA ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-[#2a2e39] text-[#787b86]'} cursor-pointer transition-colors`}>SMA 20</button>
        <button onClick={() => setShowRSI(!showRSI)} className={`text-[10px] px-2 py-1 rounded bg-[#131722] border ${showRSI ? 'border-[#8b5cf6] text-[#8b5cf6]' : 'border-[#2a2e39] text-[#787b86]'} cursor-pointer transition-colors`}>RSI 14</button>
        <button onClick={() => setShowBB(!showBB)} className={`text-[10px] px-2 py-1 rounded bg-[#131722] border ${showBB ? 'border-[#2962ff] text-[#2962ff]' : 'border-[#2a2e39] text-[#787b86]'} cursor-pointer transition-colors`}>BB</button>
      </div>
      <div className="w-full flex-1 relative min-h-0" ref={chartContainerRef} />
      {showRSI && (
        <div className="w-full h-[100px] mt-2 relative border-t border-[#2a2e39]" ref={rsiContainerRef} />
      )}
    </div>
  );
}
