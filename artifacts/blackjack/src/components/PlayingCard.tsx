import React from 'react';
import { Card as CardType } from '@/lib/blackjack';
import { motion } from 'framer-motion';

export function PlayingCard({ card, faceDown = false, index = 0, stacked = false }: { card: CardType, faceDown?: boolean, index?: number, stacked?: boolean }) {
  if (faceDown) {
    return (
      <motion.div 
        initial={{ x: 200, y: -200, opacity: 0, rotate: 45 }}
        animate={{ x: stacked ? index * 15 : index * 20, y: stacked ? index * -15 : 0, opacity: 1, rotate: 0 }}
        transition={{ delay: index * 0.1, type: 'spring', stiffness: 200, damping: 20 }}
        className="absolute w-[60px] h-[84px] md:w-[72px] md:h-[100px] rounded-md bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0d3824] to-[#04180d] border border-white/20 shadow-lg"
      >
        <div className="w-full h-full p-1">
          <div className="w-full h-full rounded border border-white/10 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
        </div>
      </motion.div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  let symbol = '♠';
  if (card.suit === 'hearts') symbol = '♥';
  if (card.suit === 'diamonds') symbol = '♦';
  if (card.suit === 'clubs') symbol = '♣';

  return (
    <motion.div 
      initial={{ x: 200, y: -200, opacity: 0, rotate: 45 }}
      animate={{ x: stacked ? index * 15 : index * 20, y: stacked ? index * -15 : 0, opacity: 1, rotate: 0 }}
      transition={{ delay: index * 0.1, type: 'spring', stiffness: 200, damping: 20 }}
      className={`absolute w-[60px] h-[84px] md:w-[72px] md:h-[100px] rounded-md bg-white border border-gray-300 shadow-[0_2px_10px_rgba(0,0,0,0.3)] flex flex-col justify-between p-1 select-none font-sans ${isRed ? 'text-red-600' : 'text-gray-900'}`}
      style={{ zIndex: index }}
    >
      <div className="leading-none text-left font-bold text-sm md:text-base">
        <div>{card.rank}</div>
        <div className="-mt-1">{symbol}</div>
      </div>
      
      {/* Center large symbol for face cards or just normal symbol */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <span className="text-4xl md:text-5xl">{symbol}</span>
      </div>

      <div className="leading-none text-right font-bold text-sm md:text-base rotate-180">
        <div>{card.rank}</div>
        <div className="-mt-1">{symbol}</div>
      </div>
    </motion.div>
  );
}
