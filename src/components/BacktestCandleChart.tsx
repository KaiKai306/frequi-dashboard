import { useEffect, useRef } from 'react';
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, type UTCTimestamp } from 'lightweight-charts';
import type { BacktestCandle, BacktestTrade } from '../types/backtests';

export function BacktestCandleChart({ candles, trades, theme, focus }: { candles: BacktestCandle[]; trades: BacktestTrade[]; theme: 'dark' | 'light'; focus: BacktestTrade | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !candles.length) return;
    const dark = theme === 'dark';
    const chart = createChart(el, { width: el.clientWidth, height: 390, layout: { background: { type: ColorType.Solid, color: dark ? '#111111' : '#ffffff' }, textColor: dark ? '#9b9b9b' : '#707070', fontFamily: getComputedStyle(document.body).fontFamily }, grid: { vertLines: { color: dark ? '#ffffff08' : '#00000008' }, horzLines: { color: dark ? '#ffffff08' : '#00000008' } }, timeScale: { timeVisible: true, borderColor: dark ? '#ffffff13' : '#dcdcdc' }, rightPriceScale: { borderColor: dark ? '#ffffff13' : '#dcdcdc' } });
    const series = chart.addSeries(CandlestickSeries, { upColor: '#75ad91', downColor: '#c77b86', borderVisible: false, wickUpColor: '#75ad91', wickDownColor: '#c77b86' });
    series.setData(candles.map(p => ({ time: p[0] / 1000 as UTCTimestamp, open: p[1], high: p[2], low: p[3], close: p[4] })));
    const align = (stamp: number) => { let lo = 0, hi = candles.length - 1; while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (candles[mid][0] <= stamp) lo = mid; else hi = mid - 1; } return candles[lo][0] / 1000 as UTCTimestamp; };
    const markers = trades.flatMap(t => [ { time: align(t.openTime), position: 'belowBar' as const, color: '#75ad91', shape: 'arrowUp' as const, text: '买入' }, { time: align(t.closeTime), position: 'aboveBar' as const, color: '#c77b86', shape: 'arrowDown' as const, text: '卖出' } ]).sort((a, b) => Number(a.time) - Number(b.time));
    const markerApi = createSeriesMarkers(series, markers);
    if (focus) chart.timeScale().setVisibleRange({ from: (Math.max(candles[0][0], focus.openTime - 10 * 86400000) / 1000) as UTCTimestamp, to: (Math.min(candles.at(-1)![0], focus.closeTime + 10 * 86400000) / 1000) as UTCTimestamp });
    else chart.timeScale().fitContent();
    const observer = new ResizeObserver(entries => chart.applyOptions({ width: entries[0].contentRect.width })); observer.observe(el);
    return () => { observer.disconnect(); markerApi.detach(); chart.remove(); };
  }, [candles, trades, theme, focus]);
  return <div ref={ref} className="bt-candle-chart" role="img" aria-label="历史K线与回测买卖位置" />;
}
