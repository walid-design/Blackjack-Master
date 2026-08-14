import { useState, useEffect, useReducer, useRef, useMemo, CSSProperties, useCallback } from 'react';
import { useAnimationControls } from 'framer-motion';
import { useLocation, useParams } from 'wouter';
import {
  TABLES, TableConfig, Card, Hand, Seat,
  calculateHandValue, isBlackjack, SideBets,
} from '@/lib/blackjack';
import { gameReducer, createInitialState } from '@/lib/reducer';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { PlayingCard } from '@/components/PlayingCard';
import { Chip, ChipStack, SideBetChip, BankrollStack, ChipBurst } from '@/components/Chip';
import { createPortal } from 'react-dom';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 640);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

function useTableUiScale() {
  const getScale = () => {
    if (window.innerWidth < 1360 || window.innerHeight < 700) return 1;
    const widthProgress = Math.min(1, (window.innerWidth - 1360) / 1040);
    const heightProgress = Math.min(1, (window.innerHeight - 700) / 500);
    return 1 + Math.min(widthProgress, heightProgress) * 0.34;
  };

  const [scale, setScale] = useState(getScale);
  useEffect(() => {
    const update = () => setScale(getScale());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

// Parabolic arc — tighter x-spread on mobile to prevent crowding
function getSeatPositions(n: number, mobile = false): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const xMin = mobile ? 12 : 8;
    const xRange = mobile ? 76 : 84;
    const x = xMin + t * xRange;
    const tNorm = (t - 0.5) * 2;
    const yBase = mobile ? 77 : 79;
    const yCurve = mobile ? 6 : 9;
    const y = yBase - yCurve * tNorm * tNorm;
    return { x, y };
  });
}

const CHIP_AMOUNTS = [1, 5, 25, 100, 500];

const SIDE_BET_LABELS: Record<string, string> = {
  perfectPairs:       'Pairs',
  twentyOnePlusThree: '21+3',
  luckyLadies:        'Lucky Q',
  superSevens:        '7s',
  luckyLucky:         'Lucky',
  royalMatch:         'Royal',
  bustIt:             'Bust',
};

const SIDE_BET_PAYOUTS: Record<string, { label: string; color: string; rows: [string, string][] }> = {
  perfectPairs:       { label: 'Perfect Pairs',  color: '#f0b830', rows: [['Perfect Pair (same suit)','30:1'],['Colored Pair (same color)','10:1'],['Mixed Pair','5:1']] },
  twentyOnePlusThree: { label: '21+3',            color: '#60d0ff', rows: [['Suited Trips','100:1'],['Straight Flush','40:1'],['Three of a Kind','30:1'],['Straight','10:1'],['Flush','5:1']] },
  luckyLadies:        { label: 'Lucky Ladies',    color: '#ff88cc', rows: [['Q♥ Pair + Dealer BJ','1000:1'],['Queen of Hearts Pair','250:1'],['Suited 20','10:1'],['Unsuited 20','4:1']] },
  superSevens:        { label: 'Super Sevens',    color: '#ff6030', rows: [['3 Suited 7s','5000:1'],['3 Unsuited 7s','500:1'],['2 Suited 7s','100:1'],['2 Unsuited 7s','50:1'],['One 7','3:1']] },
  luckyLucky:         { label: 'Lucky Lucky',     color: '#80ff80', rows: [['Suited 7-7-7','200:1'],['Suited Blackjack','100:1'],['7-7-7','30:1'],['Blackjack','15:1'],['Any 21','2:1']] },
  royalMatch:         { label: 'Royal Match',     color: '#c080ff', rows: [['Royal Match (K+Q suited)','25:1'],['Suited Pair','5:1']] },
  bustIt:             { label: 'Bust It',          color: '#ff5050', rows: [['8+ card bust','200:1'],['7-card bust','100:1'],['6-card bust','18:1'],['5-card bust','8:1'],['4-card bust','2:1'],['3-card bust','1:1']] },
};

interface TableTheme {
  felt: string;
  surround: string;
  header: string;
  history: string;
  rail: string;
  railEdge: string;
  accent: string;
  accentSoft: string;
  glow: string;
}

// Each room has its own material palette, like a real casino floor. The felt
// uses layered gradients so the colour still has depth instead of looking flat.
const TABLE_THEMES: Record<string, TableTheme> = {
  classic: {
    felt: 'radial-gradient(ellipse 105% 82% at 50% 12%, rgba(53,169,103,0.34) 0%, transparent 42%), radial-gradient(ellipse 100% 80% at 50% 15%, #20844a 0%, #15633a 35%, #0d4a28 62%, #051f10 100%)',
    surround: '#0b1019', header: 'rgba(12,16,29,0.98)', history: 'rgba(8,13,24,0.90)',
    rail: '#35180b', railEdge: '#180903', accent: '#efbd4d', accentSoft: 'rgba(239,189,77,0.15)', glow: 'rgba(39,185,102,0.18)',
  },
  'high-roller': {
    felt: 'radial-gradient(ellipse 105% 82% at 50% 12%, rgba(92,157,196,0.28) 0%, transparent 43%), radial-gradient(ellipse 100% 80% at 50% 15%, #28536e 0%, #193c54 35%, #102b40 62%, #071824 100%)',
    surround: '#080d14', header: 'rgba(7,13,22,0.98)', history: 'rgba(6,12,20,0.92)',
    rail: '#241811', railEdge: '#0d0805', accent: '#f1ca72', accentSoft: 'rgba(241,202,114,0.16)', glow: 'rgba(83,165,211,0.20)',
  },
  vip: {
    felt: 'radial-gradient(ellipse 105% 82% at 50% 12%, rgba(211,76,96,0.30) 0%, transparent 43%), radial-gradient(ellipse 100% 80% at 50% 15%, #8b2c3d 0%, #671c2c 35%, #45111e 63%, #260810 100%)',
    surround: '#14080b', header: 'rgba(23,8,13,0.98)', history: 'rgba(18,7,11,0.92)',
    rail: '#411711', railEdge: '#190604', accent: '#f3d18b', accentSoft: 'rgba(243,209,139,0.17)', glow: 'rgba(214,68,91,0.22)',
  },
  downtown: {
    felt: 'radial-gradient(ellipse 105% 82% at 50% 12%, rgba(62,184,170,0.29) 0%, transparent 43%), radial-gradient(ellipse 100% 80% at 50% 15%, #1a7b72 0%, #105b56 35%, #093f3b 63%, #042522 100%)',
    surround: '#071210', header: 'rgba(7,19,18,0.98)', history: 'rgba(5,16,15,0.92)',
    rail: '#3b2615', railEdge: '#1a0f07', accent: '#e7a55f', accentSoft: 'rgba(231,165,95,0.16)', glow: 'rgba(54,192,174,0.20)',
  },
  speed: {
    felt: 'radial-gradient(ellipse 105% 82% at 50% 12%, rgba(86,153,239,0.32) 0%, transparent 43%), radial-gradient(ellipse 100% 80% at 50% 15%, #2863b2 0%, #19498b 35%, #0f3063 63%, #071a37 100%)',
    surround: '#070d19', header: 'rgba(7,13,26,0.98)', history: 'rgba(5,11,23,0.92)',
    rail: '#202429', railEdge: '#090b0e', accent: '#65d8ff', accentSoft: 'rgba(101,216,255,0.16)', glow: 'rgba(75,145,245,0.23)',
  },
  'vegas-strip': {
    felt: 'radial-gradient(ellipse 105% 82% at 50% 12%, rgba(176,104,225,0.30) 0%, transparent 43%), radial-gradient(ellipse 100% 80% at 50% 15%, #704198 0%, #502971 35%, #35164f 63%, #1d092e 100%)',
    surround: '#100817', header: 'rgba(17,8,25,0.98)', history: 'rgba(14,6,22,0.92)',
    rail: '#241522', railEdge: '#0c070c', accent: '#f0c65d', accentSoft: 'rgba(240,198,93,0.17)', glow: 'rgba(168,85,225,0.22)',
  },
};

interface DealerHistoryEntry { total: number; bust: boolean; bj: boolean }

export default function Table() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const tableUiScale = useTableUiScale();
  const tableConfig = TABLES.find(t => t.id === id);

  const [playerName, setPlayerName] = useState('Player');
  useEffect(() => {
    const n = localStorage.getItem('bj_player_name');
    if (n) setPlayerName(n);
  }, []);

  const initBankroll = useMemo(() => {
    const s = localStorage.getItem('bj_bankroll');
    return s ? parseInt(s, 10) : 1000;
  }, []);

  const [state, dispatch] = useReducer(
    gameReducer as any,
    null,
    () => createInitialState(tableConfig!, initBankroll),
  );

  useEffect(() => {
    localStorage.setItem('bj_bankroll', state.bankroll.toString());
  }, [state.bankroll]);

  // Ref for the game-area container — used by child components to compute accurate
  // card-deal trajectories (shoe pixel position → seat pixel position).
  const gameAreaRef = useRef<HTMLDivElement>(null);

  // Lifted chip selection – needed by ControlBar (display) and SeatSpot (bet placement)
  const [selectedChip, setSelectedChip] = useState(25);
  const [showPayouts, setShowPayouts] = useState(false);
  const [collectingCards, setCollectingCards] = useState(false);
  const dealClickLockedRef = useRef(false);

  // The lock is synchronous (a ref), so even two clicks inside one browser
  // frame cannot enqueue two deals. It resets only when a new betting round opens.
  useEffect(() => {
    if (state.phase === 'BETTING') dealClickLockedRef.current = false;
  }, [state.phase]);

  // Track previous bankroll for delta animation
  const prevBankrollRef = useRef(state.bankroll);
  useEffect(() => { prevBankrollRef.current = state.bankroll; }, [state.bankroll]);

  // Dealer history: last 15 rounds' dealer outcome
  const [dealerHistory, setDealerHistory] = useState<DealerHistoryEntry[]>([]);
  const historyRecordedRef = useRef(false);
  useEffect(() => {
    if (state.phase === 'SETTLEMENT' && (state as any).settled && !historyRecordedRef.current && state.dealerCards.length > 0) {
      historyRecordedRef.current = true;
      const val = calculateHandValue(state.dealerCards);
      setDealerHistory(prev => [
        ...prev.slice(-14),
        { total: val.total, bust: val.total > 21, bj: state.dealerStatus === 'blackjack' },
      ]);
    }
    if (state.phase !== 'SETTLEMENT' || !(state as any).settled) historyRecordedRef.current = false;
  }, [state.phase, state.dealerCards, state.dealerStatus, (state as any).settled]);

  // DEALING: right-to-left. Every timed action is tagged with this deal's
  // sequence number, and cleanup cancels the old loop if the phase changes.
  const dealingRef = useRef(false);
  useEffect(() => {
    if (state.phase !== 'DEALING') {
      dealingRef.current = false;
      return undefined;
    }
    if (dealingRef.current) return undefined;

    dealingRef.current = true;
    let cancelled = false;
    const dealSequence = state.dealSequence;
    const activeSeats = (state.seats as Seat[])
      .filter(s => s.isActive && s.hands.length > 0)
      .slice()
      .reverse();

    (async () => {
      for (const seat of activeSeats) {
        if (cancelled) return;
        dispatch({ type: 'CARD_DEALT', to: 'player', seatId: seat.id, dealSequence });
        await sleep(720);
      }
      if (cancelled) return;
      dispatch({ type: 'CARD_DEALT', to: 'dealer', dealSequence });
      await sleep(720);
      for (const seat of activeSeats) {
        if (cancelled) return;
        dispatch({ type: 'CARD_DEALT', to: 'player', seatId: seat.id, dealSequence });
        await sleep(720);
      }
      if (cancelled) return;
      dispatch({ type: 'CARD_DEALT', to: 'dealer', dealSequence });
      await sleep(950);
      if (!cancelled) dispatch({ type: 'CHECK_DEALER_BJ', dealSequence });
    })();

    return () => {
      cancelled = true;
      dealingRef.current = false;
    };
  }, [state.phase, state.dealSequence]);

  // Deal one card to the active split hand; the next hand waits its turn.
  const splitDealingRef = useRef(false);
  useEffect(() => {
    if (state.phase !== 'SPLIT_DEALING') { splitDealingRef.current = false; return; }
    if (splitDealingRef.current) return;
    splitDealingRef.current = true;
    const timer = setTimeout(() => dispatch({ type: 'SPLIT_CARD' }), 720);
    return () => clearTimeout(timer);
  }, [state.phase, (state as any).splitCardTarget]);

  useEffect(() => {
    if (state.phase !== 'SHUFFLING') return;
    const delay = state.shuffleStage === 'collecting'
      ? 900
      : state.shuffleStage === 'shuffling'
        ? 1500
        : 1050;
    const type = state.shuffleStage === 'burning' ? 'SHUFFLE_COMPLETE' : 'RESHUFFLE';
    const timer = setTimeout(() => dispatch({ type }), delay);
    return () => clearTimeout(timer);
  }, [state.phase, state.shuffleStage]);

  // Dealer draws one card at a time. The pause starts only after any
  // turn-ending player card has landed and the dealer phase actually begins.
  useEffect(() => {
    if (state.phase !== 'DEALER_TURN') return;
    const isInitialTurn = state.dealerCards.length <= 2;
    const t = setTimeout(
      () => dispatch({ type: 'DEALER_PLAY' }),
      isInitialTurn ? 1350 : 1200,
    );
    return () => clearTimeout(t);
  }, [state.phase, state.dealerCards.length]);

  // Sweep the cards to the discard tray, then open the next round.
  useEffect(() => {
    if (!(state as any).settled) { setCollectingCards(false); return; }
    const collectTimer = setTimeout(() => setCollectingCards(true), 2400);
    const roundTimer = setTimeout(() => dispatch({ type: 'NEXT_ROUND' }), 3900);
    return () => { clearTimeout(collectTimer); clearTimeout(roundTimer); };
  }, [(state as any).settled]);

  // Settlement waits until the final dealer card's global flight has landed.
  useEffect(() => {
    if (state.phase === 'SETTLEMENT' && !(state as any).settled) {
      const t = setTimeout(() => dispatch({ type: 'PERFORM_SETTLEMENT' }), 1050);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state.phase, (state as any).settled]);

  if (!tableConfig) { setLocation('/'); return null; }

  const theme = TABLE_THEMES[tableConfig.id] ?? TABLE_THEMES.classic;
  const seatPositions = getSeatPositions(tableConfig.seats, isMobile);
  const shoeTotal     = tableConfig.decks * 52;
  const shoePct       = Math.round((state.shoe.length / shoeTotal) * 100);

  const canDeal = (state.seats as Seat[]).some(s => s.isActive && (s.hands[0]?.bet ?? 0) >= tableConfig.minBet);
  const anyActive = (state.seats as Seat[]).some(s => s.isActive);
  const handleDeal = () => {
    if (dealClickLockedRef.current || state.phase !== 'BETTING' || !canDeal) return;
    dealClickLockedRef.current = true;
    dispatch({ type: 'DEAL' });
  };

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: theme.surround, overflow: 'hidden',
      userSelect: 'none', fontFamily: "'Playfair Display', serif", color: '#f0e6c8',
      ['--table-ui-scale' as string]: tableUiScale,
    }}>

      {/* ── HEADER ── */}
      <header style={{
        height: 46, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
        background: theme.header,
        borderBottom: `1px solid ${theme.accentSoft}`,
        boxShadow: `0 8px 28px ${theme.glow}`,
        zIndex: 30,
      }}>
        <button
          data-testid="button-leave"
          onClick={() => setLocation('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            color: 'rgba(240,230,200,0.45)', fontSize: 10,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            fontWeight: 700, fontFamily: 'sans-serif',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <ChevronLeft size={14} /> Leave
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.22em', color: theme.accent }}>
            {tableConfig.name.toUpperCase()}
          </div>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,230,200,0.28)', fontFamily: 'sans-serif', marginTop: 1 }}>
            {tableConfig.decks} Deck{tableConfig.decks > 1 ? 's' : ''} · ${tableConfig.minBet}–${tableConfig.maxBet}
          </div>
        </div>

        {/* Shoe gauge + % */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', fontFamily: 'sans-serif', letterSpacing: '0.1em' }}>Shoe</div>
          <div style={{ width: 50, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${Math.max(4, shoePct)}%` }}
              transition={{ duration: 0.5 }}
              style={{ height: '100%', background: shoePct < 25 ? '#e04040' : theme.accent, borderRadius: 3 }}
            />
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'sans-serif', minWidth: 32 }}>
            {shoePct}%
          </div>
        </div>
      </header>

      {/* ── DEALER HISTORY STRIP ── always rendered so it never causes a layout shift */}
      <div style={{
        height: 28, flexShrink: 0,
        background: theme.history,
        borderBottom: `1px solid ${theme.accentSoft}`,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 6,
        zIndex: 29,
        overflow: 'hidden',
      }}>
        <div style={{ fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontFamily: 'sans-serif', marginRight: 4, whiteSpace: 'nowrap' }}>
          Dealer History
        </div>
        {dealerHistory.length === 0
          ? <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.12)', fontFamily: 'sans-serif', fontStyle: 'italic' }}>—</div>
          : dealerHistory.map((h, i) => (
            <div key={i} style={{
              width: 28, height: 18,
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, fontFamily: 'sans-serif',
              background: h.bj
                ? 'rgba(212,168,32,0.3)'
                : h.bust
                ? 'rgba(180,30,30,0.35)'
                : 'rgba(255,255,255,0.08)',
              border: `1px solid ${h.bj ? 'rgba(212,168,32,0.5)' : h.bust ? 'rgba(220,50,50,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: h.bj ? '#f0b830' : h.bust ? '#e05050' : 'rgba(255,255,255,0.6)',
            }}>
              {h.bj ? 'BJ' : h.bust ? 'B' : h.total}
            </div>
          ))
        }
      </div>

      {/* ── GAME AREA (felt table) ── */}
      <div ref={gameAreaRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: theme.surround }}>

        {/* FELT */}
        <div style={{
          position: 'absolute',
          top: 0, left: '-3%', right: '-3%', bottom: '1%',
          background: theme.felt,
          borderRadius: '0 0 50% 50% / 0 0 18% 18%',
          borderBottom: `22px solid ${theme.rail}`,
          borderLeft: `8px solid ${theme.railEdge}`,
          borderRight: `8px solid ${theme.railEdge}`,
          boxShadow: `inset 0 0 110px rgba(0,0,0,0.52), inset 0 -12px 24px rgba(0,0,0,0.22), 0 12px 50px rgba(0,0,0,0.9), 0 0 42px ${theme.glow}`,
          zIndex: 1,
        }}>

          {/* Felt rules watermark */}
          <div style={{
            position: 'absolute', top: '31%', left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2,
          }}>
            <div style={{ fontStyle: 'italic', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.075)', fontSize: 'clamp(13px,1.8vw,21px)', textTransform: 'uppercase' }}>
              Blackjack Pays {tableConfig.rules.blackjackPayout === 1.5 ? '3 to 2' : `${tableConfig.rules.blackjackPayout} to 1`}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.05)', fontSize: 'clamp(8px,1vw,12px)', letterSpacing: '0.14em', marginTop: 4, fontFamily: 'sans-serif', textTransform: 'uppercase' }}>
              {tableConfig.rules.dealerHitsSoft17
                ? 'Dealer Draws to 16 and Hits Soft 17'
                : 'Dealer Must Draw to 16 and Stand on All 17s'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.045)', fontSize: 'clamp(7px,0.85vw,11px)', letterSpacing: '0.12em', marginTop: 3, fontFamily: 'sans-serif', fontStyle: 'italic', textTransform: 'uppercase' }}>
              Insurance Pays 2 to 1
            </div>
          </div>

          {/* Dealer zone */}
          <DealerZone state={state} collectingCards={collectingCards} />

          {/* Card shoe */}
          <CardShoe
            shoe={state.shoe}
            decks={tableConfig.decks}
            cutCardIndex={state.cutCardIndex}
            needsShuffle={state.needsShuffle}
            shoeNumber={state.shoeNumber}
            isMobile={isMobile}
          />

          {/* Used cards accumulate here between shuffles */}
          <DiscardTray discard={state.discard} decks={tableConfig.decks} isMobile={isMobile} />

          <AnimatePresence>
            {state.phase === 'SHUFFLING' && (
              <ShuffleCeremony stage={state.shuffleStage} shoeNumber={state.shoeNumber + (state.shuffleStage === 'burning' ? 0 : 1)} />
            )}
          </AnimatePresence>

          {!state.cardIntegrity.valid && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              zIndex: 70, padding: '7px 12px', borderRadius: 6,
              background: 'rgba(110,8,16,0.95)', border: '1px solid rgba(255,110,120,0.7)',
              color: '#ffe4e6', fontSize: 10, fontFamily: 'sans-serif', fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Shoe integrity paused · {state.cardIntegrity.total}/{state.cardIntegrity.expected} cards
            </div>
          )}

          {/* Seats — arc point is the CENTRE of the bet circle; SeatSpot anchors to it */}
          {seatPositions.map(({ x, y }, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${x}%`, top: `${y}%`,
              /* NO transform here — SeatSpot positions its own elements around (0,0) */
              zIndex: state.activeSeatIndex === i ? 20 : 10,
            }}>
              <SeatSpot
                seat={state.seats[i]}
                state={state}
                dispatch={dispatch}
                seatIndex={i}
                config={tableConfig}
                selectedChip={selectedChip}
                seatXPct={x}
                seatYPct={y}
                isMobile={isMobile}
                collectingCards={collectingCards}
              />
            </div>
          ))}

          <CardCollectionAnimation
            state={state}
            seatPositions={seatPositions}
            active={collectingCards}
          />

          {/* oval rings removed — they doubled up with the SIT dashed circles */}

          {/* (i) Side bet payout info button — only when table has non-insurance side bets */}
          {tableConfig.sideBets.filter(s => s !== 'insurance').length > 0 && (
            <motion.button
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
              onClick={() => setShowPayouts(p => !p)}
              style={{
                position: 'absolute',
                top: '16%', left: '7%',
                width: 26, height: 26, borderRadius: '50%',
                background: showPayouts ? 'rgba(212,168,32,0.25)' : 'rgba(0,0,0,0.45)',
                border: `1.5px solid ${showPayouts ? 'rgba(212,168,32,0.7)' : 'rgba(255,255,255,0.22)'}`,
                color: showPayouts ? '#f0b830' : 'rgba(255,255,255,0.45)',
                fontSize: 12, fontWeight: 700, fontFamily: 'sans-serif',
                cursor: 'pointer', zIndex: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >ⓘ</motion.button>
          )}

        </div>
      </div>

      {/* ── FELT BETTING UI — at game-area level so left:50% = true center ── */}
      {/* Outer div handles CSS centering; inner motion.div handles fade/slide only */}
      {/* (Framer Motion owns the `transform` property — mixing CSS transform + y animation breaks centering) */}
      <AnimatePresence>
        {state.phase === 'BETTING' && anyActive && (
          <div
            key="felt-bet-anchor"
            style={{
              position: 'absolute',
              top: '36%',
              left: '50%',
              transform: 'translateX(-50%) scale(var(--table-ui-scale, 1))',
              transformOrigin: 'top center',
              zIndex: 40,
              pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10, pointerEvents: 'none' }}
              transition={{ duration: 0.25 }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 14, pointerEvents: 'all',
              }}
            >
              {/* ── Curved chip row ── */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? 4 : 8 }}>
                {CHIP_AMOUNTS.map((amount, ci) => {
                  const mid = (CHIP_AMOUNTS.length - 1) / 2;
                  const dist = Math.abs(ci - mid);
                  const arcDip = dist * dist * 5;
                  const sz = isMobile ? 42 : 52;
                  return (
                    <motion.div
                      key={amount}
                      data-testid={`chip-felt-${amount}`}
                      style={{ marginBottom: arcDip, cursor: 'pointer', position: 'relative' }}
                      whileHover={{ scale: 1.18, y: -6 }}
                      whileTap={{ scale: 0.88 }}
                      onClick={() => setSelectedChip(amount)}
                    >
                      {/* Selection ring — glows when this denomination is armed */}
                      {selectedChip === amount && (
                        <motion.div
                          layoutId="chip-selection-ring"
                          style={{
                            position: 'absolute',
                            inset: -5,
                            borderRadius: '50%',
                            border: '2px solid rgba(240,184,48,0.9)',
                            boxShadow: '0 0 10px rgba(240,184,48,0.55), inset 0 0 6px rgba(240,184,48,0.15)',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                      <Chip amount={amount} size={sz} />
                    </motion.div>
                  );
                })}
              </div>

              {/* ── Circular action buttons ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {state.lastBets && Object.keys(state.lastBets.main).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <motion.button
                      data-testid="button-repeat-bet"
                      whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }}
                      onClick={() => dispatch({ type: 'REPEAT_BET' })}
                      style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: 'rgba(240,184,48,0.12)',
                        border: '1.5px solid rgba(240,184,48,0.45)',
                        color: '#f0b830', fontSize: 18, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                      }}
                    >↻</motion.button>
                    <span style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,184,48,0.55)', fontFamily: 'sans-serif' }}>Repeat</span>
                  </div>
                )}

                {canDeal && (
                  <motion.button
                    data-testid="button-deal"
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={handleDeal}
                    style={{
                      padding: '9px 32px', fontSize: 11, fontWeight: 800,
                      letterSpacing: '0.24em', textTransform: 'uppercase',
                      fontFamily: 'sans-serif',
                      background: 'linear-gradient(135deg,#b8820a,#e8b830 45%,#fde068 70%,#c89a18)',
                      border: 'none', borderRadius: 24, color: '#000', cursor: 'pointer',
                      boxShadow: '0 3px 20px rgba(212,168,32,0.55), 0 1px 4px rgba(0,0,0,0.5)',
                    }}
                  >Deal</motion.button>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <motion.button
                    data-testid="button-clear-bets"
                    whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }}
                    onClick={() => dispatch({ type: 'CLEAR_BETS' })}
                    style={{
                      width: 42, height: 42, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1.5px solid rgba(255,255,255,0.2)',
                      color: 'rgba(255,255,255,0.55)', fontSize: 16, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                    }}
                  >✕</motion.button>
                  <span style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', fontFamily: 'sans-serif' }}>Clear</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── SIDE BET PAYOUT PANEL — slides in from left when (i) is tapped ── */}
      <AnimatePresence>
        {showPayouts && (
          <motion.div
            key="payout-panel"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
            style={{
              position: 'absolute',
              top: '26%', left: 12,
              zIndex: 50,
              background: 'rgba(8,12,26,0.94)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(212,168,32,0.28)',
              borderRadius: 10,
              padding: '12px 14px',
              minWidth: 200,
              maxWidth: 240,
              transformOrigin: 'top left',
              boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.7)', fontFamily: 'sans-serif', fontWeight: 700, marginBottom: 10 }}>
              Side Bet Payouts
            </div>
            {tableConfig.sideBets.filter(s => s !== 'insurance').map(sb => {
              const info = SIDE_BET_PAYOUTS[sb];
              if (!info) return null;
              return (
                <div key={sb} style={{ marginBottom: 10 }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    fontFamily: 'sans-serif', marginBottom: 4,
                    color: info.color,
                  }}>{info.label}</div>
                  {info.rows.map(([hand, pays]) => (
                    <div key={hand} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 9, fontFamily: 'sans-serif', padding: '2px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{hand}</span>
                      <span style={{ color: info.color, fontWeight: 700, marginLeft: 8 }}>{pays}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'sans-serif', marginTop: 6, fontStyle: 'italic' }}>
              Insurance pays 2:1
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PLAYER ACTION STRIP (mobile only — during PLAYER_TURN) ── */}
      {isMobile && (
        <PlayerActionStrip state={state} dispatch={dispatch} />
      )}

      {/* ── SIDE BET BOTTOM SHEET (mobile only — during BETTING) ── */}
      {isMobile && (
        <SideBetSheet
          state={state}
          dispatch={dispatch}
          config={tableConfig}
          selectedChip={selectedChip}
        />
      )}

      {/* ── CONTROL BAR ── */}
      <ControlBar
        state={state}
        dispatch={dispatch}
        playerName={playerName}
        config={tableConfig}
        selectedChip={selectedChip}
        setSelectedChip={setSelectedChip}
        canDeal={canDeal}
        onDeal={handleDeal}
        anyActive={anyActive}
        isMobile={isMobile}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Flip Card — animates the dealer hole-card reveal with a proper rotateY 3-D flip.
// When faceDown changes true → false the card rotates 90° away (edge-on), swaps its
// face content, then rotates the remaining 90° back.  A perspective wrapper gives the
// depth illusion.  All other card state changes are instant (no re-animation).
// ─────────────────────────────────────────────────────────────────────────────
function FlipCard({ card, faceDown }: { card: Card; faceDown: boolean }) {
  const controls = useAnimationControls();
  const [showBack, setShowBack] = useState(faceDown);
  const prevRef   = useRef(faceDown);

  useEffect(() => {
    const wasDown = prevRef.current;
    prevRef.current = faceDown;
    if (!faceDown && wasDown) {
      // Rotate away (0 → -90°), swap face, then rotate back (-90° → 0) from the front
      (async () => {
        await controls.start({ rotateY: -90, transition: { duration: 0.36, ease: 'easeIn' } });
        setShowBack(false);
        controls.set({ rotateY: 90 });
        await sleep(90);
        await controls.start({ rotateY: 0, transition: { duration: 0.44, ease: 'easeOut' } });
      })();
    } else if (faceDown) {
      setShowBack(true);
      controls.set({ rotateY: 0 });
    }
  }, [faceDown]);

  return (
    // Perspective wrapper is needed on the PARENT for the 3-D depth effect
    <div style={{ perspective: 500, display: 'inline-flex' }}>
      <motion.div animate={controls} style={{ transformOrigin: 'center', display: 'inline-flex' }}>
        <PlayingCard card={card} faceDown={showBack} />
      </motion.div>
    </div>
  );
}

function GlobalCardFlight({ card, targetRef, faceDown = false, onLanded }: {
  card: Card;
  targetRef: React.RefObject<HTMLDivElement | null>;
  faceDown?: boolean;
  onLanded: () => void;
}) {
  const [path, setPath] = useState<null | {
    d: string;
    endScale: number;
  }>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const onLandedRef = useRef(onLanded);

  useEffect(() => {
    const shoe = document.getElementById('card-shoe-mouth');
    const target = targetRef.current;
    if (!shoe || !target) {
      onLanded();
      return;
    }

    const start = shoe.getBoundingClientRect();
    const end = target.getBoundingClientRect();
    const sx = start.left + start.width * 0.35;
    const sy = start.top + start.height * 0.5;
    const ex = end.left + end.width * 0.5;
    const ey = end.top + end.height * 0.5;
    const dx = ex - sx;
    const dy = ey - sy;
    // A single cubic Bézier creates continuous curvature from the first pixel.
    // Its initial tangent already points toward the hand—there is no pull-out
    // line or intermediate straight keyframe.
    const c1x = sx + dx * 0.24;
    const c1y = sy + Math.max(10, dy * 0.08);
    const c2x = ex - dx * 0.20;
    const c2y = ey - Math.max(28, Math.abs(dy) * 0.26);
    setPath({
      d: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`,
      endScale: Math.max(0.75, end.width / 68),
    });
  }, []);

  useEffect(() => {
    const element = flightRef.current;
    if (!element || !path) return;
    const animation = element.animate(
      [
        { offsetDistance: '0%', opacity: 0, transform: 'rotate(6deg) scale(0.72)' },
        { offsetDistance: '12%', opacity: 1, transform: 'rotate(3deg) scale(0.84)', offset: 0.12 },
        { offsetDistance: '76%', opacity: 1, transform: `rotate(-1deg) scale(${path.endScale * 1.015})`, offset: 0.76 },
        { offsetDistance: '100%', opacity: 1, transform: `rotate(0deg) scale(${path.endScale})` },
      ] as Keyframe[],
      { duration: 860, easing: 'cubic-bezier(0.18, 0.72, 0.16, 1)', fill: 'forwards' },
    );
    animation.onfinish = () => onLandedRef.current();
    return () => animation.cancel();
  }, [path]);

  if (!path) return null;

  return createPortal(
    <div
      ref={flightRef}
      style={{
        position: 'fixed', left: 0, top: 0, width: 68, height: 96,
        zIndex: 9999, pointerEvents: 'none', transformOrigin: 'center',
        filter: 'drop-shadow(0 12px 10px rgba(0,0,0,0.38))',
        offsetPath: `path('${path.d}')`,
        offsetDistance: '0%',
        offsetAnchor: 'center',
        offsetRotate: '0deg',
      } as CSSProperties}
    >
      <PlayingCard card={card} faceDown={faceDown} />
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dealer Zone
// ─────────────────────────────────────────────────────────────────────────────

// Recessed casino-style dealer float tray.
function DealerChipRack() {
  const cols = [
    { face: '#f0eee8', edge: '#aaa89f', mark: '#c8c5bc' },
    { face: '#c9202d', edge: '#6f0d17', mark: '#f6d8d8' },
    { face: '#16884a', edge: '#07502a', mark: '#e4d5a6' },
    { face: '#202b9d', edge: '#0b1052', mark: '#eee2b6' },
    { face: '#6e258e', edge: '#351044', mark: '#e9d9ee' },
    { face: '#24252a', edge: '#08090b', mark: '#d7b451' },
    { face: '#a15a18', edge: '#542b08', mark: '#f2dfb0' },
    { face: '#16884a', edge: '#07502a', mark: '#e4d5a6' },
    { face: '#c9202d', edge: '#6f0d17', mark: '#f6d8d8' },
    { face: '#f0eee8', edge: '#aaa89f', mark: '#c8c5bc' },
  ];
  const heights = [7, 9, 8, 6, 7, 9, 5, 8, 7, 9];
  return (
    <div style={{
      position: 'relative', width: 342, height: 50,
      padding: '7px 10px 8px',
      display: 'flex', gap: 4, alignItems: 'stretch',
      borderRadius: '4px 4px 8px 8px',
      background: 'linear-gradient(180deg, #8e6538 0%, #432a16 12%, #171514 20%, #0b0c0d 74%, #3b2413 82%, #130c08 100%)',
      border: '1px solid rgba(226,190,124,0.54)', borderBottom: '4px solid #120a05',
      boxShadow: '0 9px 18px rgba(0,0,0,0.72), 0 2px 3px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,225,170,0.42), inset 0 -3px 7px rgba(0,0,0,0.8)',
    }}>
      <div style={{
        position: 'absolute', inset: '4px 7px auto', height: 2, borderRadius: 2,
        background: 'linear-gradient(90deg, transparent, rgba(255,225,165,0.58), transparent)', opacity: 0.7,
      }} />
      {cols.map((col, ci) => (
        <div key={ci} style={{
          position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden',
          borderRadius: '4px 4px 8px 8px',
          background: 'linear-gradient(90deg, #050607, #151618 48%, #050607)',
          border: '1px solid rgba(255,255,255,0.075)',
          boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.95), inset 1px 0 0 rgba(255,255,255,0.04)',
        }}>
          <div style={{ position: 'absolute', left: 3, right: 3, bottom: 2, height: heights[ci] * 3.7 + 3 }}>
            {Array.from({ length: heights[ci] }).map((_, ri) => (
              <div key={ri} style={{
                position: 'absolute', left: 0, right: 0, bottom: ri * 3.7,
                height: 7, borderRadius: '50%',
                background: `linear-gradient(90deg, ${col.edge} 0%, ${col.face} 18%, ${col.face} 82%, ${col.edge} 100%)`,
                border: `1px solid ${col.edge}`,
                boxShadow: '0 1px 1px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.35)',
              }}>
                <div style={{
                  position: 'absolute', left: '16%', right: '16%', top: 1, height: 1, borderRadius: 1,
                  background: `repeating-linear-gradient(90deg, ${col.mark} 0 4px, transparent 4px 8px)`, opacity: 0.9,
                }} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{
        position: 'absolute', left: '50%', bottom: -7, transform: 'translateX(-50%)',
        width: 64, height: 8, borderRadius: '0 0 7px 7px',
        background: 'linear-gradient(180deg,#27160c,#0b0603)',
        border: '1px solid rgba(205,161,90,0.18)', borderTop: 0,
      }} />
    </div>
  );
}

function DealerCardAnim({ card, index, faceDown }: {
  card: Card;
  index: number;
  faceDown: boolean;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(false);
  const landingX = useRef(index * 29 - 15).current;

  return (
    <div ref={targetRef} style={{ position: 'absolute', top: 0, left: landingX, width: 68, height: 96 }}>
      <div style={{ opacity: landed ? 1 : 0 }}>
        {index === 1
          ? <FlipCard card={card} faceDown={faceDown} />
          : <PlayingCard card={card} />}
      </div>
      {!landed && (
        <GlobalCardFlight card={card} targetRef={targetRef} faceDown={faceDown} onLanded={() => setLanded(true)} />
      )}
    </div>
  );
}

function DealerZone({ state, collectingCards = false }: { state: any; collectingCards?: boolean }) {
  const dealerCards: Card[] = state.dealerCards || [];
  const revealed = ['DEALER_TURN', 'SETTLEMENT'].includes(state.phase) || state.dealerStatus === 'blackjack';

  // Delay the score/bust badge until all staggered card animations have landed.
  // IMPORTANT: we must explicitly reset badgeReady=false at the start of the SETTLEMENT
  // branch, because the DEALER_TURN branch sets it to true with no cleanup — if we don't
  // reset it, it stays true when DEALER_PLAY fires and the bust/total badge appears while
  // extra dealer cards are still mid-flight from the shoe.
  const [badgeReady, setBadgeReady] = useState(false);
  useEffect(() => {
    if (!revealed || dealerCards.length === 0) { setBadgeReady(false); return; }
    if (state.phase !== 'SETTLEMENT') {
      // Do not expose a running result while the dealer is still drawing.
      setBadgeReady(false);
      return;
    }
    // Reveal the final total only after the last global card flight has landed.
    setBadgeReady(false);
    const t = setTimeout(() => setBadgeReady(true), 900);
    return () => { clearTimeout(t); setBadgeReady(false); };
  }, [state.phase, dealerCards.length, revealed]);

  const val = badgeReady && dealerCards.length > 0 ? calculateHandValue(dealerCards) : null;

  // Compute shoe → dealer offset for the entry animation.
  // Dealer is centred at left:50% of felt.  Shoe is at right:3% of felt (≈left:97%).
  // Felt is 106% wide relative to the game-area container.
  // shoeX in container ≈ containerW * (0.97 * 1.06 − 0.03) ≈ containerW * 1.0
  // dealerX in container ≈ containerW * 0.50
  // → offset ≈ containerW * 0.50  (card starts ~50% of container width to the right)
  return (
    <div style={{
      position: 'absolute', top: '1%', left: '50%', transform: 'translateX(-50%) scale(var(--table-ui-scale, 1))',
      transformOrigin: 'top center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      zIndex: 5,
    }}>
      {/* Chip rack */}
      <DealerChipRack />
      <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', fontFamily: 'sans-serif' }}>
        Dealer
      </div>
      <div style={{ position: 'relative', minWidth: 80, height: 96, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', opacity: collectingCards ? 0 : 1, transition: 'opacity 180ms ease' }}>
        <AnimatePresence>
          {dealerCards.map((card, i) => (
            <DealerCardAnim
              key={card.id}
              card={card}
              index={i}
              faceDown={!revealed}
            />
          ))}
        </AnimatePresence>
      </div>
      {val && (
        <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} style={{
          background: 'rgba(0,0,0,0.6)',
          border: `1px solid ${state.dealerStatus === 'busted' ? 'rgba(220,60,60,0.5)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 20, padding: '2px 10px',
          fontSize: 12, fontWeight: 700, fontFamily: 'sans-serif',
          color: state.dealerStatus === 'busted' ? '#e05050' : 'rgba(255,255,255,0.75)',
        }}>
          {state.dealerStatus === 'blackjack' ? '♠ BLACKJACK' :
           state.dealerStatus === 'busted' ? `BUST (${val.total})` :
           `${val.total}${val.soft && val.total < 21 ? ' soft' : ''}`}
        </motion.div>
      )}
      {!val && state.phase === 'SEAT_SELECTION' && (
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.6)', fontFamily: 'sans-serif' }}>
          Select a seat to join
        </div>
      )}
      {!val && state.phase === 'BETTING' && (
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.45)', fontFamily: 'sans-serif' }}>
          Place your bets
        </div>
      )}
      {state.phase === 'DEALER_TURN' && (
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.45)', fontFamily: 'sans-serif' }}>
          Dealer playing…
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card Shoe
// ─────────────────────────────────────────────────────────────────────────────

function CardCollectionAnimation({ state, seatPositions, active }: {
  state: any;
  seatPositions: Array<{ x: number; y: number }>;
  active: boolean;
}) {
  const cards = useMemo(() => {
    const items: Array<{ key: string; x: number; y: number; offset: number }> = [];
    (state.dealerCards as Card[]).forEach((_, i) => items.push({ key: `dealer-${i}`, x: 50 + i * 1.2, y: 18, offset: i }));
    (state.seats as Seat[]).forEach((seat, seatIndex) => {
      const pos = seatPositions[seatIndex];
      seat.hands.forEach((hand, handIndex) => hand.cards.forEach((_, cardIndex) => {
        items.push({
          key: `seat-${seatIndex}-${handIndex}-${cardIndex}`,
          x: pos.x + cardIndex * 0.9,
          y: pos.y - 15,
          offset: items.length,
        });
      }));
    });
    return items;
  }, [state.dealerCards, state.seats, seatPositions]);

  return (
    <AnimatePresence>
      {active && cards.map((item, i) => (
        <motion.div
          key={item.key}
          initial={{ left: `${item.x}%`, top: `${item.y}%`, opacity: 0.96, rotate: (i % 5 - 2) * 3, scale: 1 }}
          animate={{
            left: ['' + item.x + '%', `${Math.max(12, item.x - 18)}%`, '4.8%'],
            top: ['' + item.y + '%', `${Math.max(10, item.y - 12)}%`, '7%'],
            opacity: [0.96, 1, 0.92],
            rotate: [(i % 5 - 2) * 3, -9, -4],
            scale: [1, 0.9, 0.54],
          }}
          transition={{
            delay: i * 0.055,
            duration: 0.78,
            times: [0, 0.34, 1],
            ease: [0.22, 0.72, 0.18, 1],
          }}
          style={{ position: 'absolute', width: 48, height: 68, zIndex: 90, pointerEvents: 'none', transformOrigin: 'center' }}
        >
          <div style={{
            width: '100%', height: '100%', borderRadius: 5,
            background: 'repeating-linear-gradient(45deg,#71141b 0 4px,#a5232c 4px 8px,#e6d9b6 8px 9px)',
            border: '2px solid #eee5cd',
            boxShadow: '0 10px 18px rgba(0,0,0,0.48), inset 0 0 0 2px rgba(70,8,12,0.55)',
          }} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

function ShuffleCeremony({ stage, shoeNumber }: {
  stage?: 'collecting' | 'shuffling' | 'burning';
  shoeNumber: number;
}) {
  const copy = stage === 'collecting'
    ? { eyebrow: 'Cut card reached', title: 'Collecting the shoe', detail: 'Every card is being verified before the shuffle' }
    : stage === 'shuffling'
      ? { eyebrow: `Preparing shoe ${shoeNumber}`, title: 'Casino shuffle', detail: 'Securely randomizing the complete shoe' }
      : { eyebrow: `Shoe ${shoeNumber} ready`, title: 'Burning one card', detail: 'The cut is set and play will resume' };

  return (
    <motion.div
      key="shuffle-ceremony"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 55,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 42%,rgba(6,18,15,0.52),rgba(2,5,5,0.82))',
        backdropFilter: 'blur(2px)', pointerEvents: 'all',
      }}
    >
      <motion.div
        key={stage}
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.34 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
      >
        <div style={{ position: 'relative', width: 104, height: 70 }}>
          {[0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              animate={stage === 'shuffling'
                ? { x: [0, i % 2 ? 24 : -24, 0], rotate: [i * 3 - 5, i % 2 ? 12 : -12, i * 3 - 5] }
                : { x: 0, rotate: i * 3 - 5 }}
              transition={{ duration: 0.72, delay: i * 0.08, repeat: stage === 'shuffling' ? Infinity : 0, repeatDelay: 0.08 }}
              style={{
                position: 'absolute', left: 27 + i * 2, top: 1 + i * 2,
                width: 49, height: 67, borderRadius: 5,
                background: 'repeating-linear-gradient(45deg,#71141b 0 4px,#a5232c 4px 8px,#e6d9b6 8px 9px)',
                border: '2px solid #eee5cd', boxShadow: '0 8px 16px rgba(0,0,0,0.48)',
                transformOrigin: 'center bottom',
              }}
            />
          ))}
          {stage === 'burning' && (
            <motion.div
              initial={{ x: 0, opacity: 0 }} animate={{ x: -48, y: 9, rotate: -16, opacity: 1 }}
              style={{
                position: 'absolute', left: 31, top: 3, width: 49, height: 67, borderRadius: 5,
                background: 'repeating-linear-gradient(45deg,#71141b 0 4px,#a5232c 4px 8px,#e6d9b6 8px 9px)',
                border: '2px solid #eee5cd', boxShadow: '0 8px 16px rgba(0,0,0,0.48)',
              }}
            />
          )}
        </div>
        <div style={{ fontSize: 9, color: '#d8ab3d', letterSpacing: '0.22em', textTransform: 'uppercase', fontFamily: 'sans-serif', fontWeight: 800 }}>
          {copy.eyebrow}
        </div>
        <div style={{ fontSize: 22, color: '#f7edcf', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
          {copy.title}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.52)', letterSpacing: '0.06em', fontFamily: 'sans-serif' }}>
          {copy.detail}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CardShoe({ shoe, decks, cutCardIndex, needsShuffle, shoeNumber, isMobile = false }: {
  shoe: Card[];
  decks: number;
  cutCardIndex: number;
  needsShuffle: boolean;
  shoeNumber: number;
  isMobile?: boolean;
}) {
  const total = decks * 52;
  const fill = shoe.length / total;
  const cardsUntilCut = Math.max(0, shoe.length - cutCardIndex);
  const cutCardVisible = needsShuffle || cardsUntilCut <= Math.max(5, Math.round(total * 0.08));
  const cardW = isMobile ? 50 : 92;
  const cardH = isMobile ? 38 : 58;
  const housingW = isMobile ? 72 : 128;
  const housingH = isMobile ? 58 : 84;
  return (
    <div style={{ position: 'absolute', top: isMobile ? '2%' : '3.5%', right: '3%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 5, transform: isMobile ? undefined : 'scale(var(--table-ui-scale, 1))', transformOrigin: 'top right' }}>
      <div style={{ position: 'relative', width: housingW, height: housingH }}>
        {/* Visible deck inside the transparent shoe */}
        <div style={{
          position: 'absolute', right: 9, top: 8,
          width: cardW, height: Math.max(10, cardH * fill),
          borderRadius: '4px 4px 2px 2px', overflow: 'hidden',
          background: 'repeating-linear-gradient(0deg,#f4f0e7 0 1px,#9d9a92 1px 2px)',
          border: '1px solid rgba(230,225,210,0.45)',
          boxShadow: '-3px 3px 8px rgba(0,0,0,0.7)',
        }}>
          <div style={{
            position: 'absolute', inset: 2,
            borderRadius: 3,
            background: 'repeating-linear-gradient(45deg,#71141b 0 3px,#9e2028 3px 6px,#e6d9b6 6px 7px)',
            border: '1px solid rgba(255,245,220,0.55)',
            boxShadow: 'inset 0 0 0 2px rgba(70,8,12,0.45)',
          }} />
        </div>

        {/* Smoked acrylic shoe housing */}
        <div style={{
          position: 'absolute', inset: 0,
          clipPath: 'polygon(15% 0,100% 10%,100% 78%,82% 100%,0 100%,0 30%)',
          background: 'linear-gradient(125deg,rgba(160,170,176,0.12),rgba(28,32,35,0.18) 46%,rgba(2,3,4,0.35))',
          border: '1px solid rgba(210,220,225,0.28)',
          boxShadow: '0 8px 15px rgba(0,0,0,0.68), inset 2px 2px 2px rgba(255,255,255,0.12)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', left: 5, right: 4, bottom: 4, height: 24,
          borderRadius: '3px 3px 7px 7px',
          background: 'linear-gradient(180deg,#262b2e,#060708 75%)',
          border: '1px solid rgba(255,255,255,0.11)',
          boxShadow: '0 4px 6px rgba(0,0,0,0.7), inset 0 2px 4px rgba(0,0,0,0.9)',
        }}>
          <div id="card-shoe-mouth" style={{ width: '42%', height: 6, margin: '6px 8px 0 auto', borderRadius: 4, background: '#020303', boxShadow: '0 1px 0 rgba(255,255,255,0.08)' }} />
          {cutCardVisible && (
            <motion.div
              initial={{ x: 10, opacity: 0 }}
              animate={{ x: needsShuffle ? -2 : 3, opacity: 1 }}
              style={{
                position: 'absolute', right: 7, top: 4, width: '46%', height: 9,
                borderRadius: '2px 1px 1px 2px',
                background: 'linear-gradient(180deg,#ffe078,#e0a719)',
                border: '1px solid rgba(82,48,0,0.8)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.65)', zIndex: 4,
              }}
            />
          )}
        </div>
        <div style={{ position: 'absolute', top: 8, left: 18, width: 2, height: '58%', transform: 'rotate(8deg)', background: 'rgba(255,255,255,0.15)', filter: 'blur(.2px)' }} />
      </div>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.32)', fontFamily: 'sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        Shoe {shoeNumber} · {shoe.length}/{total}{needsShuffle ? ' · Cut card' : ''}
      </div>
    </div>
  );
}

function DiscardTray({ discard, decks, isMobile = false }: { discard: Card[]; decks: number; isMobile?: boolean }) {
  const total = decks * 52;
  const fill = Math.min(1, discard.length / total);
  const trayW = isMobile ? 52 : 82;
  const trayH = isMobile ? 45 : 68;
  const stackH = Math.max(3, fill * (isMobile ? 35 : 54));

  return (
    <div style={{
      position: 'absolute', top: isMobile ? '2%' : '3.5%', left: '3%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 5,
      transform: isMobile ? undefined : 'scale(var(--table-ui-scale, 1))', transformOrigin: 'top left',
    }}>
      <div style={{
        position: 'relative', width: trayW, height: trayH,
        borderRadius: '6px 6px 10px 10px',
        background: 'linear-gradient(135deg,rgba(75,80,83,0.88),rgba(10,12,13,0.97) 48%,#020303)',
        border: '1px solid rgba(220,225,225,0.25)',
        boxShadow: '0 7px 14px rgba(0,0,0,0.68), inset 1px 1px 2px rgba(255,255,255,0.12)',
      }}>
        <div style={{
          position: 'absolute', left: 7, right: 7, bottom: 7, height: trayH - 17,
          borderRadius: '3px 3px 7px 7px',
          background: '#050606', border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'inset 0 5px 10px rgba(0,0,0,0.95)', overflow: 'hidden',
        }}>
          {discard.length > 0 && (
            <div style={{
              position: 'absolute', left: 4, right: 4, bottom: 3, height: stackH,
              borderRadius: '3px 3px 2px 2px',
              background: 'repeating-linear-gradient(0deg,#e7e3da 0 1px,#918e87 1px 2px)',
              border: '1px solid rgba(225,220,205,0.35)',
              boxShadow: '0 -2px 5px rgba(0,0,0,0.5)',
            }}>
              <div style={{
                position: 'absolute', left: 1, right: 1, top: -2, height: 8, borderRadius: 3,
                background: 'repeating-linear-gradient(45deg,#71141b 0 3px,#9e2028 3px 6px,#e6d9b6 6px 7px)',
                border: '1px solid rgba(255,245,220,0.45)',
              }} />
            </div>
          )}
        </div>
        <div style={{ position: 'absolute', left: 5, right: 5, top: 4, height: 3, borderRadius: 3, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)' }} />
      </div>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.32)', fontFamily: 'sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        Discard · {discard.length}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Seat Spot
// The outer wrapper (in Table) places a 0×0 div exactly at the arc point.
// Every child here uses absolute positioning relative to that 0×0 anchor, so
// the bet circle is ALWAYS fixed at the arc point regardless of how much
// content exists above (cards) or below (action buttons / side bets).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// BonusPaidToast — self-dismissing toast that appears when an immediate side-bet
// win is paid, then fades out after 2.5 s. Uses AnimatePresence for the exit.
// ─────────────────────────────────────────────────────────────────────────────
function BonusPaidToast({
  wins, anchorStyle, anchorX,
}: { wins: any[]; anchorStyle: React.CSSProperties; anchorX: string | number }) {
  const [visible, setVisible] = useState(true);

  // Re-arm the timer whenever the win list changes (new split hand wins etc.)
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [wins.map((w: any) => w.betName).join(',')]);

  if (wins.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="bonus-toast"
          initial={{ opacity: 0, scale: 0.82, y: -8, x: anchorX }}
          animate={{ opacity: 1, scale: 1,    y:  0, x: anchorX }}
          exit={{    opacity: 0, scale: 0.88, y: -6, x: anchorX }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            bottom: 40 + 180,
            ...anchorStyle,
            zIndex: 60,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            pointerEvents: 'none',
          }}
        >
          <div style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'rgba(240,184,48,0.65)', fontFamily: 'Inter, sans-serif', marginBottom: 1,
          }}>Bonus Paid ✓</div>
          {wins.map((res: any, i: number) => (
            <div key={i} style={{
              background: 'linear-gradient(135deg,#7a5a0e,#d4a820,#7a5a0e)',
              borderRadius: 5, padding: '4px 14px',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#000',
              fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
              boxShadow: '0 0 14px rgba(212,168,32,0.45)',
            }}>
              {res.betName}  +${res.payout}
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlayerCardAnim — isolated wrapper so origin values are captured ONCE at mount
// via useRef and never change on re-renders.  Without this, any parent re-render
// (e.g. when DEALER_PLAY fires and dealerCards grows) would recompute origin,
// change the `animate` keyframes, and cause Framer Motion to restart the arc
// animation → cards flash back to the shoe position.
// ─────────────────────────────────────────────────────────────────────────────
function PlayerCardAnim({
  card, cIdx, onLanded,
}: { card: Card; cIdx: number; onLanded?: () => void }) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(false);

  return (
    <div ref={targetRef} style={{ position: 'absolute', top: 0, left: cIdx * 18, width: 68, height: 96 }}>
      <div style={{ opacity: landed ? 1 : 0 }}><PlayingCard card={card} /></div>
      {!landed && (
        <GlobalCardFlight
          card={card}
          targetRef={targetRef}
          onLanded={() => { setLanded(true); onLanded?.(); }}
        />
      )}
    </div>
  );
}

function SeatSpot({ seat, state, dispatch, seatIndex, config, selectedChip, seatXPct, seatYPct = 80, isMobile = false, collectingCards = false }: {
  seat: Seat; state: any; dispatch: any; seatIndex: number;
  config: TableConfig; selectedChip: number;
  seatXPct: number; seatYPct?: number; isMobile?: boolean;
  collectingCards?: boolean;
}) {
  // Circle radius scales down on mobile — extra step for 7-seat tables
  const R = isMobile
    ? (config.seats >= 7 ? 22 : 26)   // 44px on 7-seat, 52px on 5-seat
    : 33;                               // 66px on desktop
  const D = R * 2;

  const isBettingPhase = state.phase === 'BETTING' || state.phase === 'SEAT_SELECTION';
  const isPlayerTurn   = state.phase === 'PLAYER_TURN' && state.activeSeatIndex === seatIndex;
  const isInsurance    = state.phase === 'INSURANCE'   && state.activeSeatIndex === seatIndex;
  const isSelectedBet  = state.bettingSeatId === seatIndex;
  const currentBet     = seat.hands[0]?.bet ?? 0;

  const activeHand: Hand | undefined = seat.hands[seat.activeHandIndex];

  // Natural blackjack (non-split 2-card 21): auto-stood, no actions shown
  const hasNaturalBJ = !!activeHand && !activeHand.isSplit
    && activeHand.cards.length === 2
    && calculateHandValue(activeHand.cards).total === 21;

  // Double: allowed on any number of cards (any-double rule), requires bankroll
  const canDouble    = !!activeHand && !hasNaturalBJ
                       && (!config.rules.doubleOnFirstTwoOnly || activeHand.cards.length === 2)
                       && (!activeHand.isSplit || config.rules.doubleAfterSplit)
                       && state.bankroll >= activeHand.bet;

  // Split: first 2 matching cards, max 4 hands, bankroll available
  const canSplit     = !!activeHand && activeHand.cards.length === 2
                       && (config.rules.splitByValue
                         ? activeHand.cards[0].value === activeHand.cards[1].value
                         : activeHand.cards[0].rank === activeHand.cards[1].rank)
                       && !(activeHand.cards[0].rank === 'A' && activeHand.isSplit && !config.rules.resplitAces)
                       && state.bankroll >= activeHand.bet
                       && seat.hands.length < config.rules.maxSplitHands;

  // Late surrender: first 2 cards only, not after a split
  const canSurrender = !!activeHand && config.rules.lateSurrender
                       && activeHand.cards.length === 2 && !activeHand.isSplit;

  // ── EMPTY SEAT ───────────────────────────────────────────────────────────
  if (!seat.isActive) {
    if (!isBettingPhase) return null;
    // Sit button is itself anchored at the arc point via translate(-50%,-50%)
    return (
      <div style={{ position: 'relative', width: 0, height: 0, transform: isMobile ? undefined : 'scale(var(--table-ui-scale, 1))' }}>
        <motion.button
          data-testid={`button-sit-${seatIndex}`}
          onClick={() => {
            dispatch({ type: 'SIT', seatId: seatIndex });
            dispatch({ type: 'SELECT_BET_SEAT', seatId: seatIndex });
          }}
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
          style={{
            position: 'absolute',
            top: -R, left: -R,
            width: D, height: D, borderRadius: '50%',
            border: '2px dashed rgba(255,255,255,0.28)',
            background: 'rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(255,255,255,0.38)', gap: 1,
          }}
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>Sit</span>
        </motion.button>
      </div>
    );
  }

  // ── ACTIVE SEAT ──────────────────────────────────────────────────────────
  // All children are absolutely positioned relative to the 0×0 anchor (arc point).
  // Arc point = centre of the bet circle.
  // Cards zone:   bottom:40 → bottom of card area is 40px above arc centre
  // Bet circle:   top:-33, left:-33 → 66×66 centred on arc
  // Below zone:   top:40 → top of buttons/side-bets is 40px below arc centre

  // Smart horizontal anchor for floating badges/popups so right-edge seats never
  // overflow off screen. Because Framer Motion owns the CSS `transform` property,
  // we express centering as a motion `x` value instead of CSS translateX(-50%).
  const popAnchorStyle: React.CSSProperties =
    seatXPct < 33  ? { left: -R }
    : seatXPct > 67 ? { right: -R, left: 'auto' }
    : { left: '50%' };
  // x value passed into Framer Motion so it handles translateX without conflict
  const popAnchorX: string | number =
    (seatXPct >= 33 && seatXPct <= 67) ? '-50%' : 0;

  return (
    <div style={{ position: 'relative', width: 0, height: 0, transform: isMobile ? undefined : 'scale(var(--table-ui-scale, 1))' }}>

      {/* ── CARDS ZONE (above bet circle) ── */}
      <div style={{
        position: 'absolute',
        bottom: 40,              // bottom of this div = 40px above arc centre
        left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6, alignItems: 'flex-end',
        pointerEvents: 'none',
        opacity: collectingCards ? 0 : 1,
        transition: 'opacity 180ms ease',
      }}>
        {seat.hands.map((hand: Hand, hIdx: number) => {
          const isThisHand = isPlayerTurn && seat.activeHandIndex === hIdx;
          const val = calculateHandValue(hand.cards);
          const handW = Math.max(68, 68 + (hand.cards.length - 1) * 18);
          // Cards fan horizontally. Keeping the container height fixed prevents
          // the whole hand from jumping upward whenever HIT adds another card.
          const handH = 96;

          return (
            <div key={hand.id} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              opacity: state.phase === 'PLAYER_TURN' && !isThisHand ? 0.55 : 1,
              transition: 'opacity 0.25s',
              pointerEvents: 'auto',
            }}>
              {/* Result toast — dramatic animated badge */}
              <AnimatePresence>
                {hand.result && (() => {
                  const isBJ  = hand.result === 'blackjack_win';
                  const isWin = hand.result === 'win' || isBJ;
                  const isPush = hand.result === 'push';
                  const isSurrender = hand.result === 'surrender';
                  const isBust = hand.result === 'bust';
                  const label = isBJ         ? '♠ BLACKJACK!'
                    : isWin                  ? `+$${hand.payout ?? hand.bet}`
                    : isPush                 ? 'PUSH'
                    : isSurrender            ? 'SURRENDER'
                    : isBust                 ? 'BUST'
                    : `-$${hand.bet}`;
                  const colors = isBJ
                    ? { bg: 'linear-gradient(135deg,#b8860b,#ffd700,#b8860b)', color: '#000', border: '#ffd700', glow: 'rgba(255,215,0,0.7)', fs: 13 }
                    : isWin
                    ? { bg: 'linear-gradient(135deg,#0d5c26,#1db954,#0d5c26)', color: '#fff', border: '#1db954', glow: 'rgba(29,185,84,0.5)', fs: 12 }
                    : isPush
                    ? { bg: 'rgba(55,55,55,0.95)', color: '#ccc', border: 'rgba(150,150,150,0.4)', glow: 'none', fs: 11 }
                    : isSurrender
                    ? { bg: 'rgba(110,70,10,0.95)', color: '#f0c060', border: 'rgba(200,150,40,0.5)', glow: 'none', fs: 10 }
                    : { bg: 'linear-gradient(135deg,#6b0f0f,#c0392b,#6b0f0f)', color: '#fff', border: '#c0392b', glow: 'rgba(192,57,43,0.5)', fs: 12 };
                  return (
                    <motion.div
                      key={`res-${hand.id}`}
                      initial={
                        isBJ    ? { opacity: 0, scale: 0.3, y: 12, rotate: -8 }
                        : isWin ? { opacity: 0, scale: 0.5, y: 8 }
                        : isPush ? { opacity: 0, x: -20 }
                        : isBust ? { opacity: 0, scale: 1.4, y: -4 }
                        : { opacity: 0, scale: 0.6, y: 6 }
                      }
                      animate={
                        isBJ    ? { opacity: 1, scale: [0.3,1.22,1], y: 0, rotate: 0 }
                        : isWin ? { opacity: 1, scale: [0.5,1.12,1], y: 0 }
                        : isPush ? { opacity: 1, x: 0 }
                        : isBust ? { opacity: 1, scale: [1.4,0.92,1], y: 0 }
                        : { opacity: 1, scale: 1, y: 0 }
                      }
                      transition={
                        isBJ || isWin
                          ? { type: 'spring', stiffness: 320, damping: 20 }
                          : { duration: 0.3, ease: 'easeOut' }
                      }
                      style={{
                        padding: isBJ ? '5px 14px' : '3px 10px',
                        borderRadius: 5,
                        fontSize: colors.fs,
                        fontWeight: 800,
                        letterSpacing: isBJ ? '0.12em' : '0.08em',
                        textTransform: 'uppercase',
                        fontFamily: 'sans-serif',
                        whiteSpace: 'nowrap',
                        background: colors.bg,
                        color: colors.color,
                        border: `1px solid ${colors.border}`,
                        boxShadow: colors.glow !== 'none'
                          ? `0 0 16px ${colors.glow}, 0 2px 8px rgba(0,0,0,0.6)`
                          : '0 2px 6px rgba(0,0,0,0.5)',
                      }}
                    >
                      {label}
                    </motion.div>
                  );
                })()}
              </AnimatePresence>

              {/* Card fan — each card uses PlayerCardAnim which freezes origin at mount */}
              <div style={{ position: 'relative', width: handW, height: handH }}>
                {hand.cards.map((card: Card, cIdx: number) => (
                  <PlayerCardAnim
                    key={card.id}
                    card={card}
                    cIdx={cIdx}
                    onLanded={
                      state.actionLocked && isThisHand && cIdx === hand.cards.length - 1
                        ? () => dispatch({
                            type: 'PLAYER_CARD_LANDED',
                            seatId: seatIndex,
                            handId: hand.id,
                            cardId: card.id,
                          })
                        : undefined
                    }
                  />
                ))}
              </div>

              {/* Hand value badge */}
              {hand.cards.length > 0 && (
                <div style={{
                  background: 'rgba(0,0,0,0.72)',
                  border: `1px solid ${isThisHand ? 'rgba(212,168,32,0.75)' : 'rgba(255,255,255,0.13)'}`,
                  borderRadius: 12, padding: '2px 8px',
                  fontSize: 11, fontWeight: 700, fontFamily: 'sans-serif',
                  color: val.total > 21 ? '#e05050' : val.total === 21 ? '#f0b830' : 'rgba(255,255,255,0.82)',
                }}>
                  {val.total}{val.soft && val.total < 21 ? `/${val.total - 10}` : ''}{val.total > 21 ? ' bust' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── SIDE BET WIN DISPLAY ────────────────────────────────────────────── */}

      {/* IMMEDIATE wins (paid at start of PLAYER_TURN):
          1. Flying chip burst fires once when result first appears.
          2. Persistent gold badge stays throughout the player's entire turn. */}
      <AnimatePresence>
        {(seat.sideBetResults || [])
          .filter((r: any) => r.win && r.immediate)
          .map((res: any, idx: number) => (
            <motion.div
              key={`sbr-imm-${idx}`}
              initial={{ opacity: 0, y: 0, x: popAnchorX }}
              animate={{ opacity: 1, y: 0, x: popAnchorX }}
              exit={{ opacity: 0, scale: 0.8, x: popAnchorX }}
              style={{
                position: 'absolute',
                bottom: 40,
                ...popAnchorStyle,
                zIndex: 80, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}
            >
              {/* Chip burst fires once on entry */}
              <ChipBurst amount={res.payout} />
            </motion.div>
          ))}
      </AnimatePresence>

      {/* Self-dismissing bonus paid toast (2.5 s) */}
      <BonusPaidToast
        wins={(seat.sideBetResults || []).filter((r: any) => r.win && r.immediate)}
        anchorStyle={popAnchorStyle}
        anchorX={popAnchorX}
      />

      {/* SETTLEMENT wins (Super Sevens, Bust It, Insurance — end-of-round only):
          Flying chip burst + label when settlement results appear */}
      <AnimatePresence>
        {(seat.sideBetResults || [])
          .filter((r: any) => r.win && !r.immediate)
          .map((res: any, idx: number) => (
            <motion.div
              key={`sbr-end-${idx}`}
              initial={{ opacity: 0, y: 0, x: popAnchorX }}
              animate={{ opacity: [0, 1, 1, 0], y: [0, -30, -55, -80], x: popAnchorX }}
              transition={{ duration: 1.8, delay: idx * 0.18, times: [0, 0.1, 0.75, 1] }}
              style={{
                position: 'absolute',
                bottom: 40,
                ...popAnchorStyle,
                zIndex: 80, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <ChipBurst amount={res.payout} />
              <div style={{
                background: 'linear-gradient(135deg,#8b6914,#d4a820,#8b6914)',
                borderRadius: 4, padding: '2px 8px',
                fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#000',
                fontFamily: 'sans-serif', whiteSpace: 'nowrap',
                boxShadow: '0 0 10px rgba(212,168,32,0.6)',
              }}>
                {res.betName}  +${res.payout}
              </div>
            </motion.div>
          ))}
      </AnimatePresence>

      {/* ── BET CIRCLE (anchored at arc point) ── */}
      {/* Insurance prompt floats above the circle */}
      {isInsurance && (
        <motion.div initial={{ opacity: 0, y: 8, x: popAnchorX }} animate={{ opacity: 1, y: 0, x: popAnchorX }} style={{
          position: 'absolute', bottom: 40 + 8,
          ...popAnchorStyle,
          background: 'rgba(15,18,36,0.97)', border: '1px solid rgba(240,184,48,0.5)',
          borderRadius: 8, padding: '10px 14px', textAlign: 'center',
          zIndex: 50, minWidth: 140, boxShadow: '0 6px 24px rgba(0,0,0,0.8)',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: '#f0b830', textTransform: 'uppercase', fontFamily: 'sans-serif', marginBottom: 5 }}>Insurance?</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif', marginBottom: 8 }}>Max ${Math.floor(currentBet / 2)}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => dispatch({ type: 'INSURANCE', seatId: seatIndex })}
              style={{ flex: 1, padding: '4px 0', background: '#f0b830', color: '#000', fontWeight: 700, fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'sans-serif' }}>Buy</button>
            <button onClick={() => dispatch({ type: 'DECLINE_INSURANCE', seatId: seatIndex })}
              style={{ flex: 1, padding: '4px 0', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 10, borderRadius: 4, border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', fontFamily: 'sans-serif' }}>Skip</button>
          </div>
        </motion.div>
      )}

      <motion.div
        data-testid={`seat-${seatIndex}`}
        onClick={() => {
          if (state.phase === 'BETTING') {
            if (!isSelectedBet) dispatch({ type: 'SELECT_BET_SEAT', seatId: seatIndex });
            dispatch({ type: 'PLACE_BET', seatId: seatIndex, amount: selectedChip });
          }
        }}
        animate={{
          boxShadow: isPlayerTurn
            ? '0 0 0 3px rgba(212,168,32,0.9), 0 0 24px rgba(212,168,32,0.5)'
            : isSelectedBet
            ? '0 0 0 2px rgba(212,168,32,0.55), 0 0 14px rgba(212,168,32,0.25)'
            : '0 0 0 2px rgba(255,255,255,0.14)',
        }}
        style={{
          position: 'absolute',
          top: -R, left: -R,
          width: D, height: D, borderRadius: '50%',
          background: isPlayerTurn ? 'rgba(212,168,32,0.1)' : 'rgba(0,0,0,0.32)',
          cursor: state.phase === 'BETTING' ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s',
        }}
      >
        {currentBet > 0 ? <ChipStack amount={currentBet} /> : (
          <span style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', fontFamily: 'sans-serif', fontWeight: 700 }}>
            {state.phase === 'BETTING' ? 'Tap' : 'Bet'}
          </span>
        )}
        {((seat.sideBets as any).insurance > 0) && (
          <div style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#112299', border: '1px solid #4466ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#fff', fontWeight: 700, fontFamily: 'sans-serif' }}>IN</div>
        )}
        {isPlayerTurn && (
          <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
            style={{ position: 'absolute', bottom: -11, width: 7, height: 7, borderRadius: '50%', background: '#f0b830' }} />
        )}
      </motion.div>

      {/* ── BELOW ZONE: side bets (betting) or action buttons (player turn) ── */}

      {/* Side bet chips — desktop only (mobile uses SideBetSheet at Table level).
          Smart anchor: left seats pin panel's left edge to circle's left edge,
          right seats pin panel's right edge to circle's right edge, center = centered.
          This prevents overflow on both edges of the felt. */}
      {!isMobile && isBettingPhase && config.sideBets.filter(s => s !== 'insurance').length > 0 && (
        <div
          style={{
            position: 'absolute', top: R + 10,
            // Smart anchor based on horizontal seat position
            ...(seatXPct < 33
              ? { left: -R,     transform: 'translateX(0)' }       // leftmost: pin left edge
              : seatXPct > 67
              ? { left:  R,     transform: 'translateX(-100%)' }    // rightmost: pin right edge
              : { left: '0px',  transform: 'translateX(-50%)' }),   // center seats: centre
            display: 'flex', flexWrap: 'wrap', gap: 5,
            justifyContent: 'center',
            width: 190,
            zIndex: 25,
          }}
        >
          {config.sideBets.filter(s => s !== 'insurance').map(sb => {
            const placed = (seat.sideBets as any)[sb] ?? 0;
            return (
              <div key={sb} data-testid={`sidebet-${sb}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  opacity: isSelectedBet ? 1 : 0.72,
                  transform: isSelectedBet ? 'scale(1)' : 'scale(0.82)',
                  transition: 'opacity 0.2s, transform 0.2s',
                }}>
                <SideBetChip
                  label={SIDE_BET_LABELS[sb] || sb}
                  amount={placed}
                  onClick={() => {
                    if (!isSelectedBet) dispatch({ type: 'SELECT_BET_SEAT', seatId: seatIndex });
                    dispatch({ type: 'PLACE_SIDE_BET', seatId: seatIndex, betType: sb as keyof SideBets, amount: selectedChip });
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons — desktop only; mobile uses PlayerActionStrip at Table level.
          Positioning is on a plain div (not motion.div) so Framer Motion's transform
          compositor never clobbers the CSS translateX anchor. Right-edge seats use
          `right: -R` (panel's right edge pins to the circle's right edge, grows left).
          Left-edge seats use `left: -R`. Center seats use left:0 + translateX(-50%). */}
      <AnimatePresence>
        {!isMobile && isPlayerTurn && !state.actionLocked && !state.pendingTurnAdvance && !hasNaturalBJ && (
          <div style={{
            position: 'absolute', top: R + 8,
            ...(seatXPct < 33
              ? { left: -R }                              // left seats: pin left edge to circle's left
              : seatXPct > 67
              ? { right: -R, left: 'auto' }               // right seats: pin right edge to circle's right, grows left
              : { left: '50%', transform: 'translateX(-50%)' }), // center: centered on arc point
          }}>
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
            >
              <div style={{ display: 'flex', gap: 4 }}>
                <button data-testid="button-hit"   onClick={() => dispatch({ type: 'HIT', seatId: seatIndex, handId: activeHand!.id })}   style={feltActionBtn(false, true)}>Hit</button>
                <button data-testid="button-stand" onClick={() => dispatch({ type: 'STAND', seatId: seatIndex, handId: activeHand!.id })} style={feltActionBtn(false, false)}>Stand</button>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button data-testid="button-double"    onClick={() => canDouble    && dispatch({ type: 'DOUBLE', seatId: seatIndex, handId: activeHand!.id })}    style={feltActionBtn(!canDouble,    false)}>Double</button>
                <button data-testid="button-split"     onClick={() => canSplit     && dispatch({ type: 'SPLIT', seatId: seatIndex, handId: activeHand!.id })}     style={feltActionBtn(!canSplit,     false)}>Split</button>
                <button data-testid="button-surrender" onClick={() => canSurrender && dispatch({ type: 'SURRENDER', seatId: seatIndex, handId: activeHand!.id })} style={feltActionBtn(!canSurrender, false)}>Surr.</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Action Strip  (mobile only — replaces in-arc action buttons)
// Full-width strip that slides in from the bottom during PLAYER_TURN.
// Large touch targets, never clipped by arc coordinates.
// ─────────────────────────────────────────────────────────────────────────────

function PlayerActionStrip({ state, dispatch }: { state: any; dispatch: any }) {
  if (state.phase !== 'PLAYER_TURN' || state.actionLocked || state.pendingTurnAdvance) return null;
  const seat: Seat | undefined = state.seats[state.activeSeatIndex];
  const activeHand: Hand | undefined = seat?.hands[seat.activeHandIndex];
  if (!seat || !activeHand) return null;

  const hasNaturalBJ = !activeHand.isSplit && activeHand.cards.length === 2
    && calculateHandValue(activeHand.cards).total === 21;
  if (hasNaturalBJ) return null;

  const rules = state.table.rules;
  const canDouble    = (!rules.doubleOnFirstTwoOnly || activeHand.cards.length === 2)
    && (!activeHand.isSplit || rules.doubleAfterSplit)
    && state.bankroll >= activeHand.bet;
  const canSplit     = activeHand.cards.length === 2
    && (rules.splitByValue
      ? activeHand.cards[0].value === activeHand.cards[1].value
      : activeHand.cards[0].rank === activeHand.cards[1].rank)
    && !(activeHand.cards[0].rank === 'A' && activeHand.isSplit && !rules.resplitAces)
    && state.bankroll >= activeHand.bet
    && (seat?.hands.length ?? 0) < rules.maxSplitHands;
  const canSurrender = rules.lateSurrender && activeHand.cards.length === 2 && !activeHand.isSplit;

  return (
    <motion.div
      key="action-strip"
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      style={{
        flexShrink: 0,
        background: 'rgba(15,18,36,0.98)',
        borderTop: '1px solid rgba(240,184,48,0.18)',
        padding: '8px 12px 10px',
        display: 'flex', flexDirection: 'column', gap: 7,
        zIndex: 36,
      }}
    >
      {/* Row 1 — Hit + Stand: large primary buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: 'Hit',   action: 'HIT',   primary: true,  disabled: false },
          { label: 'Stand', action: 'STAND', primary: false, disabled: false },
        ].map(({ label, action, primary, disabled }) => (
          <button key={action}
            data-testid={`button-${label.toLowerCase()}`}
            onClick={() => dispatch({ type: action, seatId: seat.id, handId: activeHand.id })}
            style={{
              flex: 1, height: 50,
              background: primary
                ? 'linear-gradient(135deg,#b8820a,#e8b830 45%,#fde068 70%,#c89a18)'
                : 'rgba(255,255,255,0.1)',
              border: primary ? 'none' : '1px solid rgba(255,255,255,0.22)',
              borderRadius: 7,
              fontSize: 14, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: primary ? '#000' : '#f0e6c8',
              cursor: 'pointer', fontFamily: 'sans-serif',
              boxShadow: primary ? '0 3px 14px rgba(212,168,32,0.4)' : 'none',
            }}
          >{label}</button>
        ))}
      </div>
      {/* Row 2 — Double / Split / Surrender: smaller secondary */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { label: 'Double',   action: 'DOUBLE',    disabled: !canDouble },
          { label: 'Split',    action: 'SPLIT',     disabled: !canSplit },
          { label: 'Surrender',action: 'SURRENDER', disabled: !canSurrender },
        ].map(({ label, action, disabled }) => (
          <button key={action}
            data-testid={`button-${action.toLowerCase()}`}
            onClick={() => !disabled && dispatch({ type: action, seatId: seat.id, handId: activeHand.id })}
            style={{
              flex: 1, height: 36,
              background: disabled ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)'}`,
              borderRadius: 5,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: disabled ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.7)',
              cursor: disabled ? 'default' : 'pointer',
              fontFamily: 'sans-serif',
            }}
          >{label}</button>
        ))}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side Bet Bottom Sheet  (mobile only)
// Renders in the layout flex-column so it is NEVER clipped by arc coordinates.
// Multi-seat: tabs let the player switch which seat they are editing WITHOUT
// placing a chip — switching tab is a pure local state change.
// ─────────────────────────────────────────────────────────────────────────────

function SideBetSheet({ state, dispatch, config, selectedChip }: {
  state: any; dispatch: any; config: TableConfig; selectedChip: number;
}) {
  const isBettingPhase = state.phase === 'BETTING' || state.phase === 'SEAT_SELECTION';
  const sideBets = config.sideBets.filter((s: string) => s !== 'insurance');

  // All occupied seats that are active
  const occupiedSeats: number[] = (state.seats as Seat[])
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.isActive)
    .map(({ i }) => i);

  // Internal focused seat — switching tabs does NOT dispatch anything
  const [focusedId, setFocusedId] = useState<number>(state.bettingSeatId ?? occupiedSeats[0] ?? 0);

  // Sync focused seat when the game selects a new seat (e.g. after sitting down)
  useEffect(() => {
    if (state.bettingSeatId != null) setFocusedId(state.bettingSeatId);
  }, [state.bettingSeatId]);

  const seat: Seat | undefined = state.seats[focusedId];
  const visible = isBettingPhase && occupiedSeats.length > 0 && sideBets.length > 0 && !!seat?.isActive;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 38 }}
          style={{
            flexShrink: 0, overflow: 'hidden',
            background: 'rgba(15,18,36,0.98)',
            borderTop: '1px solid rgba(240,184,48,0.14)',
            zIndex: 35,
          }}
        >
          {/* ── Seat tab bar (only when 2+ seats occupied) ── */}
          {occupiedSeats.length > 1 && (
            <div style={{
              display: 'flex', gap: 0,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              overflowX: 'auto',
            }}>
              {occupiedSeats.map(idx => {
                const s: Seat = state.seats[idx];
                const total = sideBets.reduce((acc: number, sb: string) =>
                  acc + ((s.sideBets as any)[sb] ?? 0), 0);
                const active = idx === focusedId;
                return (
                  <button key={idx}
                    onClick={() => setFocusedId(idx)}   // ← NO chip dispatch
                    style={{
                      flex: 1, minWidth: 64, padding: '8px 6px',
                      background: active ? 'rgba(212,168,32,0.12)' : 'transparent',
                      border: 'none',
                      borderBottom: active ? '2px solid #d4a820' : '2px solid transparent',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}
                  >
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                      color: active ? '#f0b830' : 'rgba(255,255,255,0.38)',
                      fontFamily: 'sans-serif', textTransform: 'uppercase',
                    }}>Seat {idx + 1}</span>
                    {total > 0 && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, color: active ? '#f0b830' : 'rgba(212,168,32,0.5)',
                        fontFamily: 'sans-serif',
                      }}>${total}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Header (single-seat: show seat label + total) ── */}
          {occupiedSeats.length === 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 14px 4px',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.55)', fontFamily: 'sans-serif' }}>
                Side Bets — Seat {focusedId + 1}
              </div>
              {(() => {
                const total = sideBets.reduce((acc: number, sb: string) => acc + ((seat?.sideBets as any)?.[sb] ?? 0), 0);
                return total > 0
                  ? <div style={{ fontSize: 9, color: 'rgba(212,168,32,0.7)', fontFamily: 'sans-serif', fontWeight: 700 }}>Placed: ${total}</div>
                  : null;
              })()}
            </div>
          )}

          {/* ── Side bet chip grid ── */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10,
            padding: occupiedSeats.length > 1 ? '8px 14px 10px' : '4px 14px 10px',
            justifyContent: 'flex-start',
          }}>
            {sideBets.map((sb: string) => {
              const placed = (seat?.sideBets as any)?.[sb] ?? 0;
              return (
                <div key={sb} data-testid={`sidebet-${sb}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                >
                  <SideBetChip
                    label={SIDE_BET_LABELS[sb] || sb}
                    amount={placed}
                    onClick={() => {
                      // Place side bet on the FOCUSED seat only — no main-bet chip placed
                      dispatch({ type: 'PLACE_SIDE_BET', seatId: focusedId, betType: sb as keyof SideBets, amount: selectedChip });
                    }}
                  />
                  {placed > 0 && (
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#f0b830', fontFamily: 'sans-serif' }}>
                      ${placed}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Bar (simplified — chip tray + deal/next-round only)
// ─────────────────────────────────────────────────────────────────────────────

function ControlBar({ state, dispatch, playerName, config, selectedChip, setSelectedChip, canDeal, onDeal, anyActive, isMobile = false }: {
  state: any; dispatch: any; playerName: string; config: TableConfig;
  selectedChip: number; setSelectedChip: (n: number) => void;
  canDeal: boolean; onDeal: () => void; anyActive: boolean; isMobile?: boolean;
}) {
  const isBettingPhase = state.phase === 'BETTING' || state.phase === 'SEAT_SELECTION';
  // Mobile chip sizes: slightly smaller to fit 5 chips in a row
  const chipSize     = isMobile ? 38 : 42;
  const chipSelected = isMobile ? 44 : 50;

  if (isMobile) {
    // ── MOBILE LAYOUT ─────────────────────────────────────────────────────
    // Two rows: [bankroll · status] and [chip tray · action button]
    return (
      <div style={{
        flexShrink: 0,
        background: 'rgba(15,18,36,0.98)',
        borderTop: '1px solid rgba(240,184,48,0.12)',
        padding: '8px 12px 10px',
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 30,
      }}>
        {/* Row 1: bankroll left, status centre */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,230,200,0.3)', fontFamily: 'sans-serif' }}>{playerName}</div>
            <BankrollStack
              amount={state.bankroll}
              low={state.bankroll < config.minBet && isBettingPhase}
              onAddFunds={() => dispatch({ type: 'ADD_BANKROLL', amount: 1000 })}
            />
          </div>
          {/* Status / next-round */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            {state.phase === 'BETTING' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                {state.lastBets && Object.keys(state.lastBets.main).length > 0 && (
                  <button
                    data-testid="button-repeat-bet"
                    onClick={() => dispatch({ type: 'REPEAT_BET' })}
                    style={{ ...ghostBtn, padding: '5px 10px', fontSize: 9, color: 'rgba(240,184,48,0.75)', borderColor: 'rgba(240,184,48,0.28)' }}
                  >↻ Repeat Bet</button>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button data-testid="button-clear-bets" onClick={() => dispatch({ type: 'CLEAR_BETS' })} style={{ ...ghostBtn, padding: '6px 12px', fontSize: 10 }}>Clear</button>
                  {canDeal && <button data-testid="button-deal" onClick={onDeal} style={{ ...goldBtn, padding: '6px 18px', fontSize: 10 }}>Deal</button>}
                </div>
              </div>
            )}
            {state.phase === 'SETTLEMENT' && (state as any).settled && (
              <motion.button
                data-testid="button-next-round"
                onClick={() => dispatch({ type: 'NEXT_ROUND' })}
                style={{ ...ghostBtn, padding: '6px 14px', fontSize: 10, color: 'rgba(240,184,48,0.7)', borderColor: 'rgba(240,184,48,0.25)' }}
              >Deal Now ▶</motion.button>
            )}
            {state.phase === 'DEALING' && <div style={{ fontSize: 9, color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Dealing…</div>}
            {state.phase === 'INSURANCE' && <div style={{ fontSize: 9, color: 'rgba(212,168,32,0.6)', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Insurance at seat</div>}
            {state.phase === 'DEALER_TURN' && <div style={{ fontSize: 9, color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Dealer playing…</div>}
            {state.phase === 'SHUFFLING' && <div style={{ fontSize: 9, color: 'rgba(212,168,32,0.62)', fontFamily: 'sans-serif', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Preparing fresh shoe…</div>}
          </div>
        </div>

        {/* Chips now live on the felt (FeltBettingUI) — no tray needed here */}
      </div>
    );
  }

  // ── DESKTOP LAYOUT ──────────────────────────────────────────────────────────
  return (
    <div style={{
      height: 118, flexShrink: 0,
      background: 'rgba(15,18,36,0.98)',
      borderTop: '1px solid rgba(240,184,48,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', gap: 10, zIndex: 30,
    }}>

      {/* Bankroll — animated chip stack */}
      <div style={{ minWidth: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,230,200,0.3)', fontFamily: 'sans-serif' }}>{playerName}</div>
        <BankrollStack
          amount={state.bankroll}
          low={state.bankroll < config.minBet && isBettingPhase}
          onAddFunds={() => dispatch({ type: 'ADD_BANKROLL', amount: 1000 })}
        />
      </div>

      {/* Center: phase status */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {state.phase === 'SETTLEMENT' && (state as any).settled && (
          <motion.button
            data-testid="button-next-round"
            onClick={() => dispatch({ type: 'NEXT_ROUND' })}
            style={{ ...ghostBtn, color: 'rgba(240,184,48,0.7)', borderColor: 'rgba(240,184,48,0.25)' }}
          >Deal Now ▶</motion.button>
        )}
        {state.phase === 'DEALING'     && <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif' }}>Dealing…</div>}
        {state.phase === 'INSURANCE'   && <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.6)', fontFamily: 'sans-serif' }}>Insurance offered — respond at your seat</div>}
        {state.phase === 'DEALER_TURN' && <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif' }}>Dealer's turn…</div>}
        {state.phase === 'SHUFFLING'   && <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.62)', fontFamily: 'sans-serif' }}>Preparing fresh shoe…</div>}
      </div>

      {/* Right spacer — keeps bankroll left-anchored */}
      <div style={{ minWidth: 90, flexShrink: 0 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const goldBtn: CSSProperties = {
  padding: '7px 26px', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
  fontWeight: 700, fontFamily: 'sans-serif',
  background: 'linear-gradient(135deg,#b8820a,#e8b830 45%,#fde068 70%,#c89a18)',
  border: 'none', borderRadius: 4, color: '#000', cursor: 'pointer',
  boxShadow: '0 2px 12px rgba(212,168,32,0.3)',
};

const ghostBtn: CSSProperties = {
  padding: '7px 16px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
  fontWeight: 700, fontFamily: 'sans-serif',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 4, color: 'rgba(255,255,255,0.42)', cursor: 'pointer',
};

function feltActionBtn(disabled: boolean, primary: boolean): CSSProperties {
  return {
    padding: '6px 13px', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
    fontWeight: 700, fontFamily: 'sans-serif',
    background: disabled
      ? 'rgba(0,0,0,0.3)'
      : primary
      ? 'rgba(212,168,32,0.15)'
      : 'rgba(255,255,255,0.1)',
    border: disabled
      ? '1px solid rgba(255,255,255,0.07)'
      : primary
      ? '1px solid rgba(212,168,32,0.5)'
      : '1px solid rgba(255,255,255,0.22)',
    borderRadius: 4,
    color: disabled ? 'rgba(255,255,255,0.18)' : primary ? '#f0b830' : '#f0e6c8',
    cursor: disabled ? 'default' : 'pointer',
    boxShadow: disabled ? 'none' : '0 2px 6px rgba(0,0,0,0.4)',
    transition: 'background 0.12s',
  };
}
