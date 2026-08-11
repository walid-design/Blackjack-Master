import { motion } from 'framer-motion';
import { Card as CardType } from '@/lib/blackjack';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);

interface PlayingCardProps {
  card: CardType;
  faceDown?: boolean;
  animDelay?: number;
  compact?: boolean;
}

export function PlayingCard({ card, faceDown = false, animDelay = 0, compact = false }: PlayingCardProps) {
  const w = compact ? 52 : 62;
  const h = compact ? 72 : 88;
  const isRed = RED_SUITS.has(card.suit);
  const sym = SUIT_SYMBOLS[card.suit] ?? '?';

  const cardBase: React.CSSProperties = {
    width: w,
    height: h,
    borderRadius: 6,
    position: 'relative',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)',
    overflow: 'hidden',
  };

  if (faceDown) {
    return (
      <motion.div
        initial={{ x: 80, y: -60, opacity: 0, rotateY: 90 }}
        animate={{ x: 0, y: 0, opacity: 1, rotateY: 0 }}
        transition={{ delay: animDelay, type: 'spring', stiffness: 280, damping: 24 }}
        style={{
          ...cardBase,
          background: 'linear-gradient(135deg, #0d4d22 0%, #073214 50%, #0a3d1c 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        {/* Card back pattern */}
        <div style={{
          position: 'absolute',
          inset: 4,
          borderRadius: 3,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 6px)',
        }} />
        {/* Center diamond */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          color: 'rgba(255,255,255,0.12)',
        }}>♦</div>
      </motion.div>
    );
  }

  const rankFontSize = compact ? 10 : 13;
  const centerFontSize = compact ? 20 : 28;
  const color = isRed ? '#c8001a' : '#0d0d0d';

  return (
    <motion.div
      initial={{ x: 80, y: -60, opacity: 0, rotateY: 90 }}
      animate={{ x: 0, y: 0, opacity: 1, rotateY: 0 }}
      transition={{ delay: animDelay, type: 'spring', stiffness: 280, damping: 24 }}
      style={{
        ...cardBase,
        background: '#ffffff',
        border: '1px solid #d0d0d0',
      }}
    >
      {/* Top-left rank + suit */}
      <div style={{
        position: 'absolute',
        top: 3,
        left: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        color,
        fontFamily: 'Georgia, serif',
        fontWeight: 700,
        fontSize: rankFontSize,
      }}>
        <span>{card.rank}</span>
        <span style={{ fontSize: rankFontSize - 1, marginTop: 1 }}>{sym}</span>
      </div>

      {/* Center large suit */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontSize: centerFontSize,
        opacity: 0.85,
        userSelect: 'none',
      }}>
        {sym}
      </div>

      {/* Bottom-right (rotated) rank + suit */}
      <div style={{
        position: 'absolute',
        bottom: 3,
        right: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        color,
        fontFamily: 'Georgia, serif',
        fontWeight: 700,
        fontSize: rankFontSize,
        transform: 'rotate(180deg)',
      }}>
        <span>{card.rank}</span>
        <span style={{ fontSize: rankFontSize - 1, marginTop: 1 }}>{sym}</span>
      </div>
    </motion.div>
  );
}
