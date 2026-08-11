import { useState, useEffect, useReducer, useRef, useMemo, CSSProperties } from 'react';
import { useLocation, useParams } from 'wouter';
import { TABLES, TableConfig, Card, Hand, Seat, calculateHandValue, isBlackjack, SideBets } from '@/lib/blackjack';
import { GameState } from '@/lib/types';
import { gameReducer, createInitialState } from '@/lib/reducer';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { PlayingCard } from '@/components/PlayingCard';
import { Chip, ChipStack } from '@/components/Chip';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function getSeatPositions(n: number): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = 8 + t * 84;
    const tNorm = (t - 0.5) * 2;
    const y = 80 - 9 * tNorm * tNorm;
    return { x, y };
  });
}

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
    () => createInitialState(tableConfig!, initBankroll)
  );

  useEffect(() => {
    localStorage.setItem('bj_bankroll', state.bankroll.toString());
  }, [state.bankroll]);

  const dealingRef = useRef(false);

  // DEALING phase: sequentially deal cards
  useEffect(() => {
    if (state.phase === 'DEALING') {
      if (dealingRef.current) return;
      dealingRef.current = true;
      const activeSeats = (state.seats as Seat[]).filter(s => s.isActive && s.hands.length > 0);
      (async () => {
        // First card to each player
        for (const seat of activeSeats) {
          dispatch({ type: 'CARD_DEALT', to: 'player', seatId: seat.id });
          await sleep(280);
        }
        // Dealer first card (face up)
        dispatch({ type: 'CARD_DEALT', to: 'dealer' });
        await sleep(280);
        // Second card to each player
        for (const seat of activeSeats) {
          dispatch({ type: 'CARD_DEALT', to: 'player', seatId: seat.id });
          await sleep(280);
        }
        // Dealer hole card (face down)
        dispatch({ type: 'CARD_DEALT', to: 'dealer' });
        await sleep(500);
        dispatch({ type: 'CHECK_DEALER_BJ' });
      })();
    } else {
      dealingRef.current = false;
    }
  }, [state.phase]);

  // DEALER_TURN: compute all dealer draws at once
  useEffect(() => {
    if (state.phase !== 'DEALER_TURN') return;
    const t = setTimeout(() => dispatch({ type: 'DEALER_PLAY' }), 1100);
    return () => clearTimeout(t);
  }, [state.phase]);

  // SETTLEMENT: trigger computation
  useEffect(() => {
    if (state.phase === 'SETTLEMENT' && !(state as any).settled) {
      const t = setTimeout(() => dispatch({ type: 'PERFORM_SETTLEMENT' }), 400);
      return () => clearTimeout(t);
    }
  }, [state.phase, (state as any).settled]);

  if (!tableConfig) {
    setLocation('/');
    return null;
  }

  const seatPositions = getSeatPositions(tableConfig.seats);
  const shoeRemaining = state.shoe.length;
  const shoeTotal = tableConfig.decks * 52;
  const shoePct = Math.max(5, (shoeRemaining / shoeTotal) * 100);

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#020605',
      overflow: 'hidden',
      userSelect: 'none',
      fontFamily: "'Playfair Display', serif",
      color: '#f0e6c8',
    }}>
      {/* ── HEADER ── */}
      <header style={{
        height: 46,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: 'rgba(2,5,3,0.98)',
        borderBottom: '1px solid rgba(160,120,40,0.2)',
        zIndex: 30,
      }}>
        <button
          data-testid="button-leave"
          onClick={() => setLocation('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            color: 'rgba(240,230,200,0.5)',
            fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
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
          <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,230,200,0.3)', fontFamily: 'sans-serif', marginTop: 1 }}>
            {tableConfig.decks} Deck{tableConfig.decks > 1 ? 's' : ''} · ${tableConfig.minBet}–${tableConfig.maxBet}
          </div>
        </div>

        {/* Shoe gauge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', fontFamily: 'sans-serif', letterSpacing: '0.1em' }}>Shoe</div>
          <div style={{ width: 48, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <motion.div animate={{ width: `${shoePct}%` }} transition={{ duration: 0.5 }}
              style={{ height: '100%', background: '#d4a820', borderRadius: 3 }}
            />
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'sans-serif' }}>{shoeRemaining}</div>
        </div>
      </header>

      {/* ── GAME AREA ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#010403' }}>

        {/* FELT TABLE */}
        <div style={{
          position: 'absolute',
          top: 0, left: '-3%', right: '-3%',
          bottom: '1%',
          background: 'radial-gradient(ellipse 100% 80% at 50% 15%, #20844a 0%, #15633a 35%, #0d4a28 60%, #083318 88%, #051e10 100%)',
          borderRadius: '0 0 50% 50% / 0 0 18% 18%',
          borderBottom: '22px solid #221005',
          borderLeft: '8px solid #1a0c04',
          borderRight: '8px solid #1a0c04',
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.55), 0 12px 50px rgba(0,0,0,0.9)',
          zIndex: 1,
        }}>

          {/* ── Felt rules text ── */}
          <div style={{
            position: 'absolute',
            top: '33%', left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 2,
          }}>
            <div style={{ fontStyle: 'italic', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.08)', fontSize: 'clamp(13px,1.8vw,21px)', textTransform: 'uppercase' }}>
              Blackjack Pays 3 to 2
            </div>
            <div style={{ color: 'rgba(255,255,255,0.055)', fontSize: 'clamp(8px,1vw,12px)', letterSpacing: '0.14em', marginTop: 4, fontFamily: 'sans-serif', fontStyle: 'normal', textTransform: 'uppercase' }}>
              Dealer Must Draw to 16 and Stand on All 17s
            </div>
            <div style={{ color: 'rgba(255,255,255,0.05)', fontSize: 'clamp(7px,0.9vw,11px)', letterSpacing: '0.12em', marginTop: 3, fontFamily: 'sans-serif', fontStyle: 'italic', textTransform: 'uppercase' }}>
              Insurance Pays 2 to 1
            </div>
          </div>

          {/* ── DEALER ZONE ── */}
          <DealerZone state={state} />

          {/* ── CARD SHOE ── */}
          <CardShoe shoe={state.shoe} decks={tableConfig.decks} />

          {/* ── SEATS along bottom arc ── */}
          {seatPositions.map(({ x, y }, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: state.activeSeatIndex === i ? 20 : 10,
              }}
            >
              <SeatSpot
                seat={state.seats[i]}
                state={state}
                dispatch={dispatch}
                seatIndex={i}
                config={tableConfig}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── CONTROL BAR ── */}
      <ControlBar state={state} dispatch={dispatch} playerName={playerName} config={tableConfig} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DealerZone({ state }: { state: any }) {
  const dealerCards: Card[] = state.dealerCards || [];
  const revealed = ['DEALER_TURN', 'SETTLEMENT'].includes(state.phase) || state.dealerStatus === 'blackjack';
  const val = revealed && dealerCards.length > 0 ? calculateHandValue(dealerCards) : null;

  return (
    <div style={{
      position: 'absolute',
      top: '3%', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      zIndex: 5,
    }}>
      <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', fontFamily: 'sans-serif' }}>
        Dealer
      </div>

      {/* Dealer cards */}
      <div style={{ position: 'relative', minWidth: 80, height: 96, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        <AnimatePresence>
          {dealerCards.map((card, i) => {
            const faceDown = i === 1 && !revealed;
            return (
              <motion.div
                key={`dc-${i}`}
                initial={{ x: 100, y: -80, opacity: 0, rotate: 12 }}
                animate={{ x: (i - (dealerCards.length - 1) / 2) * 26, y: 0, opacity: 1, rotate: 0 }}
                transition={{ delay: i * 0.12, type: 'spring', stiffness: 260, damping: 23 }}
                style={{ position: 'absolute', top: 0 }}
              >
                <PlayingCard card={card} faceDown={faceDown} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Value badge */}
      {val && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: `1px solid ${state.dealerStatus === 'busted' ? 'rgba(220,60,60,0.5)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 20, padding: '2px 10px',
            fontSize: 12, fontWeight: 700, fontFamily: 'sans-serif',
            color: state.dealerStatus === 'busted' ? '#e05050' : 'rgba(255,255,255,0.7)',
          }}
        >
          {state.dealerStatus === 'blackjack' ? 'BLACKJACK' : state.dealerStatus === 'busted' ? `BUST (${val.total})` : val.total}
          {val.soft && val.total < 21 && state.dealerStatus !== 'busted' ? ' soft' : ''}
        </motion.div>
      )}

      {/* Phase hints */}
      {state.phase === 'SEAT_SELECTION' && (
        <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.7)', fontFamily: 'sans-serif' }}>
          Select a seat to join
        </div>
      )}
      {state.phase === 'BETTING' && (
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.5)', fontFamily: 'sans-serif' }}>
          Place your bets
        </div>
      )}
      {state.phase === 'DEALER_TURN' && (
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.5)', fontFamily: 'sans-serif' }}>
          Dealer playing…
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CardShoe({ shoe, decks }: { shoe: Card[]; decks: number }) {
  const total = decks * 52;
  const visible = Math.max(1, Math.ceil((shoe.length / total) * 12));

  return (
    <div style={{
      position: 'absolute', top: '3.5%', right: '4%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      zIndex: 5,
    }}>
      {/* Shoe box */}
      <div style={{
        position: 'relative',
        width: 52, height: 76,
      }}>
        {Array.from({ length: visible }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: i * 1.2,
            left: i % 2 === 0 ? 0 : 1,
            width: 46,
            height: 64,
            background: i % 2 === 0 ? '#0c4020' : '#0a3519',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }} />
        ))}
        {/* Top face-down card */}
        <div style={{
          position: 'absolute', top: visible * 1.2, left: 2,
          width: 46, height: 64,
          background: 'linear-gradient(135deg, #0f5230 0%, #062010 100%)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 30, height: 46, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, opacity: 0.25 }} />
        </div>
      </div>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', fontFamily: 'sans-serif', letterSpacing: '0.08em' }}>
        {shoe.length}/{total}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SeatSpot({ seat, state, dispatch, seatIndex, config }: {
  seat: Seat;
  state: any;
  dispatch: any;
  seatIndex: number;
  config: TableConfig;
}) {
  const isPlayerTurn = state.phase === 'PLAYER_TURN' && state.activeSeatIndex === seatIndex;
  const isBetting = state.phase === 'BETTING' || state.phase === 'SEAT_SELECTION';
  const isSelectedBetSeat = state.bettingSeatId === seatIndex;
  const currentBet = seat.hands[0]?.bet || 0;

  if (!seat.isActive) {
    if (!isBetting) return null;
    return (
      <motion.button
        data-testid={`button-sit-${seatIndex}`}
        onClick={() => {
          dispatch({ type: 'SIT', seatId: seatIndex });
          dispatch({ type: 'SELECT_BET_SEAT', seatId: seatIndex });
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.96 }}
        style={{
          width: 66, height: 66, borderRadius: '50%',
          border: '2px dashed rgba(255,255,255,0.28)',
          background: 'rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'rgba(255,255,255,0.4)', gap: 1,
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
        <span style={{ fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>Sit</span>
      </motion.button>
    );
  }

  const activeHand = seat.hands[seat.activeHandIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>

      {/* Insurance prompt */}
      {state.phase === 'INSURANCE' && state.activeSeatIndex === seatIndex && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{
            position: 'absolute',
            bottom: '110%', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(6,10,8,0.97)',
            border: '1px solid rgba(212,168,32,0.5)',
            borderRadius: 8, padding: '10px 14px',
            textAlign: 'center', zIndex: 50,
            minWidth: 140,
            boxShadow: '0 6px 24px rgba(0,0,0,0.8)',
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: '#d4a820', textTransform: 'uppercase', fontFamily: 'sans-serif', marginBottom: 5 }}>
            Insurance?
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif', marginBottom: 8 }}>
            Max ${Math.floor(currentBet / 2)}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => dispatch({ type: 'INSURANCE' })}
              style={{ flex: 1, padding: '4px 0', background: '#d4a820', color: '#000', fontWeight: 700, fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer', letterSpacing: '0.1em', fontFamily: 'sans-serif' }}>
              Buy
            </button>
            <button onClick={() => dispatch({ type: 'DECLINE_INSURANCE' })}
              style={{ flex: 1, padding: '4px 0', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.65)', fontWeight: 700, fontSize: 10, borderRadius: 4, border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', fontFamily: 'sans-serif' }}>
              Skip
            </button>
          </div>
        </motion.div>
      )}

      {/* Player hands (cards) */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {seat.hands.map((hand: Hand, hIdx: number) => {
          const isThisHand = isPlayerTurn && seat.activeHandIndex === hIdx;
          const val = calculateHandValue(hand.cards);

          return (
            <div key={hand.id} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              opacity: state.phase === 'PLAYER_TURN' && !isThisHand ? 0.6 : 1,
              transition: 'opacity 0.25s',
            }}>
              {/* Result badge */}
              <AnimatePresence>
                {hand.result && (
                  <motion.div
                    key={`res-${hand.id}`}
                    initial={{ opacity: 0, scale: 0.5, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 4,
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      textTransform: 'uppercase', fontFamily: 'sans-serif',
                      whiteSpace: 'nowrap',
                      ...(hand.result === 'blackjack_win'
                        ? { background: 'rgba(212,168,32,0.92)', color: '#000', border: '1px solid #d4a820' }
                        : hand.result === 'win'
                        ? { background: 'rgba(25,110,55,0.92)', color: '#fff', border: '1px solid rgba(50,180,80,0.5)' }
                        : hand.result === 'push'
                        ? { background: 'rgba(70,70,70,0.92)', color: '#ddd', border: '1px solid rgba(150,150,150,0.4)' }
                        : hand.result === 'surrender'
                        ? { background: 'rgba(140,90,10,0.92)', color: '#fff', border: '1px solid rgba(180,140,40,0.5)' }
                        : { background: 'rgba(120,20,20,0.92)', color: '#fff', border: '1px solid rgba(200,50,50,0.4)' }),
                    }}
                  >
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
              <div style={{
                position: 'relative',
                height: Math.max(88, 88 + (hand.cards.length - 1) * 17),
                width: Math.max(62, 62 + (hand.cards.length - 1) * 17),
              }}>
                {hand.cards.map((card: Card, cIdx: number) => (
                  <motion.div
                    key={cIdx}
                    initial={{ x: 90, y: -80, opacity: 0, rotate: 18 }}
                    animate={{ x: cIdx * 17, y: 0, opacity: 1, rotate: 0 }}
                    transition={{ delay: cIdx * 0.07, type: 'spring', stiffness: 300, damping: 26 }}
                    style={{ position: 'absolute', top: 0 }}
                  >
                    <PlayingCard card={card} />
                  </motion.div>
                ))}
              </div>

              {/* Hand value badge */}
              {hand.cards.length > 0 && (
                <div style={{
                  background: 'rgba(0,0,0,0.68)',
                  border: `1px solid ${isThisHand ? 'rgba(212,168,32,0.7)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 12, padding: '2px 8px',
                  fontSize: 11, fontWeight: 700, fontFamily: 'sans-serif',
                  color: val.total > 21
                    ? '#e05050'
                    : val.total === 21
                    ? '#d4a820'
                    : 'rgba(255,255,255,0.78)',
                }}>
                  {val.total}
                  {val.soft && val.total < 21 ? `/${val.total - 10}` : ''}
                  {val.total > 21 ? ' bust' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Side bet result tags */}
      <AnimatePresence>
        {(seat.sideBetResults || []).filter((r: any) => r.win).map((res: any, idx: number) => (
          <motion.div
            key={`sbr-${idx}`}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            style={{
              fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#d4a820', fontFamily: 'sans-serif', fontWeight: 700,
            }}
          >
            {res.betName} +${res.payout}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Seat circle with bet chips */}
      <motion.div
        data-testid={`seat-${seatIndex}`}
        onClick={() => {
          if (state.phase === 'BETTING') dispatch({ type: 'SELECT_BET_SEAT', seatId: seatIndex });
        }}
        animate={{
          boxShadow: isPlayerTurn
            ? ['0 0 0 3px rgba(212,168,32,0.9), 0 0 22px rgba(212,168,32,0.5)', '0 0 0 4px rgba(212,168,32,0.6), 0 0 30px rgba(212,168,32,0.3)', '0 0 0 3px rgba(212,168,32,0.9), 0 0 22px rgba(212,168,32,0.5)']
            : isSelectedBetSeat
            ? '0 0 0 2px rgba(212,168,32,0.5), 0 0 12px rgba(212,168,32,0.2)'
            : '0 0 0 2px rgba(255,255,255,0.14)',
        }}
        transition={{ repeat: isPlayerTurn ? Infinity : 0, duration: 1.5 }}
        style={{
          width: 66, height: 66, borderRadius: '50%',
          background: isPlayerTurn
            ? 'rgba(212,168,32,0.1)'
            : 'rgba(0,0,0,0.3)',
          cursor: state.phase === 'BETTING' ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        {currentBet > 0 ? (
          <ChipStack amount={currentBet} />
        ) : (
          <span style={{
            fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.22)', fontFamily: 'sans-serif', fontWeight: 700,
          }}>Bet</span>
        )}

        {/* Insurance indicator */}
        {(seat.sideBets as any).insurance > 0 && (
          <div style={{
            position: 'absolute', top: -6, right: -6,
            width: 20, height: 20, borderRadius: '50%',
            background: '#112299', border: '1px solid #4466ee',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, color: '#fff', fontWeight: 700, fontFamily: 'sans-serif',
          }}>IN</div>
        )}
      </motion.div>

      {/* Inline action buttons when it's this seat's turn */}
      <AnimatePresence>
        {isPlayerTurn && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              marginTop: 4,
            }}
          >
            {/* Turn indicator */}
            <div style={{
              fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'rgba(212,168,32,0.7)', fontFamily: 'sans-serif', fontWeight: 700,
            }}>Your turn</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const CHIP_AMOUNTS = [1, 5, 25, 100, 500];

function ControlBar({ state, dispatch, playerName, config }: {
  state: any;
  dispatch: any;
  playerName: string;
  config: TableConfig;
}) {
  const [selectedChip, setSelectedChip] = useState(25);

  const activeSeat: Seat | undefined = state.seats[state.activeSeatIndex];
  const activeHand: Hand | undefined = activeSeat?.hands[activeSeat?.activeHandIndex];
  const currentBet = activeHand?.bet ?? 0;

  const canDouble = !!activeHand && activeHand.cards.length === 2 && state.bankroll >= currentBet;
  const canSplit = !!activeHand &&
    activeHand.cards.length === 2 &&
    activeHand.cards[0].rank === activeHand.cards[1].rank &&
    state.bankroll >= currentBet &&
    (activeSeat?.hands.length ?? 0) < 4;
  const canSurrender = !!activeHand && activeHand.cards.length === 2;
  const canDeal = (state.seats as Seat[]).some(s => s.isActive && (s.hands[0]?.bet ?? 0) >= config.minBet);
  const anyActive = (state.seats as Seat[]).some(s => s.isActive);

  const handleChipClick = (amount: number) => {
    setSelectedChip(amount);
    const bettingSeatId = state.bettingSeatId;
    if (state.phase === 'BETTING' && bettingSeatId !== undefined) {
      dispatch({ type: 'PLACE_BET', seatId: bettingSeatId, amount });
    }
  };

  const sideBetoptions = config.sideBets.filter(sb => sb !== 'insurance');
  const sideBetLabels: Record<string, string> = {
    perfectPairs: 'Pairs',
    twentyOnePlusThree: '21+3',
    luckyLadies: 'Lucky Q',
    superSevens: '7s',
    luckyLucky: 'Lucky',
    royalMatch: 'Royal',
    bustIt: 'Bust It',
  };

  return (
    <div style={{
      height: 118,
      flexShrink: 0,
      background: 'rgba(2,5,3,0.98)',
      borderTop: '1px solid rgba(150,110,30,0.18)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 14px',
      gap: 10,
      zIndex: 30,
    }}>

      {/* ── LEFT: Bankroll ── */}
      <div style={{ minWidth: 110, flexShrink: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,230,200,0.35)', fontFamily: 'sans-serif' }}>
          {playerName}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#d4a820', fontFamily: 'sans-serif', letterSpacing: '-0.01em', marginTop: 2 }}>
          ${state.bankroll.toLocaleString()}
        </div>
        {state.bankroll < config.minBet && state.phase === 'BETTING' && (
          <button
            onClick={() => dispatch({ type: 'ADD_BANKROLL', amount: 1000 })}
            style={{
              marginTop: 4, fontSize: 9, color: '#d4a820', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              background: 'none', border: '1px solid rgba(212,168,32,0.4)',
              borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'sans-serif',
            }}
          >+$1,000</button>
        )}
      </div>

      {/* ── CENTER: Main controls ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>

        {/* Chip tray (betting phase) */}
        {(state.phase === 'BETTING' || state.phase === 'SEAT_SELECTION') && anyActive && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
            {CHIP_AMOUNTS.map(amount => (
              <div
                key={amount}
                data-testid={`chip-${amount}`}
                role="button"
                tabIndex={0}
                onClick={() => handleChipClick(amount)}
                onKeyDown={e => e.key === 'Enter' && handleChipClick(amount)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                  transform: selectedChip === amount ? 'translateY(-7px) scale(1.14)' : 'scale(0.95)',
                  transition: 'transform 0.15s',
                  filter: selectedChip === amount ? 'drop-shadow(0 4px 10px rgba(255,255,255,0.25))' : 'none',
                }}
              >
                <Chip amount={amount} size={selectedChip === amount ? 50 : 42} />
              </div>
            ))}
          </div>
        )}

        {/* Bet controls */}
        {state.phase === 'BETTING' && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <button
              data-testid="button-clear-bets"
              onClick={() => dispatch({ type: 'CLEAR_BETS' })}
              style={ghostBtn}
            >Clear</button>
            {canDeal && (
              <button
                data-testid="button-deal"
                onClick={() => dispatch({ type: 'DEAL' })}
                style={goldBtn}
              >Deal</button>
            )}
          </div>
        )}

        {/* Player action buttons */}
        {state.phase === 'PLAYER_TURN' && (
          <div style={{ display: 'flex', gap: 5 }}>
            <button data-testid="button-hit" onClick={() => dispatch({ type: 'HIT' })} style={actionBtn(false)}>Hit</button>
            <button data-testid="button-stand" onClick={() => dispatch({ type: 'STAND' })} style={actionBtn(false)}>Stand</button>
            <button data-testid="button-double" onClick={() => canDouble && dispatch({ type: 'DOUBLE' })} style={actionBtn(!canDouble)}>Double</button>
            <button data-testid="button-split" onClick={() => canSplit && dispatch({ type: 'SPLIT' })} style={actionBtn(!canSplit)}>Split</button>
            <button data-testid="button-surrender" onClick={() => canSurrender && dispatch({ type: 'SURRENDER' })} style={actionBtn(!canSurrender)}>Surr.</button>
          </div>
        )}

        {/* Next round */}
        {state.phase === 'SETTLEMENT' && (state as any).settled && (
          <motion.button
            data-testid="button-next-round"
            onClick={() => dispatch({ type: 'NEXT_ROUND' })}
            animate={{ boxShadow: ['0 4px 14px rgba(212,168,32,0.3)', '0 4px 24px rgba(212,168,32,0.6)', '0 4px 14px rgba(212,168,32,0.3)'] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            style={goldBtn}
          >Next Round</motion.button>
        )}

        {state.phase === 'INSURANCE' && (
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.7)', fontFamily: 'sans-serif' }}>
            Insurance offered — respond at your seat
          </div>
        )}

        {state.phase === 'DEALING' && (
          <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(212,168,32,0.45)', fontFamily: 'sans-serif' }}>
            Dealing…
          </div>
        )}
      </div>

      {/* ── RIGHT: Side bets ── */}
      <div style={{ minWidth: 120, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        {state.phase === 'BETTING' && state.bettingSeatId !== undefined && sideBetoptions.length > 0 && (
          <>
            <div style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', fontFamily: 'sans-serif' }}>Side Bets</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 130 }}>
              {sideBetoptions.map(sb => {
                const seat = state.bettingSeatId !== undefined ? state.seats[state.bettingSeatId] : null;
                const placed = seat ? ((seat.sideBets as any)[sb] || 0) : 0;
                return (
                  <button
                    key={sb}
                    data-testid={`sidebet-${sb}`}
                    onClick={() => {
                      if (state.bettingSeatId !== undefined) {
                        dispatch({ type: 'PLACE_SIDE_BET', seatId: state.bettingSeatId, betType: sb as keyof SideBets, amount: selectedChip });
                      }
                    }}
                    style={{
                      padding: '3px 7px', fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase',
                      fontWeight: 700, fontFamily: 'sans-serif',
                      background: placed > 0 ? 'rgba(212,168,32,0.22)' : 'rgba(255,255,255,0.05)',
                      border: placed > 0 ? '1px solid rgba(212,168,32,0.55)' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 4,
                      color: placed > 0 ? '#d4a820' : 'rgba(255,255,255,0.38)',
                      cursor: 'pointer',
                    }}
                    title={`$${selectedChip} on ${sb}`}
                  >
                    {sideBetLabels[sb] || sb}{placed > 0 ? ` $${placed}` : ''}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared button styles ──────────────────────────────────────────────────────
const goldBtn: CSSProperties = {
  padding: '7px 26px', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
  fontWeight: 700, fontFamily: 'sans-serif',
  background: 'linear-gradient(135deg, #c49a10, #e6c038)',
  border: 'none', borderRadius: 4, color: '#000', cursor: 'pointer',
  boxShadow: '0 2px 12px rgba(212,168,32,0.3)',
};

const ghostBtn: CSSProperties = {
  padding: '7px 16px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
  fontWeight: 700, fontFamily: 'sans-serif',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 4, color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
};

function actionBtn(disabled: boolean): CSSProperties {
  return {
    padding: '7px 14px', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
    fontWeight: 700, fontFamily: 'sans-serif',
    background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)',
    border: disabled ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.18)',
    borderRadius: 4,
    color: disabled ? 'rgba(255,255,255,0.18)' : '#f0e6c8',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'background 0.12s',
  };
}
