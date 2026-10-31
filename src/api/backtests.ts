import type { BotConfig } from '../types';
import type { BacktestCandle, BacktestReport, BacktestStudyIndex, BacktestStudySummary, BacktestTrade } from '../types/backtests';

async function readResearchJson<T>(path: string, config: BotConfig, signal: AbortSignal): Promise<T> {
  if (!/^\/preview\/backtests\/[a-zA-Z0-9_/-]+\.json(?:\.gz)?$/.test(path) || path.includes('..')) throw new Error('回测报告路径有误。');
  const response = await fetch(path, {
    headers: { Authorization: 'Basic ' + btoa(`${config.username || ''}:${config.password || ''}`) },
    cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error(response.status === 401 ? '面板认证已失效，请重新登录。' : `回测报告暂时无法读取（${response.status}），请稍后重试。`);
  try {
    const body = path.endsWith('.gz') && response.body ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))) : response;
    return await body.json() as T;
  } catch { throw new Error('回测报告格式有误，请稍后重新读取。'); }
}

export async function fetchBacktestReport(config: BotConfig, signal: AbortSignal, path = '/preview/backtests/report.json'): Promise<BacktestReport> {
  const report = await readResearchJson<BacktestReport>(path, config, signal);
  if (report.schemaVersion !== 1 || !Array.isArray(report.runs) || !Array.isArray(report.strategies) || !Array.isArray(report.periods) || !Array.isArray(report.costs) || !report.runs.length) throw new Error('尚无可用的已完成回测报告。');
  return report;
}

export async function fetchBacktestStudyIndex(config: BotConfig, signal: AbortSignal): Promise<BacktestStudyIndex> {
  const index = await readResearchJson<BacktestStudyIndex>('/preview/backtests/study/index.json', config, signal);
  if (index.schemaVersion !== 1 || !Array.isArray(index.reports) || !index.reports.length) throw new Error('尚无可用的短周期比较。');
  return index;
}

export async function fetchBacktestStudySummary(path: string, config: BotConfig, signal: AbortSignal): Promise<BacktestStudySummary> {
  const summary = await readResearchJson<BacktestStudySummary>(path, config, signal);
  if (!Array.isArray(summary.runs)) throw new Error('跨周期比较格式有误。');
  return summary;
}

export async function fetchBacktestTrades(path: string, config: BotConfig, signal: AbortSignal): Promise<BacktestTrade[]> {
  const trades = await readResearchJson<BacktestTrade[]>(path, config, signal);
  if (!Array.isArray(trades) || trades.some(t => !['BTC/USDT', 'ETH/USDT'].includes(t.pair) || !Number.isFinite(t.profit) || !Number.isFinite(t.openTime) || !Number.isFinite(t.closeTime))) throw new Error('成交报告格式有误。');
  return trades;
}

export async function fetchBacktestCandles(path: string, config: BotConfig, signal: AbortSignal): Promise<BacktestCandle[]> {
  const candles = await readResearchJson<BacktestCandle[]>(path, config, signal);
  if (!Array.isArray(candles) || candles.some((c, i) => !Array.isArray(c) || c.length !== 5 || c.some(v => !Number.isFinite(v)) || (i > 0 && c[0] <= candles[i - 1][0]))) throw new Error('历史行情格式有误。');
  return candles;
}
