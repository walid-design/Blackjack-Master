import { useState, useEffect, useReducer, useRef, useMemo, CSSProperties } from 'react';
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

interface DealerHistoryEntry { total: number; bust: boolean; bj: boolean }

export default function Table() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
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

  // Lifted chip selection – needed by ControlBar (display) and SeatSpot (bet placement)
  const [selectedChip, setSelectedChip] = useState(25);

  // Track previous bankroll for delta animation
  const prevBankrollRef = useRef(state.bankroll);
  useEffect(() => { prevBankrollRef.current = state.bankroll; }, [state.bankroll]);

  // Dealer history: last 15 rounds' dealer outcome
  const [dealerHistory, setDealerHistory] = useState<DealerHistoryEntry[]>([]);
  const historyRecordedRef = useRef(false);
  useEffect(() => {
    if (state.phase === 'SETTLEMENT' && !historyRecordedRef.current && state.dealerCards.length > 0) {
      historyRecordedRef.current = true;
      const val = calculateHandValue(state.dealerCards);
      setDealerHistory(prev => [
        ...prev.slice(-14),
        { total: val.total, bust: val.total > 21, bj: state.dealerStatus === 'blackjack' },
      ]);
    }
    if (state.phase !== 'SETTLEMENT') historyRecordedRef.current = false;
  }, [state.phase, state.dealerCards, state.dealerStatus]);

  // DEALING: right-to-left (reverse seat order, 550ms per card)
  const dealingRef = useRef(false);
  useEffect(() => {
    if (state.phase === 'DEALING') {
      if (dealingRef.current) return;
      dealingRef.current = true;
      // Right to left: highest index first
      const activeSeats = (state.seats as Seat[])
        .filter(s => s.isActive && s.hands.length > 0)
        .slice()
        .reverse();
      (async () => {
        for (const seat of activeSeats) {
          dispatch({ type: 'CARD_DEALT', to: 'player', seatId: seat.id });
          await sleep(550);
        }
        dispatch({ type: 'CARD_DEALT', to: 'dealer' });
        await sleep(550);
        for (const seat of activeSeats) {
          dispatch({ type: 'CARD_DEALT', to: 'player', seatId: seat.id });
          await sleep(550);
        }
        dispatch({ type: 'CARD_DEALT', to: 'dealer' });
        await sleep(700);
        dispatch({ type: 'CHECK_DEALER_BJ' });
      })();
    } else {
      dealingRef.current = false;
    }
  }, [state.phase]);

  // SPLIT_DEALING: deal one card to each split hand 550ms apart
  const splitDealingRef = useRef(false);
  useEffect(() => {
    if (state.phase !== 'SPLIT_DEALING') { splitDealingRef.current = false; return; }
    if (splitDealingRef.current) return;
    splitDealingRef.current = true;
    (async () => {
      await sleep(550);
      dispatch({ type: 'SPLIT_CARD' }); // card to hand 0
      await sleep(550);
      dispatch({ type: 'SPLIT_CARD' }); // card to hand 1 → transitions to PLAYER_TURN
    })();
  }, [state.phase, (state as any).splitCardTarget]);

  // Dealer plays after 1.4s pause
  useEffect(() => {
    if (state.phase !== 'DEALER_TURN') return;
    const t = setTimeout(() => dispatch({ type: 'DEALER_PLAY' }), 1400);
    return () => clearTimeout(t);
  }, [state.phase]);

  // Trigger settlement
  useEffect(() => {
    if (state.phase === 'SETTLEMENT' && !(state as any).settled) {
      const t = setTimeout(() => dispatch({ type: 'PERFORM_SETTLEMENT' }), 500);
      return () => clearTimeout(t);
    }
  }, [state.phase, (state as any).settled]);

  if (!tableConfig) { setLocation('/'); return null; }

  const seatPositions = getSeatPositions(tableConfig.seats, isMobile);
  const shoeTotal     = tableConfig.decks * 52;
  const shoePct       = Math.round((state.shoe.length / shoeTotal) * 100);

  const canDeal = (state.seats as Seat[]).some(s => s.isActive && (s.hands[0]?.bet ?? 0) >= tableConfig.minBet);
  const anyActive = (state.seats as Seat[]).some(s => s.isActive);

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#010403', overflow: 'hidden',
      userSelect: 'none', fontFamily: "'Playfair Display', serif", color: '#f0e6c8',
    }}>

      {/* ── HEADER ── */}
      <header style={{
        height: 46, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
        background: 'rgba(1,4,2,0.98)',
        borderBottom: '1px solid rgba(150,110,30,0.18)',
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
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.22em', color: '#d4a820' }}>
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
              style={{ height: '100%', background: shoePct < 25 ? '#e04040' : '#d4a820', borderRadius: 3 }}
            />
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'sans-serif', minWidth: 32 }}>
            {shoePct}%
          </div>
        </div>
      </header>

      {/* ── DEALER HISTORY STRIP ── */}
      {dealerHistory.length > 0 && (
        <div style={{
          height: 28, flexShrink: 0,
          background: 'rgba(0,0,0,0.55)',
          borderBottom: '1px solid rgba(150,110,30,0.1)',
          display: 'flex', alignItems: 'center',
          padding: '0 12px', gap: 6,
          zIndex: 29,
        }}>
          <div style={{ fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontFamily: 'sans-serif', marginRight: 4, whiteSpace: 'nowrap' }}>
            Dealer History
          </div>
          {dealerHistory.map((h, i) => (
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
              color: h.bj ? '#d4a820' : h.bust ? '#e05050' : 'rgba(255,255,255,0.6)',
            }}>
              {h.bj ? 'BJ' : h.bust ? 'B' : h.total}
            </div>
          ))}
        </div>
      )}

      {/* ── GAME AREA (felt table) ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#010403' }}>

        {/* FELT */}
        <div style={{
          position: 'absolute',
          top: 0, left: '-3%', right: '-3%', bottom: '1%',
          background: 'radial-gradient(ellipse 100% 80% at 50% 15%, #20844a 0%, #15633a 35%, #0d4a28 60%, #083318 88%, #051e10 100%)',
          borderRadius: '0 0 50% 50% / 0 0 18% 18%',
          borderBottom: '22px solid #1e0e04',
          borderLeft: '8px solid #180b03',
          borderRight: '8px solid #180b03',
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.5), 0 12px 50px rgba(0,0,0,0.9)',
          zIndex: 1,
        }}>

          {/* Felt rules watermark */}
          <div style={{
            position: 'absolute', top: '31%', left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2,
          }}>
            <div style={{ fontStyle: 'italic', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.075)', fontSize: 'clamp(13px,1.8vw,21px)', textTransform: 'uppercase' }}>
              Blackjack Pays 3 to 2
            </div>
            <div style={{ color: 'rgba(255,255,255,0.05)', fontSize: 'clamp(8px,1vw,12px)', letterSpacing: '0.14em', marginTop: 4, fontFamily: 'sans-serif', textTransform: 'uppercase' }}>
              Dealer Must Draw to 16 and Stand on All 17s
            </div>
            <div style={{ color: 'rgba(255,255,255,0.045)', fontSize: 'clamp(7px,0.85vw,11px)', letterSpacing: '0.12em', marginTop: 3, fontFamily: 'sans-serif', fontStyle: 'italic', textTransform: 'uppercase' }}>
              Insurance Pays 2 to 1
            </div>
          </div>

          {/* Dealer zone */}
          <DealerZone state={state} />

          {/* Card shoe */}
          <CardShoe shoe={state.shoe} decks={tableConfig.decks} isMobile={isMobile} />

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
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── CONTROL BAR ── */}
      <ControlBar
        state={state}
        dispatch={dispatch}
        playerName={playerName}
        config={tableConfig}
        selectedChip={selectedChip}
        setSelectedChip={setSelectedChip}
        canDeal={canDeal}
        anyActive={anyActive}
        isMobile={isMobile}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dealer Zone
// ─────────────────────────────────────────────────────────────────────────────

function DealerZone({ state }: { state: any }) {
  const dealerCards: Card[] = state.dealerCards || [];
  const revealed = ['DEALER_TURN', 'SETTLEMENT'].includes(state.phase) || state.dealerStatus === 'blackjack';
  const val = revealed && dealerCards.length > 0 ? calculateHandValue(dealerCards) : null;

  return (
    <div style={{
      position: 'absolute', top: '3%', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      zIndex: 5,
    }}>
      <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', fontFamily: 'sans-serif' }}>
        Dealer
      </div>
      <div style={{ position: 'relative', minWidth: 80, height: 96, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        <AnimatePresence>
          {dealerCards.map((card, i) => (
            <motion.div
              key={`dc-${i}`}
              initial={{ x: 100, y: -80, opacity: 0, rotate: 12 }}
              animate={{ x: (i - (dealerCards.length - 1) / 2) * 26, y: 0, opacity: 1, rotate: 0 }}
              transition={{ delay: i * 0.12, type: 'spring', stiffness: 240, damping: 22 }}
              style={{ position: 'absolute', top: 0 }}
            >
              <PlayingCard card={card} faceDown={i === 1 && !revealed} />
            </motion.div>
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

function CardShoe({ shoe, decks, isMobile = false }: { shoe: Card[]; decks: number; isMobile?: boolean }) {
  const total = decks * 52;
  const visible = Math.max(1, Math.ceil((shoe.length / total) * 12));
  const w = isMobile ? 36 : 52;
  const h = isMobile ? 52 : 76;
  const cw = isMobile ? 32 : 46;
  const ch = isMobile ? 44 : 64;
  return (
    <div style={{ position: 'absolute', top: isMobile ? '2%' : '3.5%', right: '3%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, zIndex: 5 }}>
      <div style={{ position: 'relative', width: w, height: h }}>
        {Array.from({ length: visible }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute', top: i * 1.2, left: i % 2 === 0 ? 0 : 1,
            width: cw, height: ch,
            background: i % 2 === 0 ? '#0c4020' : '#0a3519',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }} />
        ))}
        <div style={{
          position: 'absolute', top: visible * 1.2, left: 2,
          width: cw, height: ch,
          background: 'linear-gradient(135deg,#0f5230 0%,#062010 100%)',
          border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: cw * 0.65, height: ch * 0.72, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, opacity: 0.25 }} />
        </div>
      </div>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.22)', fontFamily: 'sans-serif', letterSpacing: '0.08em' }}>
        {shoe.length}/{total}
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

/** Approximate card deal origin relative to a seat (for animation trajectory). */
function cardDealOrigin(seatXPct: number): { x: number; y: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  // Shoe is at right:4% of felt; felt = 106% vw → shoe is at ~96% of felt from left
  // Simplified: shoe ≈ 97% of vw
  const shoeX = vw * 0.97;
  const seatX  = vw * (seatXPct / 100);
  return {
    x: shoeX - seatX, // always positive (shoe is to the right of every seat)
    y: -320,           // shoe is always above — fixed approximation
  };
}

function SeatSpot({ seat, state, dispatch, seatIndex, config, selectedChip, seatXPct, isMobile = false }: {
  seat: Seat; state: any; dispatch: any; seatIndex: number;
  config: TableConfig; selectedChip: number;
  seatXPct: number; seatYPct: number; isMobile?: boolean;
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
  const canDouble    = !!activeHand && !hasNaturalBJ && state.bankroll >= activeHand.bet;

  // Split: first 2 matching cards, max 4 hands, bankroll available
  const canSplit     = !!activeHand && activeHand.cards.length === 2
                       && activeHand.cards[0].rank === activeHand.cards[1].rank
                       && state.bankroll >= activeHand.bet && seat.hands.length < 4;

  // Late surrender: first 2 cards only, not after a split
  const canSurrender = !!activeHand && activeHand.cards.length === 2 && !activeHand.isSplit;

  const origin = cardDealOrigin(seatXPct);

  // ── EMPTY SEAT ───────────────────────────────────────────────────────────
  if (!seat.isActive) {
    if (!isBettingPhase) return null;
    // Sit button is itself anchored at the arc point via translate(-50%,-50%)
    return (
      <div style={{ position: 'relative', width: 0, height: 0 }}>
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
  return (
    <div style={{ position: 'relative', width: 0, height: 0 }}>

      {/* ── CARDS ZONE (above bet circle) ── */}
      <div style={{
        position: 'absolute',
        bottom: 40,              // bottom of this div = 40px above arc centre
        left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6, alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        {seat.hands.map((hand: Hand, hIdx: number) => {
          const isThisHand = isPlayerTurn && seat.activeHandIndex === hIdx;
          const val = calculateHandValue(hand.cards);
          const handW = Math.max(62, 62 + (hand.cards.length - 1) * 17);
          const handH = Math.max(88, 88 + (hand.cards.length - 1) * 17);

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

              {/* Card fan */}
              <div style={{ position: 'relative', width: handW, height: handH }}>
                {hand.cards.map((card: Card, cIdx: number) => (
                  <motion.div
                    key={cIdx}
                    // Cards fly in FROM the shoe position (upper-right) to their
                    // stacked rest position. Leftmost seats have a larger x offset
                    // (shoe is further right relative to them) — this makes the
                    // right-to-left dealing order visually obvious.
                    initial={{ x: origin.x - cIdx * 17, y: origin.y, opacity: 0, rotate: -12 }}
                    animate={{ x: cIdx * 17, y: 0, opacity: 1, rotate: 0 }}
                    transition={{ type: 'tween', duration: 0.38, ease: 'easeOut' }}
                    style={{ position: 'absolute', top: 0 }}
                  >
                    <PlayingCard card={card} />
                  </motion.div>
                ))}
              </div>

              {/* Hand value badge */}
              {hand.cards.length > 0 && (
                <div style={{
                  background: 'rgba(0,0,0,0.72)',
                  border: `1px solid ${isThisHand ? 'rgba(212,168,32,0.75)' : 'rgba(255,255,255,0.13)'}`,
                  borderRadius: 12, padding: '2px 8px',
                  fontSize: 11, fontWeight: 700, fontFamily: 'sans-serif',
                  color: val.total > 21 ? '#e05050' : val.total === 21 ? '#d4a820' : 'rgba(255,255,255,0.82)',
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
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              style={{
                position: 'absolute',
                bottom: 40,
                left: '50%', transform: 'translateX(-50%)',
                zIndex: 80, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}
            >
              {/* Chip burst fires once on entry */}
              <ChipBurst amount={res.payout} />
            </motion.div>
          ))}
      </AnimatePresence>

      {/* Persistent "BONUS PAID" badge — stays visible during PLAYER_TURN */}
      {(() => {
        const immWins = (seat.sideBetResults || []).filter((r: any) => r.win && r.immediate);
        if (immWins.length === 0) return null;
        // Show during player turn (before settlement)
        const visible = state.phase === 'PLAYER_TURN' || state.phase === 'DEALER_TURN';
        if (!visible) return null;
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            style={{
              position: 'absolute',
              bottom: 40 + 180,   // float high above the cards
              left: '50%', transform: 'translateX(-50%)',
              zIndex: 60,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              pointerEvents: 'none',
            }}
          >
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'rgba(212,168,32,0.65)', fontFamily: 'sans-serif', marginBottom: 1,
            }}>Bonus Paid ✓</div>
            {immWins.map((res: any, i: number) => (
              <motion.div
                key={i}
                animate={{ boxShadow: ['0 0 8px rgba(212,168,32,0.4)', '0 0 20px rgba(212,168,32,0.8)', '0 0 8px rgba(212,168,32,0.4)'] }}
                transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                style={{
                  background: 'linear-gradient(135deg,#7a5a0e,#d4a820,#7a5a0e)',
                  borderRadius: 5, padding: '4px 12px',
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: '#000',
                  fontFamily: 'sans-serif', whiteSpace: 'nowrap',
                }}
              >
                {res.betName}  +${res.payout}
              </motion.div>
            ))}
          </motion.div>
        );
      })()}

      {/* SETTLEMENT wins (Super Sevens, Bust It, Insurance — end-of-round only):
          Flying chip burst + label when settlement results appear */}
      <AnimatePresence>
        {(seat.sideBetResults || [])
          .filter((r: any) => r.win && !r.immediate)
          .map((res: any, idx: number) => (
            <motion.div
              key={`sbr-end-${idx}`}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 1, 0], y: [0, -30, -55, -80] }}
              transition={{ duration: 1.8, delay: idx * 0.18, times: [0, 0.1, 0.75, 1] }}
              style={{
                position: 'absolute',
                bottom: 40,
                left: '50%', transform: 'translateX(-50%)',
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
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{
          position: 'absolute', bottom: 40 + 8,
          left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(4,8,5,0.97)', border: '1px solid rgba(212,168,32,0.5)',
          borderRadius: 8, padding: '10px 14px', textAlign: 'center',
          zIndex: 50, minWidth: 140, boxShadow: '0 6px 24px rgba(0,0,0,0.8)',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: '#d4a820', textTransform: 'uppercase', fontFamily: 'sans-serif', marginBottom: 5 }}>Insurance?</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif', marginBottom: 8 }}>Max ${Math.floor(currentBet / 2)}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => dispatch({ type: 'INSURANCE' })}
              style={{ flex: 1, padding: '4px 0', background: '#d4a820', color: '#000', fontWeight: 700, fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'sans-serif' }}>Buy</button>
            <button onClick={() => dispatch({ type: 'DECLINE_INSURANCE' })}
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
            style={{ position: 'absolute', bottom: -11, width: 7, height: 7, borderRadius: '50%', background: '#d4a820' }} />
        )}
      </motion.div>

      {/* ── BELOW ZONE: side bets (betting) or action buttons (player turn) ── */}

      {/* Side bet chips:
          Desktop — all seated spots show them (selected=full, others=compact).
          Mobile   — ONLY the selected seat shows them to avoid cramped overflow. */}
      {isBettingPhase && config.sideBets.filter(s => s !== 'insurance').length > 0 &&
       (!isMobile || isSelectedBet) && (
        <div
          style={{
            position: 'absolute', top: R + 10,
            left: '50%', transform: 'translateX(-50%)',
            display: 'flex', flexWrap: 'wrap', gap: isSelectedBet ? 6 : 4,
            justifyContent: 'center',
            width: isSelectedBet ? (isMobile ? 200 : 220) : 170,
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

      {/* Action buttons — appear below circle on player's turn, hidden on natural BJ */}
      <AnimatePresence>
        {isPlayerTurn && !hasNaturalBJ && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            style={{
              position: 'absolute', top: R + 8,
              left: '50%', transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
          >
            <div style={{ display: 'flex', gap: 4 }}>
              <button data-testid="button-hit"   onClick={() => dispatch({ type: 'HIT' })}   style={feltActionBtn(false, true)}>Hit</button>
              <button data-testid="button-stand" onClick={() => dispatch({ type: 'STAND' })} style={feltActionBtn(false, false)}>Stand</button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button data-testid="button-double"    onClick={() => canDouble    && dispatch({ type: 'DOUBLE' })}    style={feltActionBtn(!canDouble,    false)}>Double</button>
              <button data-testid="button-split"     onClick={() => canSplit     && dispatch({ type: 'SPLIT' })}     style={feltActionBtn(!canSplit,     false)}>Split</button>
              <button data-testid="button-surrender" onClick={() => canSurrender && dispatch({ type: 'SURRENDER' })} style={feltActionBtn(!canSurrender, false)}>Surr.</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Bar (simplified — chip tray + deal/next-round only)
// ─────────────────────────────────────────────────────────────────────────────

function ControlBar({ state, dispatch, playerName, config, selectedChip, setSelectedChip, canDeal, anyActive, isMobile = false }: {
  state: any; dispatch: any; playerName: string; config: TableConfig;
  selectedChip: number; setSelectedChip: (n: number) => void;
  canDeal: boolean; anyActive: boolean; isMobile?: boolean;
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
        background: 'rgba(1,4,2,0.98)',
        borderTop: '1px solid rgba(140,100,25,0.16)',
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
              <div style={{ display: 'flex', gap: 6 }}>
                <button data-testid="button-clear-bets" onClick={() => dispatch({ type: 'CLEAR_BETS' })} style={{ ...ghostBtn, padding: '6px 12px', fontSize: 10 }}>Clear</button>
                {canDeal && <button data-testid="button-deal" onClick={() => dispatch({ type: 'DEAL' })} style={{ ...goldBtn, padding: '6px 18px', fontSize: 10 }}>Deal</button>}
              </div>
            )}
            {state.phase === 'SETTLEMENT' && (state as any).settled && (
              <motion.button
                data-testid="button-next-round"
                onClick={() => dispatch({ type: 'NEXT_ROUND' })}
                animate={{ boxShadow: ['0 4px 14px rgba(212,168,32,0.3)', '0 4px 28px rgba(212,168,32,0.65)', '0 4px 14px rgba(212,168,32,0.3)'] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                style={{ ...goldBtn, padding: '6px 18px', fontSize: 10 }}
              >Next Round</motion.button>
            )}
            {state.phase === 'DEALING' && <div style={{ fontSize: 9, color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Dealing…</div>}
            {state.phase === 'INSURANCE' && <div style={{ fontSize: 9, color: 'rgba(212,168,32,0.6)', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Insurance at seat</div>}
            {state.phase === 'DEALER_TURN' && <div style={{ fontSize: 9, color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Dealer playing…</div>}
          </div>
        </div>

        {/* Row 2: chip tray (full width) */}
        {isBettingPhase && anyActive && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
            {CHIP_AMOUNTS.map(amount => (
              <div
                key={amount}
                data-testid={`chip-${amount}`}
                role="button" tabIndex={0}
                onClick={() => setSelectedChip(amount)}
                onKeyDown={e => e.key === 'Enter' && setSelectedChip(amount)}
                style={{
                  cursor: 'pointer', border: 'none', background: 'none',
                  transform: selectedChip === amount ? 'translateY(-6px) scale(1.12)' : 'scale(0.95)',
                  transition: 'transform 0.15s',
                  filter: selectedChip === amount ? 'drop-shadow(0 3px 10px rgba(255,255,255,0.3))' : 'none',
                }}
              >
                <Chip amount={amount} size={selectedChip === amount ? chipSelected : chipSize} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP LAYOUT ──────────────────────────────────────────────────────────
  return (
    <div style={{
      height: 118, flexShrink: 0,
      background: 'rgba(1,4,2,0.98)',
      borderTop: '1px solid rgba(140,100,25,0.16)',
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

      {/* Center: chip tray + deal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {isBettingPhase && anyActive && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
            {CHIP_AMOUNTS.map(amount => (
              <div
                key={amount}
                data-testid={`chip-${amount}`}
                role="button" tabIndex={0}
                onClick={() => setSelectedChip(amount)}
                onKeyDown={e => e.key === 'Enter' && setSelectedChip(amount)}
                style={{
                  cursor: 'pointer', padding: 0, border: 'none', background: 'none',
                  transform: selectedChip === amount ? 'translateY(-7px) scale(1.14)' : 'scale(0.95)',
                  transition: 'transform 0.15s',
                  filter: selectedChip === amount ? 'drop-shadow(0 4px 12px rgba(255,255,255,0.3))' : 'none',
                }}
              >
                <Chip amount={amount} size={selectedChip === amount ? chipSelected : chipSize} />
              </div>
            ))}
          </div>
        )}
        {state.phase === 'BETTING' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid="button-clear-bets" onClick={() => dispatch({ type: 'CLEAR_BETS' })} style={ghostBtn}>Clear Bets</button>
            {canDeal && <button data-testid="button-deal" onClick={() => dispatch({ type: 'DEAL' })} style={goldBtn}>Deal</button>}
          </div>
        )}
        {state.phase === 'SETTLEMENT' && (state as any).settled && (
          <motion.button
            data-testid="button-next-round"
            onClick={() => dispatch({ type: 'NEXT_ROUND' })}
            animate={{ boxShadow: ['0 4px 14px rgba(212,168,32,0.3)', '0 4px 28px rgba(212,168,32,0.65)', '0 4px 14px rgba(212,168,32,0.3)'] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            style={goldBtn}
          >Next Round</motion.button>
        )}
        {state.phase === 'DEALING'     && <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif' }}>Dealing…</div>}
        {state.phase === 'INSURANCE'   && <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.6)', fontFamily: 'sans-serif' }}>Insurance offered — respond at your seat</div>}
        {state.phase === 'DEALER_TURN' && <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif' }}>Dealer's turn…</div>}
      </div>

      {/* Selected chip reminder */}
      <div style={{ minWidth: 90, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {isBettingPhase && anyActive && (
          <>
            <div style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', fontFamily: 'sans-serif' }}>Selected</div>
            <Chip amount={selectedChip} size={44} />
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'sans-serif' }}>Click seat to bet</div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const goldBtn: CSSProperties = {
  padding: '7px 26px', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
  fontWeight: 700, fontFamily: 'sans-serif',
  background: 'linear-gradient(135deg,#c49a10,#e6c038)',
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
    color: disabled ? 'rgba(255,255,255,0.18)' : primary ? '#d4a820' : '#f0e6c8',
    cursor: disabled ? 'default' : 'pointer',
    boxShadow: disabled ? 'none' : '0 2px 6px rgba(0,0,0,0.4)',
    transition: 'background 0.12s',
  };
}
