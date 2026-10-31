import type { BotConfig } from '../types';
import type { BacktestReport } from '../types/backtests';

export async function fetchBacktestReport(config: BotConfig, signal: AbortSignal): Promise<BacktestReport> {
  const response = await fetch('/preview/backtests/report.json', {
    headers: { Authorization: 'Basic ' + btoa(`${config.username || ''}:${config.password || ''}`) },
    cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error(response.status === 401 ? '面板认证已失效，请重新登录。' : `回测报告暂时无法读取（${response.status}），请稍后重试。`);
  let report: BacktestReport;
  try { report = await response.json() as BacktestReport; } catch { throw new Error('回测报告格式有误，请稍后重新读取。'); }
  if (report.schemaVersion !== 1 || !Array.isArray(report.runs) || !Array.isArray(report.strategies) || !Array.isArray(report.periods) || !Array.isArray(report.costs) || !report.runs.length) throw new Error('尚无可用的已完成回测报告。');
  return report;
}
