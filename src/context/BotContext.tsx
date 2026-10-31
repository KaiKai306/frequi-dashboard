import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import type {
  BotConfig,
  BotProfile,
  BotState,
  DailyRecord,
  LogEntry,
  ProfitSummary,
  SignalStat,
  Trade,
} from '../types';
import { FreqtradeClient, EMPTY_BOT_STATE, normalizeApiUrl, isPaperApiUrl } from '../api/client';
import { useLocale } from '../i18n/LocaleContext';

export type CurrencyUnit = 'USDT' | 'USD' | 'CNY' | 'EUR' | 'IDR';

export interface ExchangeRates {
  USD: number;
  CNY: number;
  EUR: number;
  IDR: number;
}

interface BotContextValue {
  profiles: BotProfile[];
  activeProfile: BotProfile | null;
  activeBotId: string | null;
  isSelectingBot: boolean;
  setIsSelectingBot: (val: boolean) => void;
  client: FreqtradeClient;
  config: BotConfig;
  botState: BotState;
  activeTrades: Trade[];
  closedTrades: Trade[];
  profitSummary: ProfitSummary | null;
  dailyRecords: DailyRecord[];
  signals: SignalStat[];
  logs: LogEntry[];
  logLimit: number;
  setLogLimit: (limit: number) => void;
  fetchLogs: (limit?: number) => Promise<void>;
  isLoadingLogs: boolean;
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  isConnected: boolean;
  isConnecting: boolean;
  lastError: string | null;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  currencyUnit: CurrencyUnit;
  setCurrencyUnit: (unit: CurrencyUnit) => void;
  exchangeRates: ExchangeRates;
  setCustomRate: (unit: CurrencyUnit, rate: number) => void;
  fetchLiveRates: () => Promise<void>;
  formatCurrency: (val: number, options?: { showSign?: boolean; decimals?: number }) => string;
  hideBalances: boolean;
  toggleHideBalances: () => void;
  initialCapital: number;
  setInitialCapital: (val: number) => void;
  isManualCapital: boolean;
  resetInitialCapitalToAuto: () => void;
  autoInferredCapital: number;
  isReadOnly: boolean;
  addProfile: (profile: Omit<BotProfile, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string; id?: string }>;
  updateProfile: (id: string, updates: Partial<BotProfile>) => Promise<boolean>;
  deleteProfile: (id: string) => void;
  logoutAllProfiles: () => void;
  switchBot: (id: string) => Promise<boolean>;
  disconnectCurrent: () => void;
  refreshData: (overrideClient?: FreqtradeClient, forceAll?: boolean) => Promise<void>;
  forceExitTrade: (tradeId: number) => Promise<boolean>;
  startBot: () => Promise<boolean>;
  stopBot: () => Promise<boolean>;
  reloadConfig: () => Promise<boolean>;
  mobileTab: string;
  setMobileTab: (tab: string) => void;
  refreshCountdown: number;
  refreshInterval: number;
  setRefreshInterval: (seconds: number) => void;
  loadAllClosedTrades: () => Promise<Trade[]>;
  isLoadingAllTrades: boolean;
  importProfiles: (
    importedProfiles: BotProfile[],
    activeId?: string,
    botSettings?: Record<string, { initialCapital?: number; isManualCapital?: boolean }>
  ) => Promise<boolean>;
}

const BotContext = createContext<BotContextValue | null>(null);
const PAPER_PROFILES_KEY = 'happykai_paper_profiles_v2';
const PAPER_ACTIVE_KEY = 'happykai_paper_active_v2';

function loadInitialProfiles(): { profiles: BotProfile[]; activeId: string | null } {
  try {
    const raw = sessionStorage.getItem(PAPER_PROFILES_KEY) || sessionStorage.getItem('happykai_preview_profiles');
    if (raw) {
      const profiles = JSON.parse(raw) as BotProfile[];
      if (Array.isArray(profiles) && profiles.length) {
        const activeId = sessionStorage.getItem(PAPER_ACTIVE_KEY) || sessionStorage.getItem('happykai_preview_active_id');
        return {profiles:profiles.map(p => ({...p,apiUrl:normalizeApiUrl(p.apiUrl)})),activeId:profiles.some(p => p.id === activeId) ? activeId : profiles[0].id};
      }
    }
  } catch { /* A fresh session simply asks the user to log in. */ }
  return {profiles:[],activeId:null};
}

function loadBotSnapshot(botId: string | null): {
  botId?: string;
  botState?: BotState;
  activeTrades?: Trade[];
  profitSummary?: ProfitSummary;
  closedTrades?: Trade[];
} | null {
  if (!botId) return null;
  try {
    const raw = sessionStorage.getItem(`frequi_snapshot_${botId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.botId && parsed.botId !== botId) return null;
      return parsed;
    }
  } catch {}
  return null;
}

function saveBotSnapshot(
  botId: string | null,
  data: {
    botState?: BotState;
    activeTrades?: Trade[];
    profitSummary?: ProfitSummary | null;
    closedTrades?: Trade[];
  }
) {
  if (!botId) return;
  try {
    const existing = loadBotSnapshot(botId) || {};
    const updated = {
      ...existing,
      ...data,
      botId,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(`frequi_snapshot_${botId}`, JSON.stringify(updated));
  } catch {}
}

export function BotProvider({ children }: { children: ReactNode }) {
  useLocale();

  // Theme state: 默认白天模式 (Light mode)
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('nfi_theme') as 'dark' | 'light';
    return saved || 'dark';
  });


  const setTheme = (t: 'dark' | 'light') => {
    localStorage.setItem('nfi_theme', t);
    setThemeState(t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Multi-Bot profiles & active bot
  const [initialData] = useState(loadInitialProfiles);
  const [profiles, setProfiles] = useState<BotProfile[]>(initialData.profiles);
  const [activeBotId, setActiveBotId] = useState<string | null>(initialData.activeId);
  const [isSelectingBot, setIsSelectingBot] = useState<boolean>(false);

  const activeProfile = useMemo(() => {
    if (!activeBotId) return null;
    return profiles.find((p) => p.id === activeBotId) || null;
  }, [profiles, activeBotId]);

  const config: BotConfig = useMemo(() => {
    if (!activeProfile) {
      return { apiUrl: '' };
    }
    return {
      apiUrl: activeProfile.apiUrl,
      username: activeProfile.username,
      password: activeProfile.password,
      };
  }, [activeProfile]);

  const [client, setClient] = useState<FreqtradeClient>(() => new FreqtradeClient(config));
  const clientRef = useRef<FreqtradeClient>(client);
  const activeBotIdRef = useRef<string | null>(activeBotId);
  const activeRequestIdRef = useRef<number>(0);
  const lastLoadedBotIdRef = useRef<string | null>(null);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  useEffect(() => {
    activeBotIdRef.current = activeBotId;
  }, [activeBotId]);

  // Update client when active profile / config changes
  useEffect(() => {
    const cur = clientRef.current.getConfig();
    if (cur.apiUrl === config.apiUrl && cur.username === config.username && cur.password === config.password) {
      return;
    }
    const nextClient = new FreqtradeClient(config);
    clientRef.current = nextClient;
    setClient(nextClient);
  }, [config]);

  // Branch 'hide-operation-buttons': Default to Read-Only mode to hide all dangerous operation buttons
  const isReadOnly = true;

  // Global Currency Unit State: 优先保留用户设置(CNY/EUR/IDR/USD)，旧版USDT自动平滑升级为USD
  const [currencyUnit, setCurrencyUnitState] = useState<CurrencyUnit>(() => {
    return 'USDT';
  });

  const setCurrencyUnit = (unit: CurrencyUnit) => {
    setCurrencyUnitState(unit);
    localStorage.setItem('frequi_currency_unit', unit);
  };

  // Mobile App active tab state
  const [mobileTab, setMobileTab] = useState<string>('frequi_dashboard');

  // Configurable auto-refresh interval (defaults to 2s micro-heartbeat, 0 means manual, persisted to localStorage)
  const [refreshInterval, setRefreshIntervalState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('frequi_refresh_interval');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          if (parsed > 0 && parsed < 6) return 6;
          return parsed;
        }
      }
    } catch {}
    return 6;
  });

  const [refreshCountdown, setRefreshCountdown] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('frequi_refresh_interval');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          if (parsed > 0 && parsed < 6) return 6;
          return parsed;
        }
      }
    } catch {}
    return 6;
  });

  const [timerResetKey, setTimerResetKey] = useState<number>(0);

  const setRefreshInterval = useCallback((seconds: number) => {
    const val = seconds <= 0 ? 0 : Math.max(6, Math.floor(seconds));
    setRefreshIntervalState(val);
    setRefreshCountdown(val);
    setTimerResetKey((k) => k + 1);
    try {
      localStorage.setItem('frequi_refresh_interval', String(val));
    } catch {}
  }, []);

  const refreshIntervalRef = useRef<number>(refreshInterval);
  useEffect(() => {
    refreshIntervalRef.current = refreshInterval;
  }, [refreshInterval]);

  // Live & Configurable Exchange Rates (defaults to real market rates: ~6.7025 for CNY, ~0.8929 for EUR, ~16000 for IDR)
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>(() => {
    try {
      const saved = localStorage.getItem('frequi_exchange_rates');
      if (saved) {
        return { USD: 1, CNY: 6.7025, EUR: 0.8929, IDR: 16000, ...JSON.parse(saved) };
      }
    } catch {}
    return { USD: 1, CNY: 6.7025, EUR: 0.8929, IDR: 16000 };
  });

  const fetchLiveRates = useCallback(async () => { /* Preview uses USDT only. */ }, []);

  // Currency conversion is optional; no third-party call delays the initial view.

  const setCustomRate = useCallback((unit: CurrencyUnit, newRate: number) => {
    if (unit === 'USD' || unit === 'USDT' || newRate <= 0) return;
    setExchangeRates((prev) => {
      const updated = { ...prev, [unit]: newRate };
      localStorage.setItem('frequi_exchange_rates', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const [hideBalances, setHideBalances] = useState<boolean>(() => {
    try { return localStorage.getItem('frequi_hide_balances') === 'true'; } catch { return false; }
  });

  const toggleHideBalances = useCallback(() => {
    setHideBalances((current) => {
      const next = !current;
      localStorage.setItem('frequi_hide_balances', String(next));
      return next;
    });
  }, []);

  // Universal Dynamic Currency Formatter
  const formatCurrency = useCallback((val: number, options?: { showSign?: boolean; decimals?: number }): string => {
    if (hideBalances) return '••••••';
    const decimals = options?.decimals ?? (currencyUnit === 'IDR' ? 0 : 2);
    let rate = 1;
    let symbol = '$';

    if (currencyUnit === 'USD') {
      rate = exchangeRates.USD || 1;
      symbol = '$';
    } else if (currencyUnit === 'CNY') {
      rate = exchangeRates.CNY || 6.7025;
      symbol = '¥';
    } else if (currencyUnit === 'EUR') {
      rate = exchangeRates.EUR || 0.8929;
      symbol = '€';
    } else if (currencyUnit === 'IDR') {
      rate = exchangeRates.IDR || 16000;
      symbol = 'Rp';
    }

    const converted = val * rate;
    const sign = options?.showSign && converted > 0 ? '+' : '';
    const formattedNum = converted.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

    return currencyUnit === 'USDT' ? `${sign}${formattedNum} USDT` : `${sign}${symbol}${formattedNum}`;
  }, [currencyUnit, exchangeRates, hideBalances]);

  // ── SWR Snapshot: instant hydrate from cached data ──
  const snapshot = useMemo(() => loadBotSnapshot(initialData.activeId), []);

  // Operational state — pre-filled from snapshot for instant first paint
  const [botState, setBotState] = useState<BotState>(() => snapshot?.botState || EMPTY_BOT_STATE);
  const [activeTrades, setActiveTrades] = useState<Trade[]>(() => snapshot?.activeTrades || []);
  const [closedTrades, setClosedTrades] = useState<Trade[]>(() => snapshot?.closedTrades || []);
  const [isLoadingAllTrades, setIsLoadingAllTrades] = useState<boolean>(false);
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(() => snapshot?.profitSummary || null);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [signals, setSignals] = useState<SignalStat[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logLimit, setLogLimit] = useState<number>(50);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const logLimitRef = useRef<number>(50);
  useEffect(() => {
    logLimitRef.current = logLimit;
  }, [logLimit]);
  const [selectedPair, setSelectedPair] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const deployedStartingCapital = activeProfile?.startingCapital;
  // Auto-calculated or inferred starting capital from live bot data
  const autoInferredCapital = useMemo(() => {
    // Deployment metadata records each virtual wallet's own starting capital.
    if (deployedStartingCapital && deployedStartingCapital > 0) return deployedStartingCapital;
    // 1. Check earliest daily record starting_balance
    if (dailyRecords && dailyRecords.length > 0) {
      const sorted = [...dailyRecords].sort((a, b) => a.date.localeCompare(b.date));
      const earliestWithStarting = sorted.find((r) => r.starting_balance && r.starting_balance > 0);
      if (earliestWithStarting?.starting_balance) {
        return Math.round(earliestWithStarting.starting_balance * 100) / 100;
      }
    }

    // 2. Infer from current balance - closed profit
    if (botState.balance && botState.balance > 0) {
      const closed = profitSummary?.profit_closed_coin || 0;
      const derived = botState.balance - closed;
      if (derived > 0) {
        return Math.round(derived * 100) / 100;
      }
    }

    // 3. Deployment virtual wallets start at 1000 USDT.
    return 1000;
  }, [deployedStartingCapital, dailyRecords, botState.balance, profitSummary]);

  // Helper to load bot-scoped initial capital
  const getBotInitialCapital = useCallback((botId: string | null) => {
    if (!botId) return { isCustom: false, value: 1000 };
    try {
      const isCustom = localStorage.getItem(`frequi_initial_capital_custom_${botId}`) === 'true';
      const saved = localStorage.getItem(`frequi_initial_capital_${botId}`);
      if (isCustom && saved && Number(saved) > 0 && Number(saved) !== 10000) {
        return { isCustom: true, value: Number(saved) };
      }
    } catch {}
    return { isCustom: false, value: 1000 };
  }, []);

  // Track whether the user has manually overridden initial capital for current active bot
  const [isManualCapital, setIsManualCapital] = useState<boolean>(() => {
    return getBotInitialCapital(initialData.activeId).isCustom;
  });

  const [initialCapital, setInitialCapitalState] = useState<number>(() => {
    return getBotInitialCapital(initialData.activeId).value;
  });

  // When bot data loads and user hasn't manually overridden, auto-sync initial capital to inferred value
  useEffect(() => {
    if (!isManualCapital && autoInferredCapital > 0) {
      setInitialCapitalState(autoInferredCapital);
    }
  }, [autoInferredCapital, isManualCapital]);

  const setInitialCapital = useCallback((val: number) => {
    const curId = activeBotIdRef.current;
    setInitialCapitalState(val);
    setIsManualCapital(true);
    if (curId) {
      try {
        localStorage.setItem(`frequi_initial_capital_custom_${curId}`, 'true');
        localStorage.setItem(`frequi_initial_capital_${curId}`, String(val));
      } catch {}
    }
    // Also update legacy key for backward compatibility
    try {
      localStorage.setItem('frequi_initial_capital_custom', 'true');
      localStorage.setItem('frequi_initial_capital', String(val));
    } catch {}
  }, []);

  const resetInitialCapitalToAuto = useCallback(() => {
    const curId = activeBotIdRef.current;
    setIsManualCapital(false);
    if (curId) {
      try {
        localStorage.removeItem(`frequi_initial_capital_custom_${curId}`);
        localStorage.removeItem(`frequi_initial_capital_${curId}`);
      } catch {}
    }
    try {
      localStorage.removeItem('frequi_initial_capital_custom');
      localStorage.removeItem('frequi_initial_capital');
    } catch {}
    setInitialCapitalState(autoInferredCapital);
  }, [autoInferredCapital]);

  // Concurrency & Mutex Locks (生命周期互斥锁，彻底杜绝并发请求压垮 SQLite 连接池)
  const isRefreshingRef = useRef<boolean>(false);
  const lastSecondaryFetchTimeRef = useRef<number>(0);
  const lastBotStateFetchTimeRef = useRef<number>(0);
  const lastRefreshTimeRef = useRef<number>(0);
  const botStateRef = useRef<BotState | null>(null);
  const prevActiveTradeCountRef = useRef<number>(-1);
  const prevActiveTradeIdsRef = useRef<string>('');
  const closedTradesRef = useRef<Trade[]>([]);

  // Sync profiles to localStorage
  const saveProfiles = (newProfiles: BotProfile[], newActiveId?: string | null) => {
    setProfiles(newProfiles);
    sessionStorage.setItem(PAPER_PROFILES_KEY, JSON.stringify(newProfiles));
    if (newActiveId !== undefined) {
      setActiveBotId(newActiveId);
      if (newActiveId) {
        sessionStorage.setItem(PAPER_ACTIVE_KEY, newActiveId);
      } else {
        sessionStorage.removeItem(PAPER_ACTIVE_KEY);
      }
    }
  };

  // Authenticated deployment registry: only the two fixed same-origin gateways.
  // Credentials stay in this browser session and never appear in the registry.
  const registryUsername = config.username;
  const registryPassword = config.password;
  const hasProfiles = profiles.length > 0;
  useEffect(() => {
    if (!hasProfiles) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/preview/backtests/paper-bots.json', {
          headers: { Authorization: 'Basic ' + btoa(`${registryUsername || ''}:${registryPassword || ''}`) },
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) return;
        const registry = await response.json();
        if (registry.schemaVersion !== 1 || !Array.isArray(registry.bots) || controller.signal.aborted) return;
        const bots = registry.bots.filter((bot: any) => bot && typeof bot.name === 'string' && bot.name.length <= 80 && isPaperApiUrl(bot.apiUrl));
        setProfiles(previous => {
          if (controller.signal.aborted || !previous.length) return previous;
          let next = previous.map(profile => {
            const bot = bots.find((item: any) => item.apiUrl === profile.apiUrl);
            return bot ? { ...profile, name: bot.name, startingCapital: Number.isFinite(bot.startingCapital) && bot.startingCapital > 0 ? bot.startingCapital : undefined } : profile;
          });
          for (const bot of bots) {
            if (!next.some(profile => profile.apiUrl === bot.apiUrl)) {
              next.push({ id: bot.apiUrl === '/preview/bot' ? 'paper-baseline' : 'paper-compare', name: bot.name, apiUrl: bot.apiUrl, startingCapital: Number.isFinite(bot.startingCapital) && bot.startingCapital > 0 ? bot.startingCapital : undefined, username: registryUsername, password: registryPassword, createdAt: Date.now() });
            }
          }
          if (JSON.stringify(next) === JSON.stringify(previous)) return previous;
          sessionStorage.setItem(PAPER_PROFILES_KEY, JSON.stringify(next));
          return next;
        });
      } catch { /* Old deployments without a registry keep the single account. */ }
    })();
    return () => controller.abort();
  }, [hasProfiles, registryUsername, registryPassword]);

  /**
   * 分级刷新机制：
   * Tier 1 (轻量高频 6~8s): getBotState, getActiveTrades
   * Tier 2 (中频或事件驱动 60s+ 或持仓数量变化时): getProfitSummary, getClosedTrades, getDailyPerformance
   * Tier 3 (按需/低频 60s+): getSignalStats, getLogs
   */
  const refreshData = useCallback(async (overrideClient?: FreqtradeClient, forceAll: boolean = false) => {
    const targetClient = overrideClient || clientRef.current;
    const currentConfig = targetClient.getConfig();
    if (!currentConfig.apiUrl) return;

    // Mutex Lock: 如果已有非强制请求在处理中，跳过本次。若是 forceAll (如切换机器人或手动强制刷新)，则立刻抢占执行！
    if (isRefreshingRef.current && !forceAll) {
      return;
    }

    isRefreshingRef.current = true;
    const currentReqId = ++activeRequestIdRef.current;
    const currentActiveBotId = activeBotIdRef.current;
    if (refreshIntervalRef.current > 0) {
      setRefreshCountdown(refreshIntervalRef.current);
    }

    try {
      const now = Date.now();
      lastRefreshTimeRef.current = now;
      const timeSinceLastState = now - lastBotStateFetchTimeRef.current;
      const shouldFetchBotState =
        forceAll ||
        !botStateRef.current ||
        lastBotStateFetchTimeRef.current === 0 ||
        timeSinceLastState > 20000;

      // ── Tier 1: Micro-Heartbeat vs Ticker ──
      // Real-time (1-2s): getActiveTrades() ONLY (<1KB, ~15ms, 0 SQLite load)
      // Periodic balance (20s): getBotState() with memory-cached static config
      const [state, active] = await Promise.all([
        shouldFetchBotState ? targetClient.getBotState(forceAll) : Promise.resolve(null),
        targetClient.getActiveTrades(),
      ]);
      if (activeRequestIdRef.current !== currentReqId || activeBotIdRef.current !== currentActiveBotId) return;

      if (state) {
        lastBotStateFetchTimeRef.current = now;
        botStateRef.current = state;
        setBotState(state);
      }
      setActiveTrades(active);

      // Smart pair sync: ensure selectedPair belongs to the current active bot!
      const currentActiveState = state || botStateRef.current;
      setSelectedPair((prev) => {
        const botWhitelist = currentActiveState?.whitelist || [];
        const botActivePairs = active.map((t) => t.pair);
        const botClosedPairs = closedTradesRef.current.map((t) => t.pair);
        const isValidForBot =
          prev &&
          (botWhitelist.includes(prev) || botActivePairs.includes(prev) || botClosedPairs.includes(prev));
        if (isValidForBot) return prev;

        if (active.length > 0 && active[0].pair) return active[0].pair;
        if (currentActiveState && currentActiveState.whitelist.length > 0) return currentActiveState.whitelist[0];
        return '';
      });

      setIsConnected(true);
      setIsConnecting(false);
      setLastError(null);

      // ── SWR: persist snapshot for instant next-load ──
      if (state && currentActiveBotId === activeBotIdRef.current) {
        saveBotSnapshot(currentActiveBotId, { botState: state, activeTrades: active });
      }

      // ── Tier 2 & 3: Event-Driven DB Sync ──
      const timeSinceLastSecondary = now - lastSecondaryFetchTimeRef.current;
      const currentTradeIds = active.map((t) => t.trade_id).sort().join(',');
      const tradeCountChanged = prevActiveTradeCountRef.current !== -1 && prevActiveTradeCountRef.current !== active.length;
      const hadTradeClosed = prevActiveTradeCountRef.current !== -1 && active.length < prevActiveTradeCountRef.current;
      prevActiveTradeCountRef.current = active.length;
      prevActiveTradeIdsRef.current = currentTradeIds;

      const shouldFetchSecondary =
        forceAll ||
        lastSecondaryFetchTimeRef.current === 0 ||
        hadTradeClosed ||
        (tradeCountChanged && active.length > 0) ||
        (document.visibilityState === 'visible' && timeSinceLastSecondary > 45000);

      if (shouldFetchSecondary) {
        lastSecondaryFetchTimeRef.current = now;
        const fetchTier3 = forceAll || timeSinceLastSecondary > 60000 || timeSinceLastSecondary === 0;

        // Core state is committed above first. Keep heavy DB queries serial to protect SQLite.
        const summary = await targetClient.getProfitSummary().catch(() => null);
        if (activeRequestIdRef.current !== currentReqId || activeBotIdRef.current !== currentActiveBotId) return;
        if (summary) setProfitSummary(summary);

        const closed = await targetClient.getClosedTrades(500, false).catch(() => null);
        if (activeRequestIdRef.current !== currentReqId || activeBotIdRef.current !== currentActiveBotId) return;
        if (closed) {
          setClosedTrades(closed);
          closedTradesRef.current = closed;
        }

        const daily = await targetClient.getDailyPerformance(30).catch(() => null);
        if (activeRequestIdRef.current !== currentReqId || activeBotIdRef.current !== currentActiveBotId) return;
        if (daily) setDailyRecords(daily);

        // SWR: include secondary data in snapshot
        if (currentActiveBotId === activeBotIdRef.current) {
          saveBotSnapshot(currentActiveBotId, { profitSummary: summary, closedTrades: closed || undefined });
        }

        if (fetchTier3) {
          const sigs = await targetClient.getSignalStats(closed || undefined).catch(() => null);
          if (activeRequestIdRef.current !== currentReqId || activeBotIdRef.current !== currentActiveBotId) return;
          if (sigs) setSignals(sigs);
        }
      }
    } catch (err: any) {
      if (activeRequestIdRef.current === currentReqId && activeBotIdRef.current === currentActiveBotId) {
        console.warn('Refresh data failed:', err);
        setIsConnected(false);
        setLastError(err?.message || 'Failed to fetch data');
      }
    } finally {
      if (activeRequestIdRef.current === currentReqId) {
        isRefreshingRef.current = false;
        if (refreshIntervalRef.current > 0) {
          setRefreshCountdown(refreshIntervalRef.current);
          setTimerResetKey((k) => k + 1);
        }
      }
    }
  }, []);

  // Switch to a specific bot
  const switchBot = useCallback(async (id: string): Promise<boolean> => {
    const target = profiles.find((p) => p.id === id);
    if (!target) return false;

    // 立即注销上一机器人的所有在途请求并重置状态互斥锁
    ++activeRequestIdRef.current;
    activeBotIdRef.current = id;
    lastLoadedBotIdRef.current = id;
    isRefreshingRef.current = false;
    lastSecondaryFetchTimeRef.current = 0;
    lastBotStateFetchTimeRef.current = 0;
    botStateRef.current = null;
    prevActiveTradeCountRef.current = -1;
    prevActiveTradeIdsRef.current = '';

    setIsConnecting(true);
    setIsConnected(false);
    setLastError(null);

    // 检查是否有针对目标机器人的 SWR 快照，若有则瞬间装载，实现 0 延迟秒切！
    const targetSnapshot = loadBotSnapshot(id);
    if (targetSnapshot) {
      setBotState(targetSnapshot.botState || EMPTY_BOT_STATE);
      setActiveTrades(targetSnapshot.activeTrades || []);
      setClosedTrades(targetSnapshot.closedTrades || []);
      closedTradesRef.current = targetSnapshot.closedTrades || [];
      setProfitSummary(targetSnapshot.profitSummary || null);
      const defaultPair =
        (targetSnapshot.activeTrades && targetSnapshot.activeTrades[0]?.pair) ||
        (targetSnapshot.botState && targetSnapshot.botState.whitelist?.[0]) ||
        '';
      setSelectedPair(defaultPair);
    } else {
      // 目标机器人无本地快照，清空旧数据防止残留污染
      setBotState({
        ...EMPTY_BOT_STATE,
        strategy: 'Connecting...',
      });
      setActiveTrades([]);
      setClosedTrades([]);
      closedTradesRef.current = [];
      setProfitSummary(null);
      setSelectedPair('');
    }

    setDailyRecords([]);
    setSignals([]);
    setLogs([]);
    setIsLoadingLogs(false);
    setIsLoadingAllTrades(false);

    // 切换 initialCapital 到目标 bot 的配置
    const capInfo = getBotInitialCapital(id);
    setIsManualCapital(capInfo.isCustom);
    setInitialCapitalState(capInfo.value);

    setActiveBotId(id);
    sessionStorage.setItem(PAPER_ACTIVE_KEY, id);

    const newClient = new FreqtradeClient({
      apiUrl: target.apiUrl,
      username: target.username,
      password: target.password,
    });
    newClient.clearInFlightRequests();
    clientRef.current = newClient;
    setClient(newClient);

    try {
      await refreshData(newClient, true);

      if (activeBotIdRef.current === id && botStateRef.current) {
        setIsConnected(true);
        setLastError(null);
        setIsSelectingBot(false);
        return true;
      }
      return false;
    } catch (err: any) {
      if (activeBotIdRef.current === id) {
        setIsConnected(false);
        const errMsg = err?.message || 'Unable to connect to bot node';
        setLastError(errMsg);
      }
      return false;
    } finally {
      if (activeBotIdRef.current === id) {
        setIsConnecting(false);
      }
    }
  }, [profiles, refreshData, getBotInitialCapital]);

  // Add a new profile
  const addProfile = useCallback(async (
    profileData: Omit<BotProfile, 'id' | 'createdAt'>
  ): Promise<{ success: boolean; error?: string; id?: string }> => {
    setIsConnecting(true);
    setLastError(null);

    const cleanUrl = normalizeApiUrl(profileData.apiUrl);
    const tempClient = new FreqtradeClient({
      apiUrl: cleanUrl,
      username: profileData.username,
      password: profileData.password,
    });

    const verify = await tempClient.verifyAuth();
    if (!verify.ok) {
      setIsConnecting(false);
      const errMsg = verify.message || 'Connection failed, please check address or credentials';
      setLastError(errMsg);
      return { success: false, error: errMsg };
    }

    const newId = profiles.find(item => item.apiUrl === cleanUrl)?.id || (cleanUrl === '/preview/bots/compare' ? 'paper-compare' : 'paper-baseline');
    const newProfile: BotProfile = {
      ...profileData,
      apiUrl: cleanUrl,
      id: newId,
      createdAt: Date.now(),
      lastConnected: Date.now(),
    };

    const nextList = [...profiles.filter(item => item.id !== newId), newProfile];
    ++activeRequestIdRef.current;
    activeBotIdRef.current = newId;
    lastLoadedBotIdRef.current = newId;
    botStateRef.current = null;
    clientRef.current = tempClient;
    const capInfo = getBotInitialCapital(newId);
    setIsManualCapital(capInfo.isCustom);
    setInitialCapitalState(capInfo.value);
    saveProfiles(nextList, newId);
    setClient(tempClient);
    setIsConnected(true);
    setIsConnecting(false);
    setIsSelectingBot(false);

    await refreshData(tempClient, true);
    return { success: true, id: newId };
  }, [profiles, refreshData, getBotInitialCapital]);

  // Update existing profile (name, apiUrl, username, password)
  const updateProfile = useCallback(async (id: string, updates: Partial<BotProfile>): Promise<boolean> => {
    const existing = profiles.find((p) => p.id === id);
    if (!existing) return false;

    const isProtected = false;

    // 对于受保护/分享的机器人，允许随意修改名称 (name)，但严格禁止篡改敏感连接凭据
    const safeUpdates: Partial<BotProfile> = isProtected
      ? { name: (updates.name || '').trim() || existing.name }
      : {
          ...updates,
          name: (updates.name || '').trim() || existing.name,
        };

    const updated = profiles.map((p) => (p.id === id ? { ...p, ...safeUpdates } : p));
    saveProfiles(updated);

    if (activeBotId === id && !isProtected) {
      const active = updated.find((p) => p.id === id);
      if (active) {
        const newClient = new FreqtradeClient({
          apiUrl: active.apiUrl,
          username: active.username,
          password: active.password,
        });
        setClient(newClient);
        await refreshData(newClient);
      }
    }
    return true;
  }, [profiles, activeBotId, refreshData]);

  // Delete profile
  const deleteProfile = useCallback((id: string) => {
    const remaining = profiles.filter((p) => p.id !== id);
    if (activeBotId === id) {
      const nextActive = remaining.length > 0 ? remaining[0].id : null;
      saveProfiles(remaining, nextActive);
      if (nextActive) {
        switchBot(nextActive);
      } else {
        localStorage.removeItem('nfi_bot_config');
        sessionStorage.removeItem(PAPER_ACTIVE_KEY);
        setIsConnected(false);
        setBotState(EMPTY_BOT_STATE);
        setActiveTrades([]);
        setClosedTrades([]);
      }
    } else {
      saveProfiles(remaining);
    }
  }, [profiles, activeBotId, switchBot]);

  const logoutAllProfiles = useCallback(() => {
    ++activeRequestIdRef.current;
    activeBotIdRef.current = null;
    lastLoadedBotIdRef.current = null;
    botStateRef.current = null;
    closedTradesRef.current = [];
    isRefreshingRef.current = false;
    for (const profile of profiles) sessionStorage.removeItem(`frequi_snapshot_${profile.id}`);
    sessionStorage.removeItem(PAPER_PROFILES_KEY);
    sessionStorage.removeItem(PAPER_ACTIVE_KEY);
    sessionStorage.removeItem('happykai_preview_profiles');
    sessionStorage.removeItem('happykai_preview_active_id');
    setProfiles([]);
    setActiveBotId(null);
    const emptyClient = new FreqtradeClient({ apiUrl: '' });
    clientRef.current = emptyClient;
    setClient(emptyClient);
    setIsConnected(false);
    setIsConnecting(false);
    setIsSelectingBot(false);
    setIsManualCapital(false);
    setInitialCapitalState(1000);
    setLastError(null);
    setBotState(EMPTY_BOT_STATE);
    setActiveTrades([]); setClosedTrades([]); setDailyRecords([]);
    setProfitSummary(null); setSignals([]); setLogs([]);
    setSelectedPair('');
  }, [profiles]);

  // Batch import profiles from backup file preserving exact ordering and config
  const importProfiles = useCallback(
    async (
      importedProfiles: BotProfile[],
      newActiveId?: string,
      botSettings?: Record<string, { initialCapital?: number; isManualCapital?: boolean }>
    ): Promise<boolean> => {
      if (!Array.isArray(importedProfiles) || importedProfiles.length === 0) {
        return false;
      }

      // Sanitize and preserve exact order
      const sanitized: BotProfile[] = importedProfiles.map((p, idx) => ({
        id: p.id || `bot_${Date.now()}_${idx}`,
        name: p.name || `Bot #${idx + 1}`,
        apiUrl: normalizeApiUrl(p.apiUrl || '/'),
        username: p.username || '',
        password: p.password || '',
        createdAt: p.createdAt || Date.now(),
        lastConnected: p.lastConnected,
      }));

      // Restore bot-specific initial capital settings if provided
      if (botSettings) {
        Object.entries(botSettings).forEach(([botId, s]) => {
          if (s?.initialCapital !== undefined) {
            localStorage.setItem(`frequi_initial_capital_${botId}`, String(s.initialCapital));
          }
          if (s?.isManualCapital) {
            localStorage.setItem(`frequi_initial_capital_custom_${botId}`, 'true');
          }
        });
      }

      // Target active bot: either specified or first bot in the imported array
      const targetActiveId =
        newActiveId && sanitized.some((p) => p.id === newActiveId)
          ? newActiveId
          : sanitized[0].id;

      saveProfiles(sanitized, targetActiveId);

      // Immediately connect to the target active bot
      await switchBot(targetActiveId);
      return true;
    },
    [switchBot]
  );

  const disconnectCurrent = useCallback(() => {
    setIsSelectingBot(true);
  }, []);

  const forceExitTrade = useCallback(async (tradeId: number): Promise<boolean> => {
    if (isReadOnly) return false;
    const success = await client.forceExit(tradeId);
    if (success) {
      await refreshData();
    }
    return success;
  }, [client, isReadOnly, refreshData]);

  const startBot = useCallback(async (): Promise<boolean> => {
    if (isReadOnly) return false;
    const success = await client.startBot();
    if (success) await refreshData();
    return success;
  }, [client, isReadOnly, refreshData]);

  const stopBot = useCallback(async (): Promise<boolean> => {
    if (isReadOnly) return false;
    const success = await client.stopBot();
    if (success) await refreshData();
    return success;
  }, [client, isReadOnly, refreshData]);

  const reloadConfig = useCallback(async (): Promise<boolean> => {
    if (isReadOnly) return false;
    const success = await client.reloadConfig();
    if (success) await refreshData();
    return success;
  }, [client, isReadOnly, refreshData]);

  const loadAllClosedTrades = useCallback(async (): Promise<Trade[]> => {
    if (!clientRef.current) return closedTradesRef.current;
    const currentActiveBotId = activeBotIdRef.current;
    setIsLoadingAllTrades(true);
    try {
      const all = await clientRef.current.getAllClosedTrades();
      if (activeBotIdRef.current !== currentActiveBotId) return closedTradesRef.current;
      if (all && all.length > 0) {
        setClosedTrades(all);
        closedTradesRef.current = all;
        if (currentActiveBotId) {
          saveBotSnapshot(currentActiveBotId, { closedTrades: all });
        }
      }
      return closedTradesRef.current;
    } catch (err) {
      console.warn('Failed to load all closed trades:', err);
      return closedTradesRef.current;
    } finally {
      setIsLoadingAllTrades(false);
    }
  }, []);

  const fetchLogs = useCallback(async (customLimit?: number) => {
    if (!clientRef.current) return;
    const targetClient = clientRef.current;
    const targetId = activeBotIdRef.current;
    const limit = customLimit !== undefined ? customLimit : logLimitRef.current;
    if (customLimit !== undefined && customLimit !== logLimitRef.current) {
      setLogLimit(customLimit);
      logLimitRef.current = customLimit;
    }
    setIsLoadingLogs(true);
    try {
      const logList = await targetClient.getLogs(limit);
      if (targetId === activeBotIdRef.current && targetClient === clientRef.current && logList) setLogs(logList);
    } catch (err) {
      console.warn('fetchLogs failed:', err);
    } finally {
      if (targetId === activeBotIdRef.current && targetClient === clientRef.current) setIsLoadingLogs(false);
    }
  }, []);

  // Initial load: 进来后直接强制全量拉取一次手动同步接口(包含平仓历史与收益)
  useEffect(() => {
    if (activeProfile && lastLoadedBotIdRef.current !== activeProfile.id) {
      lastLoadedBotIdRef.current = activeProfile.id;
      refreshData(undefined, true);
    }
  }, [activeProfile, refreshData]);

  // Live Countdown ticker & Auto-refresh polling when actively connected
  useEffect(() => {
    if (!activeProfile || isSelectingBot || refreshInterval <= 0) return;

    setRefreshCountdown(refreshInterval);

    const timer = setInterval(() => {
      // 只有在标签页处于可见状态且当前不在刷新请求中时才倒计时与轮询
      if (document.visibilityState === 'visible' && !isRefreshingRef.current) {
        setRefreshCountdown((prev) => {
          if (prev <= 1) {
            refreshData();
            return refreshInterval;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeProfile, isSelectingBot, refreshData, refreshInterval, timerResetKey]);

  // Page Visibility: pause polling when tab is hidden, refresh immediately on visible
  useEffect(() => {
    if (!activeProfile || isSelectingBot) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // 快速切标签页时（3秒内刚刷新过），无需重复打接口
        if (now - lastRefreshTimeRef.current < 3000) {
          return;
        }
        if (refreshInterval > 0) {
          setRefreshCountdown(refreshInterval);
        }
        // 轻量增量刷新（forceAll = false），绝不全量扫接口
        refreshData(undefined, false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeProfile, isSelectingBot, refreshData, refreshInterval]);

  // Network recovery: automatic retry when browser reconnects to internet
  useEffect(() => {
    if (!activeProfile || isSelectingBot) return;

    const handleOnline = () => {
      console.info('[Network] Browser is back online. Auto-reconnecting bot...');
      setIsConnected(true);
      setIsConnecting(false);
      setLastError(null);
      refreshData(undefined, false);
    };

    const handleOffline = () => {
      console.warn('[Network] Browser went offline.');
      setIsConnected(false);
      setLastError('Network connection lost (offline)');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeProfile, isSelectingBot, refreshData]);

  // Fast automatic reconnection retry loop when disconnected (every 5s)
  useEffect(() => {
    if (!activeProfile || isSelectingBot || isConnected) return;

    const retryTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && (typeof navigator === 'undefined' || navigator.onLine)) {
        refreshData(undefined, false);
      }
    }, 5000);

    return () => clearInterval(retryTimer);
  }, [activeProfile, isSelectingBot, isConnected, refreshData]);

  return (
    <BotContext.Provider
      value={{
        profiles,
        activeProfile,
        activeBotId,
        isSelectingBot,
        setIsSelectingBot,
        client,
        config,
        botState,
        activeTrades,
        closedTrades,
        profitSummary,
        dailyRecords,
        signals,
        logs,
        logLimit,
        setLogLimit,
        fetchLogs,
        isLoadingLogs,
        selectedPair,
        setSelectedPair,
        isConnected,
        isConnecting,
        lastError,
        theme,
        setTheme,
        currencyUnit,
        setCurrencyUnit,
        exchangeRates,
        setCustomRate,
        fetchLiveRates,
        formatCurrency,
        hideBalances,
        toggleHideBalances,
        initialCapital,
        setInitialCapital,
        isManualCapital,
        resetInitialCapitalToAuto,
        autoInferredCapital,
        isReadOnly,
        addProfile,
        updateProfile,
        deleteProfile,
        logoutAllProfiles,
        switchBot,
        disconnectCurrent,
        refreshData,
        forceExitTrade,
        startBot,
        stopBot,
        reloadConfig,
        mobileTab,
        setMobileTab,
        refreshCountdown,
        refreshInterval,
        setRefreshInterval,
        loadAllClosedTrades,
        isLoadingAllTrades,
        importProfiles,
      }}
    >
      {children}
    </BotContext.Provider>
  );
}

export function useBot() {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error('useBot must be used within BotProvider');
  return ctx;
}
