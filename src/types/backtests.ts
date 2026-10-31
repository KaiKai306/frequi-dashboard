export type BacktestPoint = [number, number, number]; // UTC ms, equity USDT, drawdown percent
export type BacktestCandle = [number, number, number, number, number];
export interface BacktestTrade {
  pair: string; openTime: number; closeTime: number; openRate: number; closeRate: number;
  amount: number; stake: number; profit: number; returnPct: number; durationMinutes: number;
  reason: string; enterTag: string; fees: number;
}
export interface BacktestRun {
  id: string; taskId: string; strategyId: string; periodId: string; costId: string;
  start: number; end: number;
  metrics: { initial: number; final: number; profit: number; returnPct: number; drawdownPct: number;
    closedDrawdownPct: number; trades: number; winRate: number; profitFactor: number | null; fees: number; };
  series: BacktestPoint[];
  monthly: { month: string; returnPct: number; profit: number }[];
  trades: BacktestTrade[];
}
export interface BacktestReport {
  schemaVersion: 1; createdAt: string; engine: string; reportId: string;
  dataset: { start: string; end: string; archives: number; hourlyRowsPerPair: number; source: string; sha256: string; knownGap: string };
  settings: { initial: number; stake: number; maxOpenTrades: number; stoplossPct: number; timeframe: string; detailTimeframe: string; reviewedHistory: boolean; };
  strategies: { id: string; name: string; description: string; parameters: Record<string, number | string>; sourceSha256: string; }[];
  periods: { id: string; label: string; start: string; end: string; }[];
  costs: { id: string; label: string; fee: number; slippage: number; effective_fee: number; }[];
  tasks: { id: string; period: string; cost: string; state: string; started_at: string; duration_seconds: number; strategy_count: number }[];
  runs: BacktestRun[];
  benchmarks: { periodId: string; costId: string; name: string; series: BacktestPoint[]; returnPct: number; drawdownPct: number }[];
  candles: Record<string, BacktestCandle[]>;
  checks: { archiveChecksums: boolean; causalPrefix: boolean; frameworkLookahead: string; accountingReconciled: boolean; };
  notes: string[];
}
