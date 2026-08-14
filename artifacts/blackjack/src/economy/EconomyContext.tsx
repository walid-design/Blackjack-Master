import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const STARTER_CHIPS = 10_000;
export const DAILY_CHIPS = 2_000;

export interface ChipProduct {
  sku: string;
  name: string;
  chips: number;
  bonus?: number;
  price: string;
  popular?: boolean;
}

export const CHIP_PRODUCTS: ChipProduct[] = [
  { sku: 'chips_12000', name: 'Starter Stack', chips: 12_000, price: '$1.99' },
  { sku: 'chips_35000', name: 'Table Regular', chips: 35_000, bonus: 5_000, price: '$4.99', popular: true },
  { sku: 'chips_80000', name: 'High Roller', chips: 80_000, bonus: 20_000, price: '$9.99' },
  { sku: 'chips_200000', name: 'Royal Vault', chips: 200_000, bonus: 75_000, price: '$19.99' },
];

type LedgerKind = 'starter_grant' | 'daily_reward' | 'gameplay' | 'demo_purchase';

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  amount: number;
  createdAt: string;
  reference?: string;
}

interface EconomyState {
  version: 1;
  profileId: string | null;
  displayName: string;
  balance: number;
  dailyRewardDate: string | null;
  dailyStreak: number;
  lastDailyDate: string | null;
  xp: number;
  roundsPlayed: number;
  ledger: LedgerEntry[];
}

interface EconomyContextValue {
  state: EconomyState;
  hasProfile: boolean;
  dailyRewardAvailable: boolean;
  demoCheckoutEnabled: boolean;
  createProfile: (displayName: string) => void;
  claimDailyReward: () => number;
  syncGameplayBalance: (balance: number) => void;
  recordCompletedRound: () => void;
  completeDemoPurchase: (sku: string) => number;
}

const STORAGE_KEY = 'royal_ace_economy_v1';
const EMPTY_STATE: EconomyState = {
  version: 1,
  profileId: null,
  displayName: '',
  balance: 0,
  dailyRewardDate: null,
  dailyStreak: 0,
  lastDailyDate: null,
  xp: 0,
  roundsPlayed: 0,
  ledger: [],
};

const EconomyContext = createContext<EconomyContextValue | null>(null);

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return todayKey(date);
}

function makeId(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${suffix}`;
}

function readInitialState(): EconomyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EconomyState>;
      if (parsed.version === 1 && typeof parsed.balance === 'number') {
        return { ...EMPTY_STATE, ...parsed, balance: Math.max(0, Math.floor(parsed.balance)) };
      }
    }

    // One-time migration from the original prototype storage.
    const legacyName = localStorage.getItem('bj_player_name')?.trim();
    const legacyBalance = Number(localStorage.getItem('bj_bankroll'));
    if (legacyName) {
      const balance = Number.isFinite(legacyBalance) && legacyBalance >= 0
        ? Math.floor(legacyBalance)
        : STARTER_CHIPS;
      return {
        ...EMPTY_STATE,
        profileId: makeId('guest'),
        displayName: legacyName,
        balance,
        ledger: [{
          id: makeId('migration'),
          kind: 'starter_grant',
          amount: balance,
          createdAt: new Date().toISOString(),
          reference: 'legacy-browser-balance',
        }],
      };
    }
  } catch {
    // Corrupt browser data should never prevent the game from starting.
  }
  return EMPTY_STATE;
}

function appendLedger(state: EconomyState, entry: LedgerEntry): EconomyState {
  return { ...state, ledger: [...state.ledger.slice(-99), entry] };
}

export function EconomyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EconomyState>(readInitialState);
  const demoCheckoutEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_CHECKOUT === 'true';

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (state.displayName) localStorage.setItem('bj_player_name', state.displayName);
    localStorage.setItem('bj_bankroll', String(state.balance));
  }, [state]);

  const createProfile = useCallback((displayName: string) => {
    const cleanName = displayName.trim().slice(0, 32);
    if (!cleanName) return;
    setState(current => {
      if (current.profileId) return { ...current, displayName: cleanName };
      return appendLedger({
        ...current,
        profileId: makeId('guest'),
        displayName: cleanName,
        balance: STARTER_CHIPS,
      }, {
        id: makeId('starter'),
        kind: 'starter_grant',
        amount: STARTER_CHIPS,
        createdAt: new Date().toISOString(),
      });
    });
  }, []);

  const claimDailyReward = useCallback(() => {
    const today = todayKey();
    if (!state.profileId || state.dailyRewardDate === today) return 0;
    setState(current => {
      if (!current.profileId || current.dailyRewardDate === today) return current;
      const streak = current.lastDailyDate === yesterdayKey() ? current.dailyStreak + 1 : 1;
      return appendLedger({
        ...current,
        balance: current.balance + DAILY_CHIPS,
        dailyRewardDate: today,
        lastDailyDate: today,
        dailyStreak: streak,
      }, {
        id: makeId('daily'),
        kind: 'daily_reward',
        amount: DAILY_CHIPS,
        createdAt: new Date().toISOString(),
        reference: today,
      });
    });
    return DAILY_CHIPS;
  }, [state.profileId, state.dailyRewardDate]);

  const syncGameplayBalance = useCallback((balance: number) => {
    const safeBalance = Math.max(0, Math.floor(balance));
    setState(current => {
      const delta = safeBalance - current.balance;
      if (!current.profileId || delta === 0) return current;
      return appendLedger({ ...current, balance: safeBalance }, {
        id: makeId('game'),
        kind: 'gameplay',
        amount: delta,
        createdAt: new Date().toISOString(),
      });
    });
  }, []);

  const recordCompletedRound = useCallback(() => {
    setState(current => current.profileId ? {
      ...current,
      roundsPlayed: current.roundsPlayed + 1,
      xp: current.xp + 25,
    } : current);
  }, []);

  const completeDemoPurchase = useCallback((sku: string) => {
    if (!demoCheckoutEnabled) return 0;
    const product = CHIP_PRODUCTS.find(item => item.sku === sku);
    if (!product) return 0;
    const granted = product.chips + (product.bonus ?? 0);
    setState(current => {
      if (!current.profileId) return current;
      return appendLedger({ ...current, balance: current.balance + granted }, {
        id: makeId('demo-order'),
        kind: 'demo_purchase',
        amount: granted,
        createdAt: new Date().toISOString(),
        reference: product.sku,
      });
    });
    return granted;
  }, [demoCheckoutEnabled]);

  const value = useMemo<EconomyContextValue>(() => ({
    state,
    hasProfile: Boolean(state.profileId),
    dailyRewardAvailable: Boolean(state.profileId) && state.dailyRewardDate !== todayKey(),
    demoCheckoutEnabled,
    createProfile,
    claimDailyReward,
    syncGameplayBalance,
    recordCompletedRound,
    completeDemoPurchase,
  }), [state, demoCheckoutEnabled, createProfile, claimDailyReward, syncGameplayBalance, recordCompletedRound, completeDemoPurchase]);

  return <EconomyContext.Provider value={value}>{children}</EconomyContext.Provider>;
}

export function useEconomy() {
  const context = useContext(EconomyContext);
  if (!context) throw new Error('useEconomy must be used inside EconomyProvider');
  return context;
}
