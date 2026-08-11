interface ChipProps {
  amount: number;
  size?: number;
  onClick?: () => void;
  disabled?: boolean;
}

const CHIP_STYLES: Record<number, { bg: string; rim: string; text: string; stripes: string }> = {
  1:   { bg: '#e8e8e8', rim: '#b0b0b0', text: '#1a1a1a', stripes: '#c0c0c0' },
  5:   { bg: '#c41e1e', rim: '#8a0a0a', text: '#ffffff', stripes: '#e84040' },
  25:  { bg: '#1a8c3a', rim: '#0a5222', text: '#ffffff', stripes: '#3acc66' },
  100: { bg: '#1a3a9c', rim: '#0a1e66', text: '#ffffff', stripes: '#3c66e8' },
  500: { bg: '#8a1a8a', rim: '#550a55', text: '#ffffff', stripes: '#cc44cc' },
};

function getChipStyle(amount: number) {
  const known = CHIP_STYLES[amount];
  if (known) return known;
  if (amount >= 1000) return { bg: '#2a2a2a', rim: '#111', text: '#d4a820', stripes: '#555' };
  return { bg: '#888', rim: '#444', text: '#fff', stripes: '#aaa' };
}

export function Chip({ amount, size = 44, onClick, disabled }: ChipProps) {
  const style = getChipStyle(amount);
  const label = amount >= 1000 ? `${amount / 1000}k` : `${amount}`;
  const fontSize = size < 36 ? 8 : size < 44 ? 10 : 12;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        position: 'relative',
        border: `3px solid ${style.rim}`,
        background: style.bg,
        cursor: onClick && !disabled ? 'pointer' : 'default',
        boxShadow: `0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        padding: 0,
        outline: 'none',
        transition: 'transform 0.1s',
      }}
    >
      {/* Stripe pattern (notched rim) */}
      {[0, 60, 120, 180, 240, 300].map(angle => (
        <div
          key={angle}
          style={{
            position: 'absolute',
            width: '100%',
            height: 3,
            background: style.stripes,
            opacity: 0.6,
            top: '50%',
            left: 0,
            marginTop: -1.5,
            transform: `rotate(${angle}deg)`,
          }}
        />
      ))}
      {/* Center label */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: size * 0.6,
        height: size * 0.6,
        borderRadius: '50%',
        background: style.bg,
        border: `2px solid ${style.rim}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `inset 0 1px 3px rgba(0,0,0,0.3)`,
      }}>
        <span style={{
          fontSize,
          fontWeight: 800,
          color: style.text,
          fontFamily: 'Arial, sans-serif',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>{label}</span>
      </div>
    </button>
  );
}

const CHIP_DENOMINATIONS = [1, 5, 25, 100, 500];

export function ChipStack({ amount }: { amount: number }) {
  if (amount === 0) return null;
  const chips: number[] = [];
  let remaining = amount;
  for (const denom of [...CHIP_DENOMINATIONS].reverse()) {
    while (remaining >= denom) {
      chips.push(denom);
      remaining -= denom;
      if (chips.length >= 6) break;
    }
    if (chips.length >= 6) break;
  }

  return (
    <div style={{ position: 'relative', width: 36, height: Math.min(36 + chips.length * 5, 60) }}>
      {chips.map((d, i) => {
        const style = getChipStyle(d);
        return (
          <div key={i} style={{
            position: 'absolute',
            bottom: i * 5,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: `2.5px solid ${style.rim}`,
            background: style.bg,
            boxShadow: i === chips.length - 1
              ? `0 2px 4px rgba(0,0,0,0.5)`
              : `0 1px 2px rgba(0,0,0,0.3)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 8,
              fontWeight: 800,
              color: style.text,
              fontFamily: 'Arial, sans-serif',
            }}>{d >= 1000 ? `${d / 1000}k` : d}</span>
          </div>
        );
      })}
      {/* Total amount label on top chip */}
      <div style={{
        position: 'absolute',
        bottom: chips.length * 5 + 2,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.75)',
        borderRadius: 8,
        padding: '1px 5px',
        fontSize: 9,
        color: '#d4a820',
        fontWeight: 700,
        fontFamily: 'sans-serif',
        whiteSpace: 'nowrap',
        letterSpacing: '0.04em',
      }}>${amount}</div>
    </div>
  );
}
