import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';

interface ChipProps {
  amount: number;
  size?: number;
  onClick?: () => void;
  disabled?: boolean;
}

export const CHIP_STYLES: Record<number, { bg: string; rim: string; text: string; stripes: string }> = {
  1:   { bg: '#e8e8e8', rim: '#b0b0b0', text: '#1a1a1a', stripes: '#c0c0c0' },
  5:   { bg: '#c41e1e', rim: '#8a0a0a', text: '#ffffff', stripes: '#e84040' },
  25:  { bg: '#1a8c3a', rim: '#0a5222', text: '#ffffff', stripes: '#3acc66' },
  100: { bg: '#1a3a9c', rim: '#0a1e66', text: '#ffffff', stripes: '#3c66e8' },
  500: { bg: '#8a1a8a', rim: '#550a55', text: '#ffffff', stripes: '#cc44cc' },
};

export function getChipStyle(amount: number) {
  const known = CHIP_STYLES[amount];
  if (known) return known;
  if (amount >= 1000) return { bg: '#2a2a2a', rim: '#111', text: '#d4a820', stripes: '#555' };
  return { bg: '#888', rim: '#444', text: '#fff', stripes: '#aaa' };
}

// ─── Single Chip ─────────────────────────────────────────────────────────────
export function Chip({ amount, size = 44, onClick, disabled }: ChipProps) {
  const style = getChipStyle(amount);
  const label = amount >= 1000 ? `${amount / 1000}k` : `${amount}`;
  const fontSize = size < 36 ? 8 : size < 44 ? 10 : 12;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        width: size, height: size, borderRadius: '50%',
        position: 'relative',
        border: `3px solid ${style.rim}`,
        background: style.bg,
        cursor: onClick && !disabled ? 'pointer' : 'default',
        boxShadow: `0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, padding: 0, outline: 'none', transition: 'transform 0.1s',
      }}
    >
      {[0, 60, 120, 180, 240, 300].map(angle => (
        <div key={angle} style={{
          position: 'absolute', width: '100%', height: 3,
          background: style.stripes, opacity: 0.6,
          top: '50%', left: 0, marginTop: -1.5,
          transform: `rotate(${angle}deg)`,
        }} />
      ))}
      <div style={{
        position: 'relative', zIndex: 1,
        width: size * 0.6, height: size * 0.6, borderRadius: '50%',
        background: style.bg, border: `2px solid ${style.rim}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `inset 0 1px 3px rgba(0,0,0,0.3)`,
      }}>
        <span style={{ fontSize, fontWeight: 800, color: style.text, fontFamily: 'Arial, sans-serif', letterSpacing: '-0.02em', lineHeight: 1 }}>{label}</span>
      </div>
    </button>
  );
}

// ─── Bet-circle chip stack (compact, fits inside 66px circle) ────────────────
const CHIP_DENOMINATIONS = [500, 100, 25, 5, 1];

export function ChipStack({ amount }: { amount: number }) {
  if (amount === 0) return null;
  const chips: number[] = [];
  let remaining = amount;
  for (const denom of CHIP_DENOMINATIONS) {
    while (remaining >= denom) {
      chips.push(denom);
      remaining -= denom;
      if (chips.length >= 6) break;
    }
    if (chips.length >= 6) break;
  }

  return (
    <div style={{ position: 'relative', width: 36, height: Math.min(36 + chips.length * 5, 62) }}>
      {chips.map((d, i) => {
        const s = getChipStyle(d);
        return (
          <div key={i} style={{
            position: 'absolute', bottom: i * 5, left: '50%',
            transform: 'translateX(-50%)',
            width: 34, height: 34, borderRadius: '50%',
            border: `2.5px solid ${s.rim}`, background: s.bg,
            boxShadow: i === chips.length - 1 ? `0 2px 4px rgba(0,0,0,0.5)` : `0 1px 2px rgba(0,0,0,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 8, fontWeight: 800, color: s.text, fontFamily: 'Arial, sans-serif' }}>
              {d >= 1000 ? `${d / 1000}k` : d}
            </span>
          </div>
        );
      })}
      <div style={{
        position: 'absolute', bottom: chips.length * 5 + 2, left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: '1px 5px',
        fontSize: 9, color: '#d4a820', fontWeight: 700, fontFamily: 'sans-serif',
        whiteSpace: 'nowrap', letterSpacing: '0.04em',
      }}>${amount}</div>
    </div>
  );
}

// ─── Side-bet chip button ─────────────────────────────────────────────────────
// Circular chip-style button for placing side bets on the felt
export function SideBetChip({
  label, amount, onClick,
}: { label: string; amount: number; onClick: () => void }) {
  const placed = amount > 0;
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.92 }}
      animate={placed ? { y: -4 } : { y: 0 }}
      style={{
        width: 48, height: 48, borderRadius: '50%', position: 'relative',
        border: `3px solid ${placed ? '#d4a820' : 'rgba(255,255,255,0.22)'}`,
        background: placed ? 'rgba(212,168,32,0.18)' : 'rgba(0,0,0,0.45)',
        cursor: 'pointer', outline: 'none', padding: 0,
        boxShadow: placed
          ? '0 0 0 2px rgba(212,168,32,0.4), 0 4px 14px rgba(212,168,32,0.3)'
          : '0 2px 6px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Rim stripes */}
      {[0, 60, 120].map(angle => (
        <div key={angle} style={{
          position: 'absolute', width: '100%', height: 2.5,
          background: placed ? 'rgba(212,168,32,0.4)' : 'rgba(255,255,255,0.12)',
          top: '50%', left: 0, marginTop: -1.25,
          transform: `rotate(${angle}deg)`,
        }} />
      ))}
      <span style={{
        position: 'relative', zIndex: 1,
        fontSize: 7.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
        color: placed ? '#d4a820' : 'rgba(255,255,255,0.55)',
        fontFamily: 'sans-serif', lineHeight: 1.1, textAlign: 'center',
        maxWidth: 38,
      }}>{label}</span>
      {placed && (
        <span style={{
          position: 'relative', zIndex: 1,
          fontSize: 8, fontWeight: 700, color: '#d4a820', fontFamily: 'sans-serif',
        }}>${amount}</span>
      )}
    </motion.button>
  );
}

// ─── Bankroll animated chip stack ─────────────────────────────────────────────
// Shows bankroll as a visual chip rack + animated counter that counts up/down
function countChips(amount: number): { denom: number; count: number }[] {
  const denoms = [500, 100, 25, 5, 1];
  const result: { denom: number; count: number }[] = [];
  let rem = amount;
  for (const d of denoms) {
    const c = Math.min(Math.floor(rem / d), 8); // max 8 per column
    if (c > 0) result.push({ denom: d, count: c });
    rem -= c * d;
  }
  return result;
}

interface BankrollStackProps {
  amount: number;
  low?: boolean; // bankroll below min bet
  onAddFunds?: () => void;
}

export function BankrollStack({ amount, low, onAddFunds }: BankrollStackProps) {
  const prev = useRef(amount);
  const [delta, setDelta] = useState<number | null>(null);
  const motionVal = useMotionValue(amount);
  const displayVal = useTransform(motionVal, v => `$${Math.round(v).toLocaleString()}`);

  useEffect(() => {
    const d = amount - prev.current;
    if (d !== 0) {
      setDelta(d);
      setTimeout(() => setDelta(null), 1200);
    }
    prev.current = amount;
    animate(motionVal, amount, { duration: 0.6, ease: 'easeOut' });
  }, [amount]);

  const stacks = countChips(Math.min(amount, 9999)); // cap visual to $9,999
  const isWin = delta !== null && delta > 0;
  const isLoss = delta !== null && delta < 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      {/* Animated dollar counter */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
        <motion.div
          style={{ fontSize: 22, fontWeight: 700, fontFamily: 'sans-serif', letterSpacing: '-0.01em' } as any}
          animate={{
            color: isWin ? '#4ade80' : isLoss ? '#f87171' : '#d4a820',
          }}
          transition={{ duration: 0.3 }}
        >
          {/* @ts-ignore */}
          <motion.span>{displayVal}</motion.span>
        </motion.div>

        {/* Flying delta badge */}
        <AnimatePresence>
          {delta !== null && (
            <motion.div
              key={`delta-${delta}`}
              initial={{ opacity: 1, y: 0, x: 0 }}
              animate={{ opacity: 0, y: isWin ? -28 : 28, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              style={{
                position: 'absolute', left: '100%', marginLeft: 6,
                fontSize: 11, fontWeight: 700, fontFamily: 'sans-serif',
                color: isWin ? '#4ade80' : '#f87171',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}
            >
              {isWin ? '+' : ''}{delta < 0 ? '-' : ''}${Math.abs(delta).toLocaleString()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Visual chip columns */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, minHeight: 52 }}>
        <AnimatePresence>
          {stacks.map(({ denom, count }) => {
            const s = getChipStyle(denom);
            return (
              <motion.div
                key={denom}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                style={{ position: 'relative', width: 28, height: 28 + count * 4 }}
              >
                {Array.from({ length: count }, (_, i) => (
                  <motion.div
                    key={i}
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 28 }}
                    style={{
                      position: 'absolute', bottom: i * 4, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 26, height: 26, borderRadius: '50%',
                      border: `2px solid ${s.rim}`, background: s.bg,
                      boxShadow: i === count - 1 ? '0 2px 5px rgba(0,0,0,0.6)' : '0 1px 2px rgba(0,0,0,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {i === count - 1 && (
                      <span style={{ fontSize: 6, fontWeight: 800, color: s.text, fontFamily: 'Arial' }}>
                        {denom >= 1000 ? `${denom / 1000}k` : denom}
                      </span>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {low && onAddFunds && (
        <motion.button
          onClick={onAddFunds}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
          style={{
            marginTop: 2, fontSize: 9, color: '#d4a820', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em', background: 'none',
            border: '1px solid rgba(212,168,32,0.4)', borderRadius: 4, padding: '2px 8px',
            cursor: 'pointer', fontFamily: 'sans-serif',
          }}
        >+$1,000</motion.button>
      )}
    </div>
  );
}

// ─── Flying-chip burst (side bet win rain) ────────────────────────────────────
// Renders N chips that burst from origin (0,0 in parent space) downward
export function ChipBurst({ amount, onDone }: { amount: number; onDone?: () => void }) {
  const denom = amount >= 500 ? 500 : amount >= 100 ? 100 : amount >= 25 ? 25 : amount >= 5 ? 5 : 1;
  const count = Math.min(5, Math.ceil(amount / denom));
  const s = getChipStyle(denom);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 100 }}>
      {Array.from({ length: count }, (_, i) => {
        const angle = -80 + i * (160 / Math.max(count - 1, 1));
        const dist  = 60 + Math.random() * 30;
        const dx    = Math.sin((angle * Math.PI) / 180) * dist;
        const dy    = Math.cos((angle * Math.PI) / 180) * -dist; // upward burst then gravity

        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.5, rotate: 0 }}
            animate={{
              x: [0, dx * 0.3, dx],
              y: [0, dy, dy + 120],  // arc up then fall down toward player
              opacity: [1, 1, 0],
              scale: [0.5, 1, 0.8],
              rotate: [0, angle * 0.8, angle * 1.5],
            }}
            transition={{ duration: 0.9, delay: i * 0.06, ease: 'easeIn', times: [0, 0.35, 1] }}
            onAnimationComplete={i === 0 ? onDone : undefined}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: 24, height: 24, borderRadius: '50%',
              border: `2px solid ${s.rim}`, background: s.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: -12, marginTop: -12,
            }}
          >
            <span style={{ fontSize: 6, fontWeight: 800, color: s.text, fontFamily: 'Arial' }}>
              {denom >= 1000 ? `${denom/1000}k` : denom}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
