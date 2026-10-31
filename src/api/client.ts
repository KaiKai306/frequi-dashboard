import type {
  BotConfig,
  BotState,
  CandleData,
  DailyRecord,
  LogEntry,
  ProfitSummary,
  SignalStat,
  Trade,
} from '../types';

export const EMPTY_BOT_STATE: BotState = {
  version: '-',
  strategy: 'Disconnected',
  timeframe: '5m',
  state: 'stopped',
  dry_run: true,
  stake_currency: 'USDT',
  max_open_trades: 0,
  balance: 0,
  free_balance: 0,
  stake_amount: 0,
  whitelist: [],
  blacklist: [],
  blacklist_expanded: [],
};

// Static design previews share the existing read-only gateway.
const PREVIEW_ROOT = '/preview/';
const PREVIEW_API = `${PREVIEW_ROOT}bot`;
export const PAPER_API_PATHS = [PREVIEW_API, `${PREVIEW_ROOT}bots/compare`] as const;
export function isPaperApiUrl(url: string): boolean {
  return PAPER_API_PATHS.some(path => path === url);
}

export function normalizeApiUrl(url: string): string {
  return isPaperApiUrl(url) ? url : PREVIEW_API;
}

export function buildApiUrl(baseUrl: string, endpoint: string): string {
  const trimmedBase = (baseUrl || '').trim();
  const cleanEndpoint = endpoint.replace(/^\/+/, '');

  if (!trimmedBase || trimmedBase === '/') {
    return `/api/v1/${cleanEndpoint}`;
  }

  const cleanBase = trimmedBase.replace(/\/+$/, '');

  if (cleanBase.endsWith('/api/v1')) {
    return `${cleanBase}/${cleanEndpoint}`;
  }

  if (cleanBase === '/api-proxy') {
    return `/api-proxy/api/v1/${cleanEndpoint}`;
  }

  return `${cleanBase}/api/v1/${cleanEndpoint}`;
}

function mapOrders(rawOrders?: any[]): any[] | undefined {
  if (!Array.isArray(rawOrders)) return undefined;
  return rawOrders.map((o) => ({
    order_id: o.order_id,
    pair: o.pair,
    status: o.status,
    ft_order_side: o.ft_order_side,
    ft_is_entry: o.ft_is_entry,
    ft_order_tag: o.ft_order_tag,
    amount: o.amount,
    filled: o.filled,
    price: o.price,
    safe_price: o.safe_price,
    average: o.average,
    cost: o.cost,
    order_timestamp: o.order_timestamp,
    order_date: o.order_date,
    order_filled_timestamp: o.order_filled_timestamp,
    order_filled_date: o.order_filled_date,
    is_open: o.is_open,
  }));
}

export class FreqtradeClient {
  private config: BotConfig;
  public lastError: string | null = null;
  private inFlightRequests: Map<string, Promise<any>> = new Map();
  private cachedStaticState: {
    version: string;
    strategy: string;
    strategy_version: string;
    timeframe: string;
    state: 'running' | 'stopped';
    dry_run: boolean;
    stake_currency: string;
    max_open_trades: number;
    stake_amount: number | string;
    tradable_balance_ratio?: number;
    whitelist: string[];
    blacklist?: string[];
    blacklist_expanded?: string[];
  } | null = null;
  private lastStaticFetchTime: number = 0;

  constructor(config: BotConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<BotConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): BotConfig {
    return this.config;
  }

  getBaseUrl(): string { return normalizeApiUrl(this.config.apiUrl); }

  private getAuthHeader(): Record<string, string> {
    if (this.config.username || this.config.password) {
      const token = btoa(`${this.config.username || ''}:${this.config.password || ''}`);
      return { Authorization: 'Basic ' + token };
    }
    return {};
  }

  clearInFlightRequests() {
    this.inFlightRequests.clear();
  }

  private async request<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined | null>
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    let url = buildApiUrl(baseUrl, endpoint);
    if (params) {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          q.append(k, String(v));
        }
      });
      url += `?${q.toString()}`;
    }

    const rawApiUrl = normalizeApiUrl(this.config.apiUrl || '');

    // In-flight request deduplication: scoped by target bot apiUrl so different bots never collide
    const cacheKey = `${rawApiUrl}::${url}`;
    const existing = this.inFlightRequests.get(cacheKey);
    if (existing) {
      return existing as Promise<T>;
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.getAuthHeader(),
    };
    if (baseUrl === '/api-proxy' && rawApiUrl) {
      headers['x-target-url'] = rawApiUrl;
    }

    const maxRetries = 2;
    const fetchWithRetry = async (attempt: number): Promise<T> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout limit
      try {
        const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        if (!res.ok) {
          let msg = `API [${endpoint}] HTTP ${res.status}: ${res.statusText}`;
          if (res.status === 401) {
            msg = 'Authentication failed (401 Unauthorized): Check API credentials';
          } else if (res.status === 404) {
            msg = `Endpoint not found (404 Not Found): ${endpoint}`;
          } else if (res.status === 502 || res.status === 504) {
            msg = `Gateway error (HTTP ${res.status}): Unable to reach target server`;
          }
          this.lastError = msg;
          if ((res.status === 502 || res.status === 504) && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, attempt * 1000));
            return fetchWithRetry(attempt + 1);
          }
          throw new Error(msg);
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
          const errMsg = `Target returned HTML page instead of JSON API (HTTP ${res.status}). Verify API port, not web UI port (${currentOrigin}).`;
          this.lastError = errMsg;
          throw new Error(errMsg);
        }

        this.lastError = null;
        try {
          return (await res.json()) as T;
        } catch (jsonErr: any) {
          const errMsg = 'API response is not valid JSON. Verify target service is Freqtrade API.';
          this.lastError = errMsg;
          throw new Error(errMsg);
        }
      } catch (err: any) {
        const isTransient =
          err.name === 'AbortError' ||
          err.message === 'Failed to fetch' ||
          err.name === 'TypeError' ||
          err.name === 'NetworkError';

        if (isTransient && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 800));
          return fetchWithRetry(attempt + 1);
        }

        if (err.name === 'AbortError') {
          const timeoutMsg = `Request timeout (12s): API [${endpoint}] response took too long`;
          this.lastError = timeoutMsg;
          throw new Error(timeoutMsg);
        }
        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
          const targetUrl = this.getBaseUrl();
          const fetchMsg = `Failed to fetch: Unable to reach target address [${targetUrl}]. Check host, CORS origins, and SSL protocol.`;
          this.lastError = fetchMsg;
          throw new Error(fetchMsg);
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const fetchPromise = (async () => {
      try {
        return await fetchWithRetry(1);
      } finally {
        this.inFlightRequests.delete(cacheKey);
      }
    })();

    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  private async postRequest<T>(_endpoint: string, _body?: any): Promise<T> {
    throw new Error('此预览只读，请在原版面板执行控制操作。');
  }

  async ping(): Promise<boolean> {
    try {
      await this.request('ping');
      return true;
    } catch (err: any) {
      this.lastError = err?.message || 'Unable to connect to endpoint';
      return false;
    }
  }

  async verifyAuth(): Promise<{ ok: boolean; message?: string }> {
    try {
      // Test ping first
      await this.request('ping');
      // Then test an endpoint requiring auth
      await this.request('show_config');
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Connection or authentication failed' };
    }
  }

  async getStaticBotConfig(forceRefresh: boolean = false): Promise<NonNullable<FreqtradeClient['cachedStaticState']>> {
    const now = Date.now();
    if (this.cachedStaticState && !forceRefresh && now - this.lastStaticFetchTime < 600000) {
      return this.cachedStaticState;
    }

    try {
      const [versionData, configData, whitelistData, blacklistData] = await Promise.all([
        this.request<{ version: string }>('version').catch(() => ({ version: 'Freqtrade' })),
        this.request<{
          strategy?: string;
          strategy_version?: string;
          timeframe?: string;
          state?: 'running' | 'stopped';
          dry_run?: boolean;
          stake_currency?: string;
          max_open_trades?: number;
          stake_amount?: number | string;
          tradable_balance_ratio?: number;
        }>('show_config'),
        this.request<{ whitelist: string[] }>('whitelist').catch(() => ({ whitelist: [] })),
        this.request<{ blacklist?: string[]; blacklist_expanded?: string[] }>('blacklist').catch(() => ({ blacklist: [], blacklist_expanded: [] })),
      ]);

      this.cachedStaticState = {
        version: versionData.version || 'Freqtrade',
        strategy: configData.strategy || 'FreqtradeStrategy',
        strategy_version: configData.strategy_version || '',
        timeframe: configData.timeframe || '5m',
        state: configData.state || 'running',
        dry_run: configData.dry_run ?? true,
        stake_currency: configData.stake_currency || 'USDT',
        max_open_trades: configData.max_open_trades || 5,
        stake_amount: configData.stake_amount ?? 0,
        tradable_balance_ratio: configData.tradable_balance_ratio ?? 0.99,
        whitelist: whitelistData.whitelist || [],
        blacklist: blacklistData.blacklist || [],
        blacklist_expanded: blacklistData.blacklist_expanded || [],
      };
      this.lastStaticFetchTime = now;
      return this.cachedStaticState;
    } catch (err: any) {
      console.warn('getStaticBotConfig failed:', err);
      throw err;
    }
  }

  async getBotState(forceRefreshStatic: boolean = false): Promise<BotState> {
    try {
      const [staticConfig, balanceData] = await Promise.all([
        this.getStaticBotConfig(forceRefreshStatic),
        this.request<{
          total: number;
          free?: number;
          currencies?: Array<{
            currency: string;
            free: number;
            balance: number;
            used: number;
            est_stake?: number;
            stake?: string;
            is_position?: boolean;
            position?: number;
          }>;
          stake?: string;
          symbol?: string;
        }>('balance'),
      ]);

      const stakeCurrency = staticConfig.stake_currency || 'USDT';
      const currencies = Array.isArray(balanceData.currencies) ? balanceData.currencies : [];
      const stakeItem = currencies.find(
        (c) => c.currency.toUpperCase() === stakeCurrency.toUpperCase()
      );

      // Accurate stake currency balance for trade budgeting
      const stakeBalance = stakeItem ? Number(stakeItem.balance ?? 0) : Number(balanceData.total ?? 0);
      const stakeFree = stakeItem ? Number(stakeItem.free ?? 0) : Number(balanceData.free ?? balanceData.total ?? 0);
      const totalPortfolioBalance = Number(balanceData.total ?? stakeBalance);

      return {
        version: staticConfig.version,
        strategy: staticConfig.strategy,
        strategy_version: staticConfig.strategy_version,
        timeframe: staticConfig.timeframe,
        state: staticConfig.state,
        dry_run: staticConfig.dry_run,
        stake_currency: staticConfig.stake_currency,
        max_open_trades: staticConfig.max_open_trades,
        balance: stakeBalance,
        free_balance: stakeFree,
        total_balance: totalPortfolioBalance,
        currencies: currencies.map((c) => ({
          currency: c.currency,
          free: Number(c.free ?? 0),
          balance: Number(c.balance ?? 0),
          used: Number(c.used ?? 0),
          est_stake: Number(c.est_stake ?? 0),
          stake: c.stake,
          is_position: c.is_position,
          position: c.position,
        })),
        tradable_balance_ratio: staticConfig.tradable_balance_ratio,
        stake_amount: staticConfig.stake_amount,
        whitelist: staticConfig.whitelist,
        blacklist: staticConfig.blacklist || [],
        blacklist_expanded: staticConfig.blacklist_expanded || [],
      };
    } catch (err: any) {
      console.warn('Real API getBotState failed:', err);
      throw err;
    }
  }

  async getBlacklist(): Promise<{ blacklist: string[]; blacklist_expanded: string[] }> {
    return this.request<{ blacklist: string[]; blacklist_expanded: string[] }>('blacklist');
  }

  async addBlacklist(pairs: string[]): Promise<{ blacklist: string[]; blacklist_expanded: string[] }> {
    return this.request<{ blacklist: string[]; blacklist_expanded: string[] }>('blacklist', {
      method: 'POST',
      body: JSON.stringify({ blacklist: pairs }),
    });
  }

  async deleteBlacklist(pairs: string[]): Promise<{ blacklist: string[]; blacklist_expanded: string[] }> {
    const query = pairs.map((p) => `pairs_to_delete=${encodeURIComponent(p)}`).join('&');
    return this.request<{ blacklist: string[]; blacklist_expanded: string[] }>(`blacklist?${query}`, {
      method: 'DELETE',
    });
  }

  /**
   * Fetch strategy source code from Freqtrade REST API.
   * Used by StrategyBlueprintModal to extract live numeric parameters
   * (grinding stakes, profit thresholds, derisk levels, mode tags) so the
   * modal reflects whatever version of the strategy is currently running.
   *
   * Endpoint: GET /api/v1/strategy/{strategy_name}
   * Returns: { strategy, timeframe, params, code }
   */
  async getStrategySource(strategyName: string): Promise<{ code: string; params: Record<string, any>; timeframe?: string } | null> {
    try {
      const data = await this.request<{ strategy: string; timeframe?: string; params?: any; code?: string }>(
        `strategy/${encodeURIComponent(strategyName)}`
      );
      if (!data || !data.code) return null;
      return {
        code: data.code,
        params: data.params || {},
        timeframe: data.timeframe,
      };
    } catch (err: any) {
      console.warn('getStrategySource failed:', err);
      return null;
    }
  }

  async getActiveTrades(): Promise<Trade[]> {
    try {
      const data = await this.request<any[]>('status');
      if (!Array.isArray(data)) return [];
      return data.map((item) => ({
        trade_id: item.trade_id,
        pair: item.pair,
        is_open: true,
        is_short: item.is_short,
        open_date: item.open_date,
        open_timestamp: item.open_timestamp,
        open_rate: item.open_rate,
        current_rate: item.current_rate,
        amount: item.amount,
        stake_amount: item.stake_amount,
        profit_ratio: item.profit_ratio,
        profit_pct: Math.round((item.profit_ratio || 0) * 10000) / 100,
        profit_abs:
          item.profit_abs !== undefined
            ? item.profit_abs
            : item.total_profit_abs !== undefined
            ? item.total_profit_abs
            : (Number(item.stake_amount) || 0) * (Number(item.profit_ratio) || 0),
        stop_loss_pct: item.stop_loss_pct,
        stop_loss_abs: item.stop_loss_abs,
        enter_tag: item.enter_tag,
        timeframe: item.timeframe,
        orders: mapOrders(item.orders),
      }));
    } catch (err) {
      console.warn('Real API getActiveTrades failed:', err);
      throw err;
    }
  }

  async getProfitSummary(): Promise<ProfitSummary> {
    try {
      const raw = await this.request<any>('profit');
      return {
        profit_closed_coin: raw.profit_closed_coin ?? 0,
        profit_closed_percent_mean: raw.profit_closed_percent_mean ?? 0,
        profit_closed_ratio: raw.profit_closed_ratio ?? 0,
        profit_closed_fiat: raw.profit_closed_fiat ?? 0,
        profit_all_coin: raw.profit_all_coin ?? 0,
        profit_all_percent_mean: raw.profit_all_percent_mean ?? 0,
        profit_all_ratio: raw.profit_all_ratio ?? 0,
        profit_all_fiat: raw.profit_all_fiat ?? 0,
        trade_count: raw.trade_count ?? 0,
        closed_trade_count: raw.closed_trade_count ?? 0,
        first_trade_date: raw.first_trade_date ?? '-',
        latest_trade_date: raw.latest_trade_date ?? '-',
        avg_duration: raw.avg_duration ?? '0m',
        best_pair: raw.best_pair ?? '-',
        winning_trades: raw.winning_trades ?? 0,
        losing_trades: raw.losing_trades ?? 0,
        winrate: raw.winrate ?? 0,
        // Freqtrade returns max_drawdown as a 0..1 account-drawdown ratio.
        max_drawdown: raw.max_drawdown ?? 0,
        max_drawdown_pct: (raw.max_drawdown ?? 0) * 100,
      };
    } catch (err) {
      console.warn('Real API getProfitSummary failed:', err);
      return {
        profit_closed_coin: 0,
        profit_closed_percent_mean: 0,
        profit_closed_ratio: 0,
        profit_closed_fiat: 0,
        profit_all_coin: 0,
        profit_all_percent_mean: 0,
        profit_all_ratio: 0,
        profit_all_fiat: 0,
        trade_count: 0,
        closed_trade_count: 0,
        first_trade_date: '-',
        latest_trade_date: '-',
        avg_duration: '-',
        best_pair: '-',
        winning_trades: 0,
        losing_trades: 0,
        winrate: 0,
        max_drawdown: 0,
        max_drawdown_pct: 0,
      };
    }
  }

  async getClosedTrades(
    limit: number = 500,
    orderById: boolean = false,
    options?: { fetchAll?: boolean; maxLimit?: number }
  ): Promise<Trade[]> {
    try {
      const pageSize = Math.min(limit, 500);
      const data = await this.request<{ trades: any[]; total_trades?: number }>('trades', {
        limit: pageSize,
        offset: 0,
        order_by_id: orderById,
      });

      let rawTrades = data.trades || [];
      const totalTrades = data.total_trades ?? rawTrades.length;

      // If fetchAll is requested (or limit > 500) and there are more trades available in Freqtrade
      if ((options?.fetchAll || limit > 500) && totalTrades > rawTrades.length) {
        const targetCount = options?.fetchAll ? (options.maxLimit || 10000) : limit;
        let currentOffset = rawTrades.length;

        while (currentOffset < totalTrades && rawTrades.length < targetCount) {
          const nextBatch = await this.request<{ trades: any[] }>('trades', {
            limit: pageSize,
            offset: currentOffset,
            order_by_id: orderById,
          }).catch(() => null);

          if (!nextBatch || !nextBatch.trades || nextBatch.trades.length === 0) {
            break;
          }
          rawTrades = rawTrades.concat(nextBatch.trades);
          currentOffset += nextBatch.trades.length;
        }
      }

      const list: Trade[] = rawTrades
        .filter((t) => !t.is_open)
        .map((t) => ({
          trade_id: t.trade_id,
          pair: t.pair,
          is_open: false,
          is_short: t.is_short,
          open_date: t.open_date,
          open_timestamp: t.open_timestamp,
          close_date: t.close_date,
          close_timestamp: t.close_timestamp,
          open_rate: t.open_rate,
          close_rate: t.close_rate,
          amount: t.amount,
          stake_amount: t.stake_amount,
          profit_ratio: t.profit_ratio,
          profit_pct: Math.round((t.profit_ratio || 0) * 10000) / 100,
          profit_abs:
            t.profit_abs !== undefined
              ? t.profit_abs
              : t.close_profit_abs !== undefined
              ? t.close_profit_abs
              : (Number(t.stake_amount) || 0) * (Number(t.profit_ratio) || 0),
          enter_tag: t.enter_tag,
          exit_tag: t.exit_tag,
          exit_reason: t.exit_reason,
          orders: mapOrders(t.orders),
        }));

      // Strictly sort newest trades first (latest close_date / close_timestamp)
      list.sort((a, b) => {
        const timeA = a.close_timestamp || (a.close_date ? new Date(a.close_date).getTime() : 0);
        const timeB = b.close_timestamp || (b.close_date ? new Date(b.close_date).getTime() : 0);
        return timeB - timeA;
      });

      return list;
    } catch (err) {
      console.warn('Real API getClosedTrades failed:', err);
      return [];
    }
  }

  async getAllClosedTrades(maxLimit: number = 10000): Promise<Trade[]> {
    return this.getClosedTrades(500, false, { fetchAll: true, maxLimit });
  }

  async getDailyPerformance(timescale: number = 30): Promise<DailyRecord[]> {
    try {
      const res = await this.request<any>('daily', { timescale });
      let records: any[] = [];
      if (Array.isArray(res)) {
        records = res;
      } else if (res && Array.isArray(res.data)) {
        records = res.data;
      }
      return records.map((d) => ({
        date: String(d.date || ''),
        abs_profit: Number(d.abs_profit ?? 0),
        rel_profit: d.rel_profit !== undefined ? Number(d.rel_profit) : undefined,
        fiat_value: Number(d.fiat_value ?? 0),
        trade_count: Number(d.trade_count ?? 0),
        starting_balance: d.starting_balance !== undefined ? Number(d.starting_balance) : undefined,
      }));
    } catch (err) {
      console.warn('Real API getDailyPerformance failed:', err);
      return [];
    }
  }

  async getSignalStats(closedTrades?: Trade[]): Promise<SignalStat[]> {
    try {
      const closed = closedTrades || (await this.getClosedTrades(500, false));
      if (closed.length === 0) return [];

      const map = new Map<string, { total: number; wins: number; loss: number; profits: number[] }>();

      closed.forEach((t) => {
        // Look up signal identifier from enter_tag, exit_tag, or exit_reason
        const tag = t.enter_tag || t.exit_tag || t.exit_reason || 'Manual / Untagged';
        const cur = map.get(tag) || { total: 0, wins: 0, loss: 0, profits: [] };
        cur.total++;
        if (t.profit_ratio >= 0) cur.wins++;
        else cur.loss++;
        cur.profits.push(t.profit_pct);
        map.set(tag, cur);
      });

      return Array.from(map.entries())
        .map(([tag, v]) => {
          const sumProfit = v.profits.reduce((a, b) => a + b, 0);
          return {
            tag,
            total_trades: v.total,
            win_trades: v.wins,
            loss_trades: v.loss,
            win_rate: v.total > 0 ? v.wins / v.total : 0,
            total_profit_pct: Math.round(sumProfit * 100) / 100,
            avg_profit_pct: v.total > 0 ? Math.round((sumProfit / v.total) * 100) / 100 : 0,
            avg_duration_min: 0,
          };
        })
        .sort((a, b) => b.total_profit_pct - a.total_profit_pct);
    } catch {
      return [];
    }
  }

  /**
   * Fetches real Candlestick (OHLCV) data from Freqtrade /api/v1/pair_candles
   * Handles Freqtrade's PairHistory schema: { columns: string[], data: any[][] }
   * Formats timestamps to Unix seconds and sorts strictly ascending for lightweight-charts
   */
  async getCandles(pair: string, timeframe?: string, limit = 1000, beforeTimestamp?: number): Promise<CandleData[]> {
    if (!['BTC/USDT', 'ETH/USDT'].includes(pair)) return [];
    const tf = timeframe && timeframe !== '-' ? timeframe : this.config.timeframe || '4h';
    if (beforeTimestamp) return this.fetchBinanceCandles(pair, tf, limit, beforeTimestamp);
    try {
      const response = await this.request<any>('pair_candles', { pair, timeframe: tf, limit });
      const columns: string[] = response.columns || [];
      const rows: any[][] = response.data || [];
      const index = (name: string) => columns.indexOf(name);
      if (!rows.length || index('close') < 0) return this.fetchBinanceCandles(pair, tf, limit);
      const result: CandleData[] = [];
      for (const row of rows) {
        const raw = row[index('date')];
        const time = typeof raw === 'number' ? Math.floor(raw > 1e11 ? raw / 1000 : raw) : Math.floor(Date.parse(raw) / 1000);
        const candle: CandleData = { time, open: Number(row[index('open')]), high: Number(row[index('high')]), low: Number(row[index('low')]), close: Number(row[index('close')]), volume: Number(row[index('volume')]) };
        for (const name of ['sma50', 'sma200'] as const) {
          const value = index(name) >= 0 ? row[index(name)] : null;
          if (value != null && Number.isFinite(Number(value))) candle[name] = Number(value);
        }
        if ([candle.time,candle.open,candle.high,candle.low,candle.close,candle.volume].every(Number.isFinite)) result.push(candle);
      }
      return [...new Map(result.sort((a,b) => a.time-b.time).map(c => [c.time,c])).values()];
    } catch { return this.fetchBinanceCandles(pair, tf, limit); }
  }

  private async fetchBinanceCandles(pair: string, timeframe: string, limit = 500, beforeTimestamp?: number): Promise<CandleData[]> {
    if (!['BTC/USDT', 'ETH/USDT'].includes(pair)) return [];
    const intervals = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w'];
    if (!intervals.includes(timeframe)) return [];
    const query = new URLSearchParams({symbol:pair.replace('/',''),interval:timeframe,limit:String(Math.max(1, Math.min(1000, Math.floor(limit))))});
    if (beforeTimestamp) query.set('endTime', String(Math.floor(beforeTimestamp*1000)-1));
    const response = await fetch(`${PREVIEW_ROOT}market/klines?${query}`, {headers:this.getAuthHeader(),signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('无法读取现货行情，请稍后重试。');
    const rows: any[][] = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(k => ({time:Math.floor(Number(k[0])/1000),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])})).filter(c => Object.values(c).every(Number.isFinite)).sort((a,b) => a.time-b.time);
  }

  async getLogs(limit: number = 100): Promise<LogEntry[]> {
    try {
      const data = await this.request<any>('logs', { limit });
      const rawLogs = data.logs || data.log || (Array.isArray(data) ? data : []);
      return rawLogs.map((row: any, i: number) => {
        if (Array.isArray(row)) {
          const timestamp = String(row[0] || '');
          const level = (String(row.length >= 5 ? row[3] : row[2] || 'INFO').toUpperCase() as any) || 'INFO';
          const message = String(row.length >= 5 ? row[4] : row[3] || row[1] || '');
          return {
            id: `${i}-${row[1] || timestamp || Date.now()}`,
            timestamp,
            level,
            message,
          };
        } else if (typeof row === 'object' && row !== null) {
          return {
            id: `${i}-${row.timestamp || Date.now()}`,
            timestamp: String(row.timestamp || row.created_at || ''),
            level: (String(row.level || 'INFO').toUpperCase() as any) || 'INFO',
            message: String(row.message || row.msg || ''),
          };
        } else {
          return {
            id: String(i),
            timestamp: '',
            level: 'INFO',
            message: String(row),
          };
        }
      });
    } catch (err) {
      console.warn('Real API getLogs failed:', err);
      return [];
    }
  }

  async forceExit(tradeId: number): Promise<boolean> {
    try {
      await this.postRequest('forceexit', { tradeid: String(tradeId) });
      return true;
    } catch {
      return false;
    }
  }

  async startBot(): Promise<boolean> {
    try {
      await this.postRequest('start');
      return true;
    } catch {
      return false;
    }
  }

  async stopBot(): Promise<boolean> {
    try {
      await this.postRequest('stop');
      return true;
    } catch {
      return false;
    }
  }

  async reloadConfig(): Promise<boolean> {
    try {
      await this.postRequest('reload_config');
      return true;
    } catch {
      return false;
    }
  }
}
