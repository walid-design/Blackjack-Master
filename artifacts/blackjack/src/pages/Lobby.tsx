import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { TABLES, TableConfig } from '@/lib/blackjack';
import { motion, AnimatePresence } from 'framer-motion';

// ── Card suit symbols ──────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];

const BG_SUITS: Array<{ suit: string; top: string; left: string; size: number; opacity: number; rot: string; anim: string; delay: number }> = [
  { suit: '♠', top: '6%',  left: '4%',  size: 110, opacity: 0.04, rot: '-14deg', anim: 'suit-float-slow', delay: 0 },
  { suit: '♥', top: '12%', left: '88%', size: 90,  opacity: 0.05, rot: '8deg',   anim: 'suit-float-med',  delay: 1.1 },
  { suit: '♦', top: '72%', left: '6%',  size: 80,  opacity: 0.04, rot: '10deg',  anim: 'suit-float-med',  delay: 0.7 },
  { suit: '♣', top: '65%', left: '90%', size: 100, opacity: 0.04, rot: '-6deg',  anim: 'suit-float-slow', delay: 1.8 },
  { suit: '♠', top: '38%', left: '2%',  size: 55,  opacity: 0.03, rot: '18deg',  anim: 'suit-float-med',  delay: 2.3 },
  { suit: '♥', top: '45%', left: '95%', size: 60,  opacity: 0.03, rot: '-12deg', anim: 'suit-float-slow', delay: 0.5 },
  { suit: '♦', top: '88%', left: '48%', size: 70,  opacity: 0.035,rot: '5deg',   anim: 'suit-float-med',  delay: 1.5 },
  { suit: '♣', top: '2%',  left: '55%', size: 65,  opacity: 0.03, rot: '-20deg', anim: 'suit-float-slow', delay: 2.8 },
];

// ── Table card accent colours ──────────────────────────────────────────────
const TABLE_ACCENTS: Record<string, { felt: string; glow: string; badge?: string }> = {
  classic:    { felt: 'from-[#0e3d20] to-[#072010]',       glow: 'rgba(34,197,94,0.12)' },
  downtown:   { felt: 'from-[#0f3825] to-[#061c10]',       glow: 'rgba(52,211,153,0.10)' },
  speed:      { felt: 'from-[#1a2f0a] to-[#0d1c04]',       glow: 'rgba(132,204,22,0.10)' },
  'high-roller': { felt: 'from-[#2a1a08] to-[#120c02]',    glow: 'rgba(234,179,8,0.15)',  badge: 'HIGH ROLLER' },
  'vegas-strip': { felt: 'from-[#1c0a2e] to-[#0c0418]',    glow: 'rgba(168,85,247,0.12)', badge: 'FEATURED' },
  vip:        { felt: 'from-[#1a0a08] to-[#0d0402]',       glow: 'rgba(239,68,68,0.12)',  badge: 'VIP ONLY' },
};

// ── Buy-in amounts ─────────────────────────────────────────────────────────
const BUY_INS = [500, 1_000, 5_000, 10_000, 50_000];

// ──────────────────────────────────────────────────────────────────────────
export default function Lobby() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName]   = useState('');
  const [buyIn, setBuyIn]             = useState<number>(1_000);
  const [hasVisited, setHasVisited]   = useState(false);
  const [bankroll, setBankroll]       = useState(0);
  const [nameError, setNameError]     = useState(false);

  useEffect(() => {
    const savedName     = localStorage.getItem('bj_player_name');
    const savedBankroll = localStorage.getItem('bj_bankroll');
    if (savedName && savedBankroll) {
      setPlayerName(savedName);
      setBankroll(parseInt(savedBankroll, 10));
      setHasVisited(true);
    }
  }, []);

  const handleEnterCasino = () => {
    if (!playerName.trim()) { setNameError(true); return; }
    localStorage.setItem('bj_player_name', playerName);
    localStorage.setItem('bj_bankroll', buyIn.toString());
    setBankroll(buyIn);
    setHasVisited(true);
    setNameError(false);
  };

  const handleJoinTable = (tableId: string) => setLocation(`/table/${tableId}`);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 120% 80% at 50% 0%, #1e2245 0%, #131729 55%, #0e1228 100%)' }}
    >
      {/* ── Decorative floating suits ── */}
      {BG_SUITS.map((s, i) => (
        <div
          key={i}
          className={s.anim}
          style={{
            position: 'absolute', top: s.top, left: s.left,
            fontSize: s.size, opacity: s.opacity,
            color: s.suit === '♥' || s.suit === '♦' ? '#f87171' : '#e2e8f0',
            '--rot': s.rot,
            animationDelay: `${s.delay}s`,
            pointerEvents: 'none', userSelect: 'none',
            lineHeight: 1,
          } as React.CSSProperties}
        >
          {s.suit}
        </div>
      ))}

      {/* ── Ambient glow orbs ── */}
      <div style={{
        position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
        width: 700, height: 400,
        background: 'radial-gradient(ellipse, rgba(240,184,48,0.11) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '5%', left: '20%',
        width: 400, height: 300,
        background: 'radial-gradient(ellipse, rgba(99,102,241,0.09) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* ── HERO HEADER ── */}
      <header className="relative z-10 flex flex-col items-center justify-center pt-14 pb-10 px-4">
        {/* Top rule */}
        <div className="flex items-center gap-4 mb-5">
          {SUITS.map((s, i) => (
            <span key={i} style={{
              fontSize: 13, opacity: 0.35,
              color: s === '♥' || s === '♦' ? '#f87171' : '#cbd5e1',
              letterSpacing: 2,
            }}>{s}</span>
          ))}
        </div>

        {/* Casino name */}
        <h1
          className="shimmer-text font-serif font-bold text-center leading-none tracking-wider"
          style={{ fontSize: 'clamp(36px, 7vw, 88px)', letterSpacing: '0.18em' }}
        >
          ROYAL ACE
        </h1>
        <div style={{
          fontSize: 'clamp(10px, 1.5vw, 14px)',
          letterSpacing: '0.55em',
          color: 'rgba(240,184,48,0.5)',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          marginTop: 8,
          textTransform: 'uppercase',
        }}>
          Casino &amp; Blackjack
        </div>

        {/* Bottom rule */}
        <div className="mt-6 flex items-center gap-3">
          <div style={{ width: 60, height: 1, background: 'linear-gradient(to right, transparent, rgba(240,184,48,0.35))' }} />
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(240,184,48,0.4)' }} />
          <div style={{ width: 60, height: 1, background: 'linear-gradient(to left, transparent, rgba(240,184,48,0.35))' }} />
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 pb-16 flex flex-col items-center">
        <AnimatePresence mode="wait">
          {!hasVisited ? (
            /* ── Welcome panel ── */
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.45, ease: [0.22, 0, 0.18, 1] }}
              style={{
                width: '100%', maxWidth: 420,
                background: 'rgba(24,28,54,0.90)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(240,184,48,0.20)',
                borderRadius: 16,
                padding: '36px 32px 32px',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.09), 0 24px 80px rgba(8,10,22,0.55), 0 0 60px rgba(240,184,48,0.06)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Top gold bar */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: 'linear-gradient(90deg, transparent, #f0b830 30%, #fde68a 50%, #f0b830 70%, transparent)',
              }} />

              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 24, fontWeight: 700,
                color: '#f5ead8', textAlign: 'center', marginBottom: 28,
                letterSpacing: '0.04em',
              }}>
                Welcome to the Floor
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {/* Name input */}
                <div>
                  <label style={{
                    display: 'block', fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: 'rgba(240,184,48,0.55)', marginBottom: 8,
                    fontFamily: 'Inter, sans-serif',
                  }}>Player Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={e => { setPlayerName(e.target.value); setNameError(false); }}
                    onKeyDown={e => e.key === 'Enter' && handleEnterCasino()}
                    placeholder="Enter your name"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.09)',
                      border: `1px solid ${nameError ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 8, padding: '13px 16px',
                      color: '#f5ead8', fontSize: 15,
                      fontFamily: "'Playfair Display', serif",
                      outline: 'none', transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(240,184,48,0.45)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = nameError ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.16)'; }}
                  />
                  {nameError && (
                    <p style={{ fontSize: 11, color: '#f87171', marginTop: 5, fontFamily: 'Inter, sans-serif' }}>
                      Please enter your name to continue.
                    </p>
                  )}
                </div>

                {/* Buy-in */}
                <div>
                  <label style={{
                    display: 'block', fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: 'rgba(240,184,48,0.55)', marginBottom: 8,
                    fontFamily: 'Inter, sans-serif',
                  }}>Initial Buy-In</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {BUY_INS.map(amount => (
                      <button
                        key={amount}
                        onClick={() => setBuyIn(amount)}
                        style={{
                          padding: '10px 4px',
                          borderRadius: 7,
                          border: `1px solid ${buyIn === amount ? 'rgba(240,184,48,0.7)' : 'rgba(255,255,255,0.08)'}`,
                          background: buyIn === amount
                            ? 'linear-gradient(135deg, rgba(240,184,48,0.22), rgba(253,230,138,0.10))'
                            : 'rgba(255,255,255,0.07)',
                          color: buyIn === amount ? '#f5cc50' : 'rgba(220,225,240,0.65)',
                          fontSize: 13, fontWeight: 600,
                          fontFamily: 'Inter, sans-serif',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          boxShadow: buyIn === amount ? '0 0 14px rgba(240,184,48,0.12)' : 'none',
                        }}
                      >
                        ${amount.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={handleEnterCasino}
                  style={{
                    width: '100%', padding: '15px',
                    marginTop: 4,
                    background: 'linear-gradient(135deg, #b8820a 0%, #e8b830 45%, #fde068 70%, #c89a18 100%)',
                    border: 'none', borderRadius: 9,
                    color: '#060610', fontSize: 12,
                    fontWeight: 700, letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer',
                    boxShadow: '0 4px 24px rgba(240,184,48,0.35), 0 0 0 1px rgba(255,255,255,0.08)',
                    transition: 'transform 0.12s, box-shadow 0.12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(240,184,48,0.5), 0 0 0 1px rgba(255,255,255,0.12)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = '0 4px 24px rgba(240,184,48,0.35), 0 0 0 1px rgba(255,255,255,0.08)';
                  }}
                >
                  Enter Casino
                </button>
              </div>
            </motion.div>

          ) : (
            /* ── Table lobby ── */
            <motion.div
              key="lobby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full flex flex-col items-center"
            >
              {/* Player greeting */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-10 text-center"
              >
                <p style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(240,184,48,0.4)', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>
                  Welcome back
                </p>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: '#f5ead8', marginBottom: 12 }}>
                  {playerName}
                </h2>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '8px 22px',
                  background: 'rgba(240,184,48,0.07)',
                  border: '1px solid rgba(240,184,48,0.18)',
                  borderRadius: 999,
                }}>
                  <span style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(240,184,48,0.5)', fontFamily: 'Inter, sans-serif' }}>Stack</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#f0b830', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em' }}>
                    ${bankroll.toLocaleString()}
                  </span>
                </div>
              </motion.div>

              {/* Section label */}
              <div className="flex items-center gap-4 mb-7 w-full max-w-5xl">
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', fontFamily: 'Inter, sans-serif', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Choose Your Table
                </span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>

              {/* Table grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-5xl">
                {TABLES.map((table, i) => (
                  <TableCard key={table.id} table={table} index={i} onJoin={() => handleJoinTable(table.id)} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ── TABLE CARD ─────────────────────────────────────────────────────────────
function TableCard({ table, index, onJoin }: { table: TableConfig; index: number; onJoin: () => void }) {
  const accent = TABLE_ACCENTS[table.id] ?? TABLE_ACCENTS['classic'];
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4, ease: [0.22, 0, 0.18, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: 'rgba(22,26,52,0.92)',
        border: `1px solid ${hovered ? 'rgba(240,184,48,0.25)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        cursor: 'pointer',
        boxShadow: hovered
          ? `0 20px 60px rgba(12,15,32,0.70), 0 0 40px ${accent.glow}`
          : '0 8px 30px rgba(15,18,38,0.35)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* Badge */}
      {accent.badge && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 10,
          padding: '3px 10px',
          background: 'rgba(12,15,32,0.70)',
          border: '1px solid rgba(240,184,48,0.35)',
          borderRadius: 999,
          fontSize: 8, fontWeight: 700, letterSpacing: '0.2em',
          color: '#f0b830', fontFamily: 'Inter, sans-serif',
        }}>
          {accent.badge}
        </div>
      )}

      {/* Felt header */}
      <div
        className={`bg-gradient-to-br ${accent.felt}`}
        style={{
          height: 88, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'flex-end',
          padding: '0 18px 14px',
        }}
      >
        {/* Felt texture lines */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)',
          pointerEvents: 'none',
        }} />
        {/* Decorative suit */}
        <div style={{
          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
          fontSize: 62, opacity: 0.09, color: '#fff',
          fontFamily: 'serif', lineHeight: 1, userSelect: 'none',
        }}>
          {['♠','♥','♦','♣'][index % 4]}
        </div>

        <div>
          <h3 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 20, fontWeight: 700,
            color: '#f5ead8', lineHeight: 1,
            textShadow: '0 1px 6px rgba(8,10,22,0.55)',
          }}>
            {table.name}
          </h3>
          <div style={{
            fontSize: 10, color: 'rgba(240,230,210,0.5)',
            fontFamily: 'Inter, sans-serif', marginTop: 3,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {table.decks} Deck{table.decks > 1 ? 's' : ''} · Dealer Stands 17s
          </div>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '16px 18px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Bet limits */}
        <div style={{
          display: 'flex', gap: 0,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          <div style={{ flex: 1, padding: '10px 14px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(240,184,48,0.45)', fontFamily: 'Inter, sans-serif', marginBottom: 3 }}>Min Bet</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#f5ead8', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em' }}>
              ${table.minBet.toLocaleString()}
            </div>
          </div>
          <div style={{ flex: 1, padding: '10px 14px', textAlign: 'right' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(240,184,48,0.45)', fontFamily: 'Inter, sans-serif', marginBottom: 3 }}>Max Bet</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#f5ead8', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em' }}>
              ${table.maxBet.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Side bets */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', fontFamily: 'Inter, sans-serif', marginBottom: 7 }}>
            Side Bets
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {table.sideBets.map(sb => (
              <span key={sb} style={{
                fontSize: 9, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '3px 8px',
                background: 'rgba(255,255,255,0.09)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                color: 'rgba(240,230,210,0.4)',
                fontFamily: 'Inter, sans-serif',
              }}>
                {formatSideBetName(sb)}
              </span>
            ))}
          </div>
        </div>

        {/* Join button */}
        <button
          onClick={onJoin}
          style={{
            width: '100%', padding: '12px',
            background: hovered
              ? 'linear-gradient(135deg, #b8820a 0%, #e8b830 45%, #fde068 70%, #c89a18 100%)'
              : 'rgba(240,184,48,0.09)',
            border: `1px solid ${hovered ? 'transparent' : 'rgba(240,184,48,0.22)'}`,
            borderRadius: 8,
            color: hovered ? '#060610' : '#f0b830',
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
            boxShadow: hovered ? '0 4px 20px rgba(240,184,48,0.3)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          Join Table
        </button>
      </div>
    </motion.div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatSideBetName(key: string) {
  const names: Record<string, string> = {
    insurance: 'Insurance', perfectPairs: 'Perfect Pairs',
    twentyOnePlusThree: '21+3', luckyLadies: 'Lucky Ladies',
    superSevens: 'Super 7s', luckyLucky: 'Lucky Lucky',
    royalMatch: 'Royal Match', bustIt: 'Bust It',
  };
  return names[key] || key;
}
