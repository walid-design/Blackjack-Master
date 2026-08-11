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
import { Chip, ChipStack } from '@/components/Chip';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Parabolic arc: center seat lowest (closest to player), sides arc up
function getSeatPositions(n: number): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = 8 + t * 84;
    const tNorm = (t - 0.5) * 2;
    const y = 79 - 9 * tNorm * tNorm;
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

  const seatPositions = getSeatPositions(tableConfig.seats);
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
          <CardShoe shoe={state.shoe} decks={tableConfig.decks} />

          {/* Seats */}
          {seatPositions.map(({ x, y }, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${x}%`, top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: state.activeSeatIndex === i ? 20 : 10,
            }}>
              <SeatSpot
                seat={state.seats[i]}
                state={state}
                dispatch={dispatch}
                seatIndex={i}
                config={tableConfig}
                selectedChip={selectedChip}
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

function CardShoe({ shoe, decks }: { shoe: Card[]; decks: number }) {
  const total = decks * 52;
  const visible = Math.max(1, Math.ceil((shoe.length / total) * 12));
  return (
    <div style={{ position: 'absolute', top: '3.5%', right: '4%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, zIndex: 5 }}>
      <div style={{ position: 'relative', width: 52, height: 76 }}>
        {Array.from({ length: visible }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute', top: i * 1.2, left: i % 2 === 0 ? 0 : 1,
            width: 46, height: 64,
            background: i % 2 === 0 ? '#0c4020' : '#0a3519',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }} />
        ))}
        <div style={{
          position: 'absolute', top: visible * 1.2, left: 2,
          width: 46, height: 64,
          background: 'linear-gradient(135deg,#0f5230 0%,#062010 100%)',
          border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 30, height: 46, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, opacity: 0.25 }} />
        </div>
      </div>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.22)', fontFamily: 'sans-serif', letterSpacing: '0.08em' }}>
        {shoe.length}/{total}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Seat Spot (all per-seat UI: cards, bet circle, side bets, action buttons)
// ─────────────────────────────────────────────────────────────────────────────

function SeatSpot({ seat, state, dispatch, seatIndex, config, selectedChip }: {
  seat: Seat; state: any; dispatch: any; seatIndex: number;
  config: TableConfig; selectedChip: number;
}) {
  const isBettingPhase = state.phase === 'BETTING' || state.phase === 'SEAT_SELECTION';
  const isPlayerTurn   = state.phase === 'PLAYER_TURN' && state.activeSeatIndex === seatIndex;
  const isInsurance    = state.phase === 'INSURANCE'   && state.activeSeatIndex === seatIndex;
  const isSelectedBet  = state.bettingSeatId === seatIndex;
  const currentBet     = seat.hands[0]?.bet ?? 0;

  // Active hand info for action buttons
  const activeHand: Hand | undefined = seat.hands[seat.activeHandIndex];
  const canDouble    = !!activeHand && activeHand.cards.length === 2 && state.bankroll >= activeHand.bet;
  const canSplit     = !!activeHand && activeHand.cards.length === 2
                       && activeHand.cards[0].rank === activeHand.cards[1].rank
                       && state.bankroll >= activeHand.bet
                       && seat.hands.length < 4;
  const canSurrender = !!activeHand && activeHand.cards.length === 2;

  // Empty seat
  if (!seat.isActive) {
    if (!isBettingPhase) return null;
    return (
      <motion.button
        data-testid={`button-sit-${seatIndex}`}
        onClick={() => {
          dispatch({ type: 'SIT', seatId: seatIndex });
          dispatch({ type: 'SELECT_BET_SEAT', seatId: seatIndex });
        }}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
        style={{
          width: 66, height: 66, borderRadius: '50%',
          border: '2px dashed rgba(255,255,255,0.28)',
          background: 'rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'rgba(255,255,255,0.38)', gap: 1,
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
        <span style={{ fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>Sit</span>
      </motion.button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, position: 'relative' }}>

      {/* Insurance prompt */}
      {isInsurance && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{
          position: 'absolute', bottom: '108%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(4,8,5,0.97)', border: '1px solid rgba(212,168,32,0.5)',
          borderRadius: 8, padding: '10px 14px', textAlign: 'center',
          zIndex: 50, minWidth: 140, boxShadow: '0 6px 24px rgba(0,0,0,0.8)',
        }}>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: '#d4a820', textTransform: 'uppercase', fontFamily: 'sans-serif', marginBottom: 5 }}>Insurance?</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif', marginBottom: 8 }}>Max ${Math.floor(currentBet / 2)}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => dispatch({ type: 'INSURANCE' })}
              style={{ flex: 1, padding: '4px 0', background: '#d4a820', color: '#000', fontWeight: 700, fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'sans-serif' }}>
              Buy
            </button>
            <button onClick={() => dispatch({ type: 'DECLINE_INSURANCE' })}
              style={{ flex: 1, padding: '4px 0', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 10, borderRadius: 4, border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', fontFamily: 'sans-serif' }}>
              Skip
            </button>
          </div>
        </motion.div>
      )}

      {/* Player hands */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {seat.hands.map((hand: Hand, hIdx: number) => {
          const isThisHand = isPlayerTurn && seat.activeHandIndex === hIdx;
          const val = calculateHandValue(hand.cards);
          const handW = hand.cards.length <= 1 ? 62 : 62 + (hand.cards.length - 1) * 17;
          const handH = hand.cards.length <= 1 ? 88 : 88 + (hand.cards.length - 1) * 17;

          return (
            <div key={hand.id} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              opacity: state.phase === 'PLAYER_TURN' && !isThisHand ? 0.55 : 1,
              transition: 'opacity 0.25s',
            }}>
              {/* Result badge */}
              <AnimatePresence>
                {hand.result && (
                  <motion.div key={`res-${hand.id}`}
                    initial={{ opacity: 0, scale: 0.5, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    style={{
                      padding: '3px 9px', borderRadius: 4,
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      textTransform: 'uppercase', fontFamily: 'sans-serif', whiteSpace: 'nowrap',
                      ...(hand.result === 'blackjack_win'
                        ? { background: 'rgba(212,168,32,0.92)', color: '#000', border: '1px solid #d4a820' }
                        : hand.result === 'win'
                        ? { background: 'rgba(22,105,50,0.92)', color: '#fff', border: '1px solid rgba(40,160,80,0.5)' }
                        : hand.result === 'push'
                        ? { background: 'rgba(70,70,70,0.92)', color: '#ddd', border: '1px solid rgba(140,140,140,0.4)' }
                        : hand.result === 'surrender'
                        ? { background: 'rgba(130,85,10,0.92)', color: '#fff', border: '1px solid rgba(180,140,40,0.5)' }
                        : { background: 'rgba(115,18,18,0.92)', color: '#fff', border: '1px solid rgba(200,50,50,0.4)' }),
                    }}>
                    {hand.result === 'blackjack_win'
                      ? '♠ BLACKJACK'
                      : hand.result === 'win'
                      ? `WIN +$${hand.payout ?? hand.bet}`
                      : hand.result === 'push'
                      ? 'PUSH'
                      : hand.result === 'surrender'
                      ? 'SURRENDER'
                      : hand.result === 'bust'
                      ? 'BUST'
                      : `LOSE -$${hand.bet}`}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Cards */}
              <div style={{ position: 'relative', width: handW, height: handH }}>
                {hand.cards.map((card: Card, cIdx: number) => (
                  <motion.div
                    key={cIdx}
                    initial={{ x: 90, y: -80, opacity: 0, rotate: 18 }}
                    animate={{ x: cIdx * 17, y: 0, opacity: 1, rotate: 0 }}
                    transition={{ delay: cIdx * 0.07, type: 'spring', stiffness: 280, damping: 26 }}
                    style={{ position: 'absolute', top: 0 }}
                  >
                    <PlayingCard card={card} />
                  </motion.div>
                ))}
              </div>

              {/* Value badge */}
              {hand.cards.length > 0 && (
                <div style={{
                  background: 'rgba(0,0,0,0.7)',
                  border: `1px solid ${isThisHand ? 'rgba(212,168,32,0.75)' : 'rgba(255,255,255,0.13)'}`,
                  borderRadius: 12, padding: '2px 8px',
                  fontSize: 11, fontWeight: 700, fontFamily: 'sans-serif',
                  color: val.total > 21 ? '#e05050' : val.total === 21 ? '#d4a820' : 'rgba(255,255,255,0.8)',
                }}>
                  {val.total}{val.soft && val.total < 21 ? `/${val.total - 10}` : ''}{val.total > 21 ? ' bust' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Side-bet win badges */}
      <AnimatePresence>
        {(seat.sideBetResults || []).filter((r: any) => r.win).map((res: any, idx: number) => (
          <motion.div key={`sbr-${idx}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#d4a820', fontFamily: 'sans-serif', fontWeight: 700 }}>
            {res.betName} +${res.payout}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── BET CIRCLE ── */}
      <motion.div
        data-testid={`seat-${seatIndex}`}
        onClick={() => {
          if (state.phase === 'BETTING') {
            // Select this seat and add a chip with every click
            if (!isSelectedBet) dispatch({ type: 'SELECT_BET_SEAT', seatId: seatIndex });
            dispatch({ type: 'PLACE_BET', seatId: seatIndex, amount: selectedChip });
          } else if (state.phase === 'SEAT_SELECTION') {
            dispatch({ type: 'SELECT_BET_SEAT', seatId: seatIndex });
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
          width: 66, height: 66, borderRadius: '50%',
          background: isPlayerTurn ? 'rgba(212,168,32,0.1)' : 'rgba(0,0,0,0.3)',
          cursor: state.phase === 'BETTING' ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        {currentBet > 0 ? <ChipStack amount={currentBet} /> : (
          <span style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', fontFamily: 'sans-serif', fontWeight: 700 }}>
            {state.phase === 'BETTING' ? 'Tap' : 'Bet'}
          </span>
        )}

        {/* Insurance indicator */}
        {((seat.sideBets as any).insurance > 0) && (
          <div style={{
            position: 'absolute', top: -6, right: -6,
            width: 20, height: 20, borderRadius: '50%',
            background: '#112299', border: '1px solid #4466ee',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, color: '#fff', fontWeight: 700, fontFamily: 'sans-serif',
          }}>IN</div>
        )}

        {/* Active pulse dot */}
        {isPlayerTurn && (
          <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
            style={{ position: 'absolute', bottom: -10, width: 7, height: 7, borderRadius: '50%', background: '#d4a820' }}
          />
        )}
      </motion.div>

      {/* ── SIDE BET BUTTONS (on the felt, under bet circle, during BETTING) ── */}
      {isBettingPhase && isSelectedBet && config.sideBets.filter(s => s !== 'insurance').length > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', maxWidth: 160, marginTop: 3 }}>
          {config.sideBets.filter(s => s !== 'insurance').map(sb => {
            const placed = (seat.sideBets as any)[sb] ?? 0;
            return (
              <button key={sb}
                data-testid={`sidebet-${sb}`}
                onClick={() => dispatch({ type: 'PLACE_SIDE_BET', seatId: seatIndex, betType: sb as keyof SideBets, amount: selectedChip })}
                style={{
                  padding: '3px 7px', fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase',
                  fontWeight: 700, fontFamily: 'sans-serif',
                  background: placed > 0 ? 'rgba(212,168,32,0.22)' : 'rgba(0,0,0,0.4)',
                  border: placed > 0 ? '1px solid rgba(212,168,32,0.6)' : '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 4, color: placed > 0 ? '#d4a820' : 'rgba(255,255,255,0.45)',
                  cursor: 'pointer',
                }}>
                {SIDE_BET_LABELS[sb] || sb}{placed > 0 ? ` $${placed}` : ''}
              </button>
            );
          })}
        </motion.div>
      )}

      {/* ── ACTION BUTTONS (on the felt, below seat, during PLAYER_TURN) ── */}
      <AnimatePresence>
        {isPlayerTurn && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 6 }}
          >
            {/* Primary: Hit & Stand always visible */}
            <div style={{ display: 'flex', gap: 4 }}>
              <button data-testid="button-hit"   onClick={() => dispatch({ type: 'HIT' })}   style={feltActionBtn(false, true)}>Hit</button>
              <button data-testid="button-stand" onClick={() => dispatch({ type: 'STAND' })} style={feltActionBtn(false, false)}>Stand</button>
            </div>
            {/* Secondary: conditional options */}
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

function ControlBar({ state, dispatch, playerName, config, selectedChip, setSelectedChip, canDeal, anyActive }: {
  state: any; dispatch: any; playerName: string; config: TableConfig;
  selectedChip: number; setSelectedChip: (n: number) => void;
  canDeal: boolean; anyActive: boolean;
}) {
  const isBettingPhase = state.phase === 'BETTING' || state.phase === 'SEAT_SELECTION';

  return (
    <div style={{
      height: 100, flexShrink: 0,
      background: 'rgba(1,4,2,0.98)',
      borderTop: '1px solid rgba(140,100,25,0.16)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', gap: 10, zIndex: 30,
    }}>

      {/* Bankroll */}
      <div style={{ minWidth: 110, flexShrink: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,230,200,0.3)', fontFamily: 'sans-serif' }}>{playerName}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#d4a820', fontFamily: 'sans-serif', letterSpacing: '-0.01em', marginTop: 2 }}>
          ${state.bankroll.toLocaleString()}
        </div>
        {state.bankroll < config.minBet && isBettingPhase && (
          <button onClick={() => dispatch({ type: 'ADD_BANKROLL', amount: 1000 })}
            style={{ marginTop: 4, fontSize: 9, color: '#d4a820', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', background: 'none', border: '1px solid rgba(212,168,32,0.4)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'sans-serif' }}>
            +$1,000
          </button>
        )}
      </div>

      {/* Center: chip tray + deal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>

        {/* Chip denominations (select only — bet is placed by clicking seat circle) */}
        {(isBettingPhase) && anyActive && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
            {CHIP_AMOUNTS.map(amount => (
              <div
                key={amount}
                data-testid={`chip-${amount}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedChip(amount)}
                onKeyDown={e => e.key === 'Enter' && setSelectedChip(amount)}
                style={{
                  cursor: 'pointer', padding: 0, border: 'none', background: 'none',
                  transform: selectedChip === amount ? 'translateY(-7px) scale(1.14)' : 'scale(0.95)',
                  transition: 'transform 0.15s',
                  filter: selectedChip === amount ? 'drop-shadow(0 4px 12px rgba(255,255,255,0.3))' : 'none',
                }}
              >
                <Chip amount={amount} size={selectedChip === amount ? 50 : 42} />
              </div>
            ))}
          </div>
        )}

        {/* Bet-phase action row */}
        {state.phase === 'BETTING' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid="button-clear-bets" onClick={() => dispatch({ type: 'CLEAR_BETS' })} style={ghostBtn}>
              Clear Bets
            </button>
            {canDeal && (
              <button data-testid="button-deal" onClick={() => dispatch({ type: 'DEAL' })} style={goldBtn}>
                Deal
              </button>
            )}
          </div>
        )}

        {/* Next round */}
        {state.phase === 'SETTLEMENT' && (state as any).settled && (
          <motion.button
            data-testid="button-next-round"
            onClick={() => dispatch({ type: 'NEXT_ROUND' })}
            animate={{ boxShadow: ['0 4px 14px rgba(212,168,32,0.3)', '0 4px 28px rgba(212,168,32,0.65)', '0 4px 14px rgba(212,168,32,0.3)'] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            style={goldBtn}
          >
            Next Round
          </motion.button>
        )}

        {/* Status labels */}
        {state.phase === 'DEALING' && (
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif' }}>Dealing…</div>
        )}
        {state.phase === 'INSURANCE' && (
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.6)', fontFamily: 'sans-serif' }}>Insurance offered — respond at your seat</div>
        )}
        {state.phase === 'DEALER_TURN' && (
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.4)', fontFamily: 'sans-serif' }}>Dealer's turn…</div>
        )}
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
