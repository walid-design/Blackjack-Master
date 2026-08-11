import { useState, useEffect, useReducer } from 'react';
import { useLocation, useParams } from 'wouter';
import { TABLES, TableConfig, Card, Hand, Seat, calculateHandValue, SideBets } from '@/lib/blackjack';
import { gameReducer, createInitialState } from '@/lib/reducer';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { PlayingCard } from '@/components/PlayingCard';
import { Chip, ChipStack } from '@/components/Chip';

export default function Table() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const tableConfig = TABLES.find(t => t.id === id);

  if (!tableConfig) {
    setLocation('/');
    return null;
  }

  const [bankroll, setBankroll] = useState(1000);
  const [playerName, setPlayerName] = useState('Player');

  useEffect(() => {
    const savedName = localStorage.getItem('bj_player_name');
    const savedBankroll = localStorage.getItem('bj_bankroll');
    if (savedName) setPlayerName(savedName);
    if (savedBankroll) setBankroll(parseInt(savedBankroll, 10));
  }, []);

  const [state, dispatch] = useReducer(gameReducer, null, () => createInitialState(tableConfig, bankroll));

  useEffect(() => {
    if (state.bankroll !== bankroll) {
      setBankroll(state.bankroll);
      localStorage.setItem('bj_bankroll', state.bankroll.toString());
    }
  }, [state.bankroll, bankroll]);

  // -- Engine --
  useEffect(() => {
    if (state.phase === 'DEALING') {
       const dealSequence = async () => {
         const activeSeats = state.seats.filter(s => s.isActive && s.hands.length > 0);
         for (const seat of activeSeats) {
           dispatch({ type: 'CARD_DEALT', to: 'player', seatId: seat.id });
           await new Promise(r => setTimeout(r, 200));
         }
         dispatch({ type: 'CARD_DEALT', to: 'dealer' });
         await new Promise(r => setTimeout(r, 200));
         for (const seat of activeSeats) {
           dispatch({ type: 'CARD_DEALT', to: 'player', seatId: seat.id });
           await new Promise(r => setTimeout(r, 200));
         }
         dispatch({ type: 'CARD_DEALT', to: 'dealer' });
         await new Promise(r => setTimeout(r, 400));
         dispatch({ type: 'CHECK_DEALER_BJ' });
       };
       dealSequence();
    }
  }, [state.phase, state.seats]);

  useEffect(() => {
    if (state.phase === 'DEALER_TURN') {
       const dealerPlay = async () => {
         await new Promise(r => setTimeout(r, 800)); 
         dispatch({ type: 'DEALER_TICK' });
       };
       dealerPlay();
    }
  }, [state.phase, state.dealerCards]); 

  useEffect(() => {
    if (state.phase === 'DEALER_TICK' as any) {
      const val = calculateHandValue(state.dealerCards);
      if (val.total < 17) {
        setTimeout(() => dispatch({ type: 'CARD_DEALT', to: 'dealer' }), 500);
      } else {
        setTimeout(() => dispatch({ type: 'SETTLEMENT' }), 500);
      }
    }
  }, [state.phase, state.dealerCards]);

  useEffect(() => {
    if (state.phase === 'SETTLEMENT' && !(state as any).settled) { 
      dispatch({ type: 'PERFORM_SETTLEMENT' }); 
    }
  }, [state.phase, state]);

  const handleLeaveTable = () => {
    setLocation('/');
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col font-sans select-none overflow-hidden relative text-foreground">
      <header className="h-14 flex items-center justify-between px-4 bg-card/80 border-b border-border/50 z-20 backdrop-blur-md">
        <button 
          onClick={handleLeaveTable}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider text-xs font-semibold"
        >
          <ChevronLeft className="w-4 h-4" /> Leave Table
        </button>
        <div className="flex flex-col items-center">
          <h1 className="font-serif gold-accent text-transparent bg-clip-text text-lg font-bold tracking-widest">{tableConfig.name}</h1>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{tableConfig.decks} Decks • Dealer Stands 17</span>
        </div>
        <div className="w-24"></div> 
      </header>

      <main className="flex-1 relative flex flex-col items-center overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] bg-opacity-5">
        <div className="absolute top-[-10%] w-[150%] h-[120%] table-felt felt-border -z-10"></div>
        <TableFelt state={state} dispatch={dispatch} config={tableConfig} bankroll={bankroll} />
      </main>

      <ControlBar state={state} dispatch={dispatch} playerName={playerName} bankroll={bankroll} config={tableConfig} />
    </div>
  );
}

function TableFelt({ state, dispatch, config, bankroll }: { state: any, dispatch: any, config: TableConfig, bankroll: number }) {
  const dealerCards = state.dealerCards || [];
  const dealerVal = calculateHandValue(dealerCards);
  
  return (
    <div className="w-full h-full flex flex-col items-center justify-between pt-8 pb-32 relative max-w-6xl mx-auto z-10">
      <div className="flex flex-col items-center gap-2 mt-4 relative">
        <div className="flex justify-center relative h-[100px] md:h-[120px] w-64 items-center">
          <AnimatePresence>
            {dealerCards.map((card: Card, i: number) => {
               const isHoleCard = i === 1;
               const hide = isHoleCard && !['DEALER_TURN', 'DEALER_TICK', 'SETTLEMENT'].includes(state.phase) && state.dealerStatus !== 'blackjack';
               return (
                 <div key={i} className="absolute" style={{ transform: `translateX(${(i - (dealerCards.length-1)/2) * 30}px)` }}>
                   <PlayingCard card={card} faceDown={hide} index={i} stacked={true} />
                 </div>
               )
            })}
          </AnimatePresence>
        </div>
        {dealerCards.length > 0 && ['DEALER_TURN', 'DEALER_TICK', 'SETTLEMENT'].includes(state.phase) && (
          <div className="bg-black/40 text-white/70 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-white/10">
            {dealerVal.total}
          </div>
        )}
      </div>

      <div className="absolute top-[40%] w-[80%] aspect-square border-[3px] border-primary/20 rounded-full -translate-y-1/2 pointer-events-none"></div>
      
      <div className="absolute top-[45%] text-primary/30 font-serif text-3xl md:text-5xl uppercase tracking-[0.3em] font-bold opacity-30 pointer-events-none text-center leading-relaxed">
        Blackjack Pays 3 to 2<br/><span className="text-xl md:text-2xl tracking-[0.2em] font-sans">Dealer must draw to 16, and stand on all 17s</span><br/><span className="text-sm md:text-lg tracking-widest text-primary/40 mt-4 block font-sans">Insurance Pays 2 to 1</span>
      </div>

      <div className="w-full flex justify-center items-end gap-2 md:gap-8 px-8 absolute bottom-4">
        {state.seats.map((seat: Seat) => (
          <SeatView key={seat.id} seat={seat} state={state} dispatch={dispatch} config={config} bankroll={bankroll} />
        ))}
      </div>
    </div>
  );
}

function SeatView({ seat, state, dispatch, config, bankroll }: { seat: Seat, state: any, dispatch: any, config: TableConfig, bankroll: number }) {
  const handleSit = () => dispatch({ type: 'SIT', seatId: seat.id });
  const handleSelectBet = () => dispatch({ type: 'SELECT_BET_SEAT', seatId: seat.id });

  if (!seat.isActive) {
    return (
      <div className="flex flex-col items-center justify-end w-20 md:w-32 h-48 relative">
        {state.phase === 'SEAT_SELECTION' && (
          <button 
            onClick={handleSit}
            className="w-12 h-12 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center text-white/30 hover:border-white/70 hover:text-white/70 hover:bg-white/5 transition-all mb-8"
          >
            <span className="text-xl">+</span>
          </button>
        )}
      </div>
    );
  }

  const isBetting = state.phase === 'BETTING';
  const isSelectedForBet = state.bettingSeatId === seat.id;
  const currentBet = seat.hands[0]?.bet || 0;

  const handleSideBetClick = (sb: keyof SideBets) => {
    if (!isBetting) return;
    dispatch({ type: 'PLACE_SIDE_BET', seatId: seat.id, betType: sb, amount: 25 }); // default 25 for quick placement
  };
  
  return (
    <div className={`flex flex-col items-center justify-end w-24 md:w-36 relative transition-all ${isSelectedForBet ? 'scale-110 z-20' : 'z-10'}`}>
      
      {state.phase === 'INSURANCE' && state.activeSeatIndex === seat.id && (
        <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 bg-card border border-primary/50 rounded-lg p-3 w-48 shadow-2xl z-50 flex flex-col items-center">
          <p className="text-xs uppercase font-bold text-primary mb-2 text-center">Insurance?</p>
          <div className="flex gap-2 w-full">
             <button onClick={() => dispatch({ type: 'INSURANCE' })} disabled={bankroll < (currentBet/2)} className="flex-1 py-1 bg-primary text-black font-bold text-xs rounded hover:bg-primary/90 disabled:opacity-50">Buy</button>
             <button onClick={() => dispatch({ type: 'DECLINE_INSURANCE' })} className="flex-1 py-1 bg-secondary text-white font-bold text-xs rounded hover:bg-secondary/90">Decline</button>
          </div>
        </div>
      )}

      {seat.sideBetResults?.map((res: any, idx: number) => (
         <motion.div 
           key={`side-res-${idx}`}
           initial={{ opacity: 0, y: 0 }}
           animate={{ opacity: 1, y: -40 - (idx * 20) }}
           className={`absolute z-40 top-0 left-1/2 -translate-x-1/2 -translate-y-full px-2 py-0.5 rounded border shadow-xl font-bold uppercase tracking-wider text-[10px] whitespace-nowrap
             ${res.win ? 'bg-primary/20 border-primary text-primary' : 'bg-red-900/50 border-red-500/50 text-red-200'}`}
         >
           {res.betName}: {res.win ? `+$${res.payout}` : '-'}
         </motion.div>
      ))}

      {seat.hands.map((hand: Hand) => (
         hand.result && (
           <motion.div 
             key={`result-${hand.id}`}
             initial={{ opacity: 0, y: 20, scale: 0.8 }}
             animate={{ opacity: 1, y: 0, scale: 1 }}
             className={`absolute z-40 top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-4 px-3 py-1 rounded border shadow-xl font-bold uppercase tracking-wider text-xs whitespace-nowrap
               ${hand.result === 'win' || hand.result === 'blackjack_win' ? 'bg-green-900 border-green-500 text-green-100' : 
                 hand.result === 'push' ? 'bg-gray-800 border-gray-500 text-gray-200' : 
                 hand.result === 'surrender' ? 'bg-gray-800 border-yellow-500 text-yellow-200' :
                 'bg-red-900 border-red-500 text-red-100'}`}
           >
             {hand.result === 'blackjack_win' ? 'Blackjack!' : hand.result}
             {hand.payout ? ` +$${hand.payout}` : (hand.result === 'lose' || hand.result === 'bust' ? ` -$${hand.bet}` : '')}
           </motion.div>
         )
      ))}

      <div className="h-32 md:h-40 relative flex justify-center items-end mb-2 w-full">
        {seat.hands.map((hand: Hand, hIdx: number) => {
           const isActiveHand = ['PLAYER_TURN', 'INSURANCE'].includes(state.phase) && state.activeSeatIndex === seat.id && seat.activeHandIndex === hIdx;
           return (
             <div key={hand.id} className={`absolute bottom-0 transition-all ${seat.hands.length > 1 ? (hIdx === 0 ? '-translate-x-6 md:-translate-x-8' : 'translate-x-6 md:translate-x-8') : ''} ${isActiveHand ? 'scale-110 z-20 drop-shadow-[0_0_15px_rgba(223,169,56,0.3)]' : 'z-10 opacity-90'}`}>
               <div className="relative flex justify-center w-16 md:w-20 h-24 md:h-32">
                 {hand.cards.map((card: Card, cIdx: number) => (
                   <div key={cIdx} className="absolute top-0" style={{ transform: `translateY(${cIdx * -20}px)` }}>
                      <PlayingCard card={card} index={cIdx} stacked={true} />
                   </div>
                 ))}
                 {hand.cards.length > 0 && (
                    <div className="absolute -bottom-3 bg-black/60 border border-white/20 text-white px-2 py-0.5 rounded text-[10px] font-bold z-30">
                      {calculateHandValue(hand.cards).total}
                    </div>
                 )}
               </div>
             </div>
           )
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-1 mb-3 w-full min-h-8">
        {config.sideBets.filter(sb => sb !== 'insurance').map(sb => {
          const amount = (seat.sideBets as any)[sb] || 0;
          return (
            <button 
              key={sb} 
              onClick={() => handleSideBetClick(sb as keyof SideBets)}
              className={`w-8 h-8 rounded-full border flex items-center justify-center text-[8px] relative transition-all ${isBetting ? 'hover:border-primary cursor-pointer' : 'cursor-default'} ${amount > 0 ? 'bg-primary text-black font-bold border-primary' : 'bg-black/40 text-primary-foreground border-primary/40'}`}
              title={isBetting ? `Add $25 to ${sb}` : sb}
            >
               {sb.substring(0,2).toUpperCase()}
               {amount > 0 && <div className="absolute -top-3 right-0 text-[8px] bg-black text-white px-1 rounded font-mono border border-border">${amount}</div>}
            </button>
          )
        })}
      </div>

      <button 
        onClick={isBetting ? handleSelectBet : undefined}
        className={`w-16 h-16 md:w-20 md:h-20 rounded-full border-4 flex items-center justify-center transition-all relative ${isBetting ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'} ${isSelectedForBet ? 'border-primary shadow-[0_0_15px_rgba(223,169,56,0.5)] bg-primary/10' : 'border-primary/40 bg-black/20'}`}
      >
        {seat.sideBets.insurance > 0 && (
          <div className="absolute -left-6 top-0 w-8 h-8 bg-blue-900 border border-blue-400 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-lg z-20">
             INS<br/>${seat.sideBets.insurance}
          </div>
        )}
        {currentBet > 0 ? (
          <ChipStack amount={currentBet} />
        ) : (
          <span className="text-white/20 text-xs md:text-sm uppercase tracking-widest font-bold">Bet</span>
        )}
      </button>

      {['PLAYER_TURN', 'INSURANCE'].includes(state.phase) && state.activeSeatIndex === seat.id && (
        <div className="absolute -bottom-6 w-full flex justify-center pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-primary animate-ping"></div>
        </div>
      )}
    </div>
  );
}

function ControlBar({ state, dispatch, playerName, bankroll, config }: { state: any, dispatch: any, playerName: string, bankroll: number, config: TableConfig }) {
  const [selectedChip, setSelectedChip] = useState(25);
  const chips = [1, 5, 25, 100, 500];

  const handlePlaceBet = () => {
    if (state.bettingSeatId !== undefined) {
      dispatch({ type: 'PLACE_BET', seatId: state.bettingSeatId, amount: selectedChip });
    }
  };

  const handleDeal = () => {
    dispatch({ type: 'DEAL' });
  };

  const canDeal = state.seats.some((s: Seat) => s.isActive && (s.hands[0]?.bet || 0) >= config.minBet);

  const activeSeat = state.seats[state.activeSeatIndex];
  const activeHand = activeSeat?.hands[activeSeat?.activeHandIndex];
  const canDouble = activeHand && activeHand.cards.length === 2 && bankroll >= activeHand.bet;
  const canSplit = activeHand && activeHand.cards.length === 2 && activeHand.cards[0].value === activeHand.cards[1].value && bankroll >= activeHand.bet;
  const canSurrender = activeHand && activeHand.cards.length === 2;

  return (
    <div className="h-28 md:h-32 w-full bg-card border-t border-border z-30 flex items-center justify-between px-4 md:px-8 shrink-0">
      <div className="flex flex-col w-32 md:w-48">
        <span className="text-muted-foreground uppercase tracking-widest text-[10px] md:text-xs font-bold">{playerName}</span>
        <span className="text-xl md:text-2xl font-mono text-primary font-bold shadow-sm">${bankroll.toLocaleString()}</span>
        <div className="w-full max-w-[120px] h-1 bg-border rounded-full mt-2 overflow-hidden">
           <div className="h-full bg-primary/50" style={{ width: `${Math.max(0, (state.shoe?.length || 0) / Math.max(1, (state.shoe?.length || 0) + (state.discard?.length || 0)) * 100)}%` }}></div>
        </div>
        <span className="text-[8px] text-muted-foreground uppercase mt-1">Shoe</span>
      </div>

      <div className="flex-1 flex justify-center items-center h-full px-2">
        {state.phase === 'SEAT_SELECTION' && (
          <div className="text-muted-foreground text-sm uppercase tracking-wider font-semibold animate-pulse">Select a seat to join</div>
        )}
        
        {state.phase === 'BETTING' && state.seats.some((s: Seat) => s.isActive) && (
          <div className="flex flex-col items-center w-full max-w-lg gap-2">
            <div className="flex items-center justify-center gap-2 md:gap-4 mb-2">
              {chips.map(amount => (
                <button 
                  key={amount}
                  onClick={() => setSelectedChip(amount)}
                  className={`relative transition-all hover:-translate-y-2 ${selectedChip === amount ? '-translate-y-4 scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'scale-90 opacity-80'}`}
                >
                  <Chip amount={amount} />
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-2 w-full max-w-[300px]">
               <button 
                 onClick={handlePlaceBet}
                 disabled={state.bettingSeatId === undefined || bankroll < selectedChip}
                 className="flex-1 py-2 md:py-3 bg-secondary text-secondary-foreground rounded uppercase tracking-wider text-[10px] md:text-xs font-bold hover:bg-secondary/80 disabled:opacity-50 border border-border"
               >
                 Bet
               </button>
               {canDeal && (
                 <button 
                   onClick={handleDeal}
                   className="flex-1 py-2 md:py-3 bg-primary text-primary-foreground rounded uppercase tracking-wider text-[10px] md:text-xs font-bold hover:bg-primary/90 shadow-[0_0_10px_rgba(223,169,56,0.3)]"
                 >
                   Deal
                 </button>
               )}
            </div>
          </div>
        )}

        {state.phase === 'PLAYER_TURN' && (
           <div className="flex items-center gap-1 md:gap-4">
             <ActionButton onClick={() => {
                dispatch({ type: 'HIT' }); 
                dispatch({ type: 'CARD_DEALT', to: 'player', seatId: activeSeat.id });
             }} label="Hit" />
             <ActionButton onClick={() => dispatch({ type: 'STAND' })} label="Stand" />
             <ActionButton onClick={() => {
                dispatch({ type: 'DOUBLE' });
                dispatch({ type: 'CARD_DEALT', to: 'player', seatId: activeSeat.id });
                setTimeout(() => {
                   dispatch({ type: 'NEXT_HAND' });
                }, 500);
             }} label="Double" disabled={!canDouble} />
             <ActionButton onClick={() => {
                dispatch({ type: 'SPLIT' });
                dispatch({ type: 'CARD_DEALT', to: 'player', seatId: activeSeat.id });
             }} label="Split" disabled={!canSplit} />
             <ActionButton onClick={() => dispatch({ type: 'SURRENDER' })} label="Surrender" disabled={!canSurrender} />
           </div>
        )}
        
        {state.phase === 'SETTLEMENT' && (
           <button 
             onClick={() => dispatch({ type: 'NEXT_ROUND' })}
             className="px-8 py-3 bg-primary text-primary-foreground rounded uppercase tracking-widest text-sm font-bold shadow-lg animate-pulse"
           >
             Next Round
           </button>
        )}
      </div>

      <div className="flex flex-col items-end w-32 md:w-48">
         {state.phase === 'BETTING' && state.seats.some((s: Seat) => s.isActive) && (
           <button 
             onClick={() => dispatch({ type: 'CLEAR_BETS' })}
             className="text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground mb-2"
           >
             Clear Bets
           </button>
         )}
         {state.bankroll === 0 && state.phase === 'BETTING' && (
           <button onClick={() => dispatch({ type: 'ADD_BANKROLL', amount: 1000 })} className="text-[10px] md:text-xs text-primary font-bold uppercase hover:underline py-1 px-3 border border-primary/30 rounded">
             Buy $1000
           </button>
         )}
      </div>
    </div>
  );
}

function ActionButton({ onClick, label, disabled }: { onClick: () => void, label: string, disabled?: boolean }) {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className="px-2 py-2 md:px-5 md:py-3 bg-card border border-border hover:bg-secondary text-foreground uppercase tracking-wider md:tracking-widest text-[10px] md:text-xs font-bold rounded shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {label}
    </button>
  );
}
