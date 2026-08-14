import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';

interface ChipProps {
  amount: number;
  size?: number;
  onClick?: () => void;
  disabled?: boolean;
}

// ─── Casino chip colour system ────────────────────────────────────────────────
// Each chip has: bg (face midtone), rim, highlight (top-left sheen),
// shadow (bottom-right depth), text, spotA/spotB (6 alternating edge inlays).
export const CHIP_STYLES: Record<number, {
  bg: string; rim: string; highlight: string; shadow: string;
  text: string; spotA: string; spotB: string;
}> = {
  1: {
    bg: '#d2d2d2', rim: '#8a8a8a', highlight: '#f4f4f4', shadow: '#a0a0a0',
    text: '#111', spotA: '#bbbbbb', spotB: '#f0f0f0',
  },
  5: {
    bg: '#c01818', rim: '#780808', highlight: '#f04040', shadow: '#7a0000',
    text: '#fff', spotA: '#ff7070', spotB: '#8c0000',
  },
  25: {
    bg: '#1a7828', rim: '#0a4416', highlight: '#2ec84a', shadow: '#0a4018',
    text: '#fff', spotA: '#45d865', spotB: '#0d5020',
  },
  100: {
    bg: '#16163a', rim: '#08081e', highlight: '#2c2c60', shadow: '#080810',
    text: '#d4a820', spotA: '#d4a820', spotB: '#1e1e40',
  },
  500: {
    bg: '#680e7c', rim: '#3c0650', highlight: '#a828c8', shadow: '#380040',
    text: '#fff', spotA: '#d060ff', spotB: '#500060',
  },
};

export function getChipStyle(amount: number) {
  if (CHIP_STYLES[amount]) return CHIP_STYLES[amount];
  if (amount >= 1000) return {
    bg: '#1a1208', rim: '#0a0800', highlight: '#3a2810', shadow: '#100800',
    text: '#f0b830', spotA: '#f0b830', spotB: '#1a1208',
  };
  return {
    bg: '#444', rim: '#222', highlight: '#666', shadow: '#222',
    text: '#fff', spotA: '#888', spotB: '#333',
  };
}

// ─── Single Chip — SVG-based for crisp casino aesthetics ─────────────────────
export function Chip({ amount, size = 44, onClick, disabled }: ChipProps) {
  const style = getChipStyle(amount);
  const label = amount >= 1000 ? `${amount / 1000}k` : `${amount}`;
  const r = size / 2;
  const rimW = Math.max(3, size * 0.10);   // rim band width
  const innerR = r - rimW - 0.5;           // face radius
  const spotRadius = Math.max(1.8, size * 0.062); // edge inlay spot radius
  const fontSize = size < 32 ? size * 0.30 : size < 44 ? size * 0.27 : size * 0.24;
  const gradId = `cg${amount}s${Math.round(size)}`;
  const filterId = `sh${amount}s${Math.round(size)}`;

  // 6 edge spots evenly at 0°, 60°, 120°, 180°, 240°, 300° (top = 0°)
  const spotAngles = [0, 60, 120, 180, 240, 300];
  const spotsData = spotAngles.map(deg => {
    const rad = (deg - 90) * Math.PI / 180;
    const sr = r - rimW * 0.5;
    return { x: r + Math.cos(rad) * sr, y: r + Math.sin(rad) * sr };
  });

  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        width: size, height: size + 2,
        display: 'flex', alignItems: 'flex-start',
        background: 'none', border: 'none', padding: 0, outline: 'none',
        cursor: onClick && !disabled ? 'pointer' : 'default',
        flexShrink: 0, overflow: 'visible',
      }}
    >
      <svg
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          {/* Face radial gradient: sheen top-left → midtone → shadow bottom-right */}
          <radialGradient id={gradId} cx="36%" cy="30%" r="70%">
            <stop offset="0%"   stopColor={style.highlight} />
            <stop offset="50%"  stopColor={style.bg} />
            <stop offset="100%" stopColor={style.shadow} />
          </radialGradient>
          {/* Drop shadow filter */}
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.65" />
          </filter>
        </defs>

        {/* ── Outer rim (with shadow) ── */}
        <circle cx={r} cy={r} r={r - 0.5} fill={style.rim} filter={`url(#${filterId})`} />

        {/* ── Rim top-highlight (subtle bevel) ── */}
        <circle cx={r} cy={r} r={r - 0.5}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.2"
          strokeDasharray={`${(r - 0.5) * Math.PI} ${(r - 0.5) * Math.PI * 3}`}
          strokeDashoffset={`${(r - 0.5) * Math.PI * 0.5}`}
        />

        {/* ── 6 Edge inlay spots alternating spotA / spotB ── */}
        {spotsData.map((s, i) => (
          <circle key={i}
            cx={s.x} cy={s.y} r={spotRadius}
            fill={i % 2 === 0 ? style.spotA : style.spotB}
            stroke={style.rim} strokeWidth="0.4"
          />
        ))}

        {/* ── Face circle with gradient ── */}
        <circle cx={r} cy={r} r={innerR} fill={`url(#${gradId})`} />

        {/* ── Inner decorative rings ── */}
        <circle cx={r} cy={r} r={innerR - 1.5}
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" />
        <circle cx={r} cy={r} r={innerR * 0.60}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

        {/* ── Denomination label ── */}
        <text
          x={r} y={r + 0.5}
          textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize} fontWeight="900"
          fontFamily="Inter, Arial, sans-serif"
          fill={style.text}
          style={{ letterSpacing: '-0.5px' }}
        >
          {label}
        </text>

        {/* ── Face sheen: top-left quarter-arc gloss ── */}
        <path
          d={`M ${r - innerR * 0.1} ${r - innerR * 0.8}
              A ${innerR} ${innerR} 0 0 1 ${r + innerR * 0.72} ${r - innerR * 0.35}`}
          fill="none"
          stroke="rgba(255,255,255,0.13)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

// ─── Bet-circle chip stack (compact, fits inside 66 px circle) ───────────────
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
        const r = 17;
        const gradId = `cs${d}${i}`;
        return (
          <div key={i} style={{
            position: 'absolute', bottom: i * 5, left: '50%',
            transform: 'translateX(-50%)', width: 34, height: 34,
          }}>
            <svg width={34} height={34} viewBox="0 0 34 34" style={{ overflow: 'visible' }}>
              <defs>
                <radialGradient id={gradId} cx="36%" cy="30%" r="70%">
                  <stop offset="0%" stopColor={s.highlight} />
                  <stop offset="100%" stopColor={s.bg} />
                </radialGradient>
              </defs>
              <circle cx={r} cy={r} r={r - 0.5} fill={s.rim} />
              <circle cx={r} cy={r} r={r - 3.5} fill={`url(#${gradId})`} />
              {i === chips.length - 1 && (
                <text x={r} y={r + 0.5} textAnchor="middle" dominantBaseline="central"
                  fontSize="8" fontWeight="900" fontFamily="Inter, Arial, sans-serif"
                  fill={s.text}>
                  {d >= 1000 ? `${d / 1000}k` : d}
                </text>
              )}
            </svg>
          </div>
        );
      })}
      <div style={{
        position: 'absolute', bottom: chips.length * 5 + 2, left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: '1px 5px',
        fontSize: 9, color: '#d4a820', fontWeight: 700, fontFamily: 'sans-serif',
        whiteSpace: 'nowrap', letterSpacing: '0.04em',
      }}>{amount}</div>
    </div>
  );
}

// ─── Side-bet chip button ─────────────────────────────────────────────────────
export function SideBetChip({
  label, amount, onClick,
}: { label: string; amount: number; onClick: () => void }) {
  const placed = amount > 0;
  const rimColor = placed ? 'rgba(240,184,48,0.55)' : 'rgba(255,255,255,0.18)';

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.93 }}
      animate={placed ? { y: -4 } : { y: 0 }}
      style={{
        width: 52, height: 52, borderRadius: '50%', position: 'relative',
        border: `3px solid ${placed ? '#f0b830' : 'rgba(255,255,255,0.25)'}`,
        background: placed
          ? 'radial-gradient(circle, rgba(240,184,48,0.22) 0%, rgba(240,184,48,0.08) 100%)'
          : 'radial-gradient(circle, rgba(30,34,60,0.95) 0%, rgba(18,22,44,0.98) 100%)',
        cursor: 'pointer', outline: 'none', padding: 0,
        boxShadow: placed
          ? '0 0 0 2px rgba(240,184,48,0.3), 0 4px 16px rgba(240,184,48,0.25)'
          : '0 2px 8px rgba(0,0,0,0.55)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2,
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        overflow: 'hidden',
      }}
    >
      {/* Short rim tick marks */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
        <div key={angle} style={{
          position: 'absolute',
          width: 5, height: 2,
          background: rimColor,
          borderRadius: 1,
          top: '50%', left: '50%',
          marginTop: -1, marginLeft: -2.5,
          transformOrigin: 'center center',
          transform: `rotate(${angle}deg) translateX(20px)`,
        }} />
      ))}

      <div style={{
        position: 'relative', zIndex: 2,
        background: 'rgba(0,0,0,0.52)',
        borderRadius: 4,
        padding: '2px 4px',
        maxWidth: 44,
        textAlign: 'center',
      }}>
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase',
          color: placed ? '#f5cc50' : 'rgba(220,225,240,0.8)',
          fontFamily: 'Inter, sans-serif', lineHeight: 1.1,
          display: 'block',
        }}>{label}</span>
      </div>

      {placed && (
        <span style={{
          position: 'relative', zIndex: 2,
          fontSize: 8, fontWeight: 700, color: '#f0b830',
          fontFamily: 'Inter, sans-serif', lineHeight: 1,
        }}>${amount}</span>
      )}
    </motion.button>
  );
}

// ─── Bankroll animated chip stack ─────────────────────────────────────────────
function countChips(amount: number): { denom: number; count: number }[] {
  const denoms = [500, 100, 25, 5, 1];
  const result: { denom: number; count: number }[] = [];
  let rem = amount;
  for (const d of denoms) {
    const c = Math.min(Math.floor(rem / d), 8);
    if (c > 0) result.push({ denom: d, count: c });
    rem -= c * d;
  }
  return result;
}

interface BankrollStackProps {
  amount: number;
  low?: boolean;
  onAddFunds?: () => void;
}

export function BankrollStack({ amount, low, onAddFunds }: BankrollStackProps) {
  const prev = useRef(amount);
  const [delta, setDelta] = useState<number | null>(null);
  const motionVal = useMotionValue(amount);
  const displayVal = useTransform(motionVal, v => `${Math.round(v).toLocaleString()} chips`);

  useEffect(() => {
    const d = amount - prev.current;
    if (d !== 0) {
      setDelta(d);
      setTimeout(() => setDelta(null), 1200);
    }
    prev.current = amount;
    animate(motionVal, amount, { duration: 0.6, ease: 'easeOut' });
  }, [amount]);

  const stacks = countChips(Math.min(amount, 9999));
  const isWin  = delta !== null && delta > 0;
  const isLoss = delta !== null && delta < 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
        <motion.div
          style={{ fontSize: 22, fontWeight: 700, fontFamily: 'sans-serif', letterSpacing: '-0.01em' } as any}
          animate={{ color: isWin ? '#4ade80' : isLoss ? '#f87171' : '#d4a820' }}
          transition={{ duration: 0.3 }}
        >
          {/* @ts-ignore */}
          <motion.span>{displayVal}</motion.span>
        </motion.div>

        <AnimatePresence>
          {delta !== null && (
            <motion.div
              key={`delta-${delta}`}
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: isWin ? -28 : 28 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              style={{
                position: 'absolute', left: '100%', marginLeft: 6,
                fontSize: 11, fontWeight: 700, fontFamily: 'sans-serif',
                color: isWin ? '#4ade80' : '#f87171',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}
            >
              {isWin ? '+' : ''}{delta < 0 ? '-' : ''}{Math.abs(delta).toLocaleString()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
                {Array.from({ length: count }, (_, i) => {
                  const gradId2 = `br${denom}${i}`;
                  return (
                    <motion.div
                      key={i}
                      initial={{ y: -8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 28 }}
                      style={{
                        position: 'absolute', bottom: i * 4, left: '50%',
                        transform: 'translateX(-50%)',
                        width: 26, height: 26,
                      }}
                    >
                      <svg width={26} height={26} viewBox="0 0 26 26" style={{ overflow: 'visible' }}>
                        <defs>
                          <radialGradient id={gradId2} cx="36%" cy="30%" r="70%">
                            <stop offset="0%" stopColor={s.highlight} />
                            <stop offset="100%" stopColor={s.bg} />
                          </radialGradient>
                        </defs>
                        <circle cx={13} cy={13} r={12.5} fill={s.rim}
                          filter={i === count - 1 ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' : undefined} />
                        <circle cx={13} cy={13} r={9.5} fill={`url(#${gradId2})`} />
                        {i === count - 1 && (
                          <text x={13} y={13.5} textAnchor="middle" dominantBaseline="central"
                            fontSize="6" fontWeight="900" fontFamily="Inter, Arial, sans-serif"
                            fill={s.text}>
                            {denom >= 1000 ? `${denom / 1000}k` : denom}
                          </text>
                        )}
                      </svg>
                    </motion.div>
                  );
                })}
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
        >Get chips</motion.button>
      )}
    </div>
  );
}

// ─── Flying-chip burst (side bet win rain) ────────────────────────────────────
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
        const dy    = Math.cos((angle * Math.PI) / 180) * -dist;
        const gradId = `burst${denom}${i}`;

        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.5, rotate: 0 }}
            animate={{
              x: [0, dx * 0.3, dx],
              y: [0, dy, dy + 120],
              opacity: [1, 1, 0],
              scale: [0.5, 1, 0.8],
              rotate: [0, angle * 0.8, angle * 1.5],
            }}
            transition={{ duration: 0.9, delay: i * 0.06, ease: 'easeIn', times: [0, 0.35, 1] }}
            onAnimationComplete={i === 0 ? onDone : undefined}
            style={{ position: 'absolute', top: 0, left: 0, marginLeft: -12, marginTop: -12 }}
          >
            <svg width={24} height={24} viewBox="0 0 24 24">
              <defs>
                <radialGradient id={gradId} cx="36%" cy="30%" r="70%">
                  <stop offset="0%" stopColor={s.highlight} />
                  <stop offset="100%" stopColor={s.bg} />
                </radialGradient>
              </defs>
              <circle cx={12} cy={12} r={11.5} fill={s.rim} />
              <circle cx={12} cy={12} r={8.5} fill={`url(#${gradId})`} />
              <text x={12} y={12.5} textAnchor="middle" dominantBaseline="central"
                fontSize="6" fontWeight="900" fontFamily="Inter, Arial, sans-serif"
                fill={s.text}>
                {denom >= 1000 ? `${denom / 1000}k` : denom}
              </text>
            </svg>
          </motion.div>
        );
      })}
    </div>
  );
}
