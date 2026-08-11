import React from 'react';
import { motion } from 'framer-motion';

export function Chip({ amount }: { amount: number }) {
  let colorClass = '';
  switch(amount) {
    case 1: colorClass = 'bg-gray-100 border-gray-400 text-black'; break;
    case 5: colorClass = 'bg-red-600 border-red-800 text-white'; break;
    case 25: colorClass = 'bg-green-600 border-green-800 text-white'; break;
    case 100: colorClass = 'bg-black border-gray-600 text-white'; break;
    case 500: colorClass = 'bg-purple-700 border-purple-900 text-white'; break;
    default: colorClass = 'bg-blue-600 border-blue-800 text-white';
  }

  return (
    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full border-4 flex items-center justify-center font-bold text-xs md:text-sm shadow-md ring-1 ring-black/50 ${colorClass}`}>
      {/* inner dashed ring */}
      <div className="w-full h-full rounded-full border-[2px] border-dashed border-white/30 flex items-center justify-center">
        {amount}
      </div>
    </div>
  );
}

export function ChipStack({ amount }: { amount: number }) {
  // Break down amount into chips
  let remaining = amount;
  const chipAmounts = [500, 100, 25, 5, 1];
  const stack = [];
  
  for (const val of chipAmounts) {
    while (remaining >= val && stack.length < 8) { // max 8 visible chips in stack
      stack.push(val);
      remaining -= val;
    }
  }

  // If there's still remaining but stack is full, just show the top chip correctly, 
  // we just represent it visually anyway.
  
  stack.reverse(); // largest on bottom

  return (
    <div className="relative w-12 h-12 flex justify-center items-end">
      {stack.map((val, i) => (
        <motion.div 
          key={i} 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: -i * 4, opacity: 1 }} // stack visually upwards
          className="absolute"
          style={{ zIndex: i }}
        >
          <Chip amount={val} />
        </motion.div>
      ))}
      <div className="absolute -top-6 bg-black/70 px-2 py-0.5 rounded text-[10px] text-white font-mono z-20 whitespace-nowrap">
        ${amount}
      </div>
    </div>
  );
}
