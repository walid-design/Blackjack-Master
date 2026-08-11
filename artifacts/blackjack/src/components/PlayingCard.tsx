// Static card face — all animation is handled by the parent wrapper
import { CSSProperties } from 'react';
import { Card as CardType } from '@/lib/blackjack';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};

interface PlayingCardProps {
  card: CardType;
  faceDown?: boolean;
  compact?: boolean;
  style?: CSSProperties;
}

export function PlayingCard({ card, faceDown = false, compact = false, style }: PlayingCardProps) {
  const w = compact ? 50 : 62;
  const h = compact ? 70 : 88;
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const sym = SUIT_SYMBOLS[card.suit] ?? '?';

  const base: CSSProperties = {
    width: w, height: h,
    borderRadius: 6,
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    position: 'relative',
    ...style,
  };

  if (faceDown) {
    return (
      <div style={{
        ...base,
        background: 'linear-gradient(135deg,#0d4d22 0%,#073214 50%,#0a3d1c 100%)',
        border: '1px solid rgba(255,255,255,0.15)',
      }}>
        <div style={{
          position: 'absolute', inset: 4, borderRadius: 3,
          border: '1px solid rgba(255,255,255,0.07)',
          background: 'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,0.025) 3px,rgba(255,255,255,0.025) 6px)',
        }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'rgba(255,255,255,0.1)' }}>
          ♦
        </div>
      </div>
    );
  }

  const rf = compact ? 10 : 13;
  const cf = compact ? 20 : 28;
  const color = isRed ? '#c8001a' : '#0d0d0d';

  return (
    <div style={{ ...base, background: '#ffffff', border: '1px solid #d0d0d0' }}>
      <div style={{ position: 'absolute', top: 3, left: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, color, fontFamily: 'Georgia,serif', fontWeight: 700, fontSize: rf }}>
        <span>{card.rank}</span>
        <span style={{ fontSize: rf - 1, marginTop: 1 }}>{sym}</span>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: cf, opacity: 0.85 }}>
        {sym}
      </div>
      <div style={{ position: 'absolute', bottom: 3, right: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, color, fontFamily: 'Georgia,serif', fontWeight: 700, fontSize: rf, transform: 'rotate(180deg)' }}>
        <span>{card.rank}</span>
        <span style={{ fontSize: rf - 1, marginTop: 1 }}>{sym}</span>
      </div>
    </div>
  );
}
