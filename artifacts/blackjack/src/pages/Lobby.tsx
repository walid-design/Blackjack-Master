import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { TABLES, TableConfig } from '@/lib/blackjack';
import { motion } from 'framer-motion';

export default function Lobby() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName] = useState('');
  const [buyIn, setBuyIn] = useState<number>(1000);
  const [hasVisited, setHasVisited] = useState(false);
  const [bankroll, setBankroll] = useState(0);

  useEffect(() => {
    const savedName = localStorage.getItem('bj_player_name');
    const savedBankroll = localStorage.getItem('bj_bankroll');
    if (savedName && savedBankroll) {
      setPlayerName(savedName);
      setBankroll(parseInt(savedBankroll, 10));
      setHasVisited(true);
    }
  }, []);

  const handleEnterCasino = () => {
    if (!playerName.trim()) return;
    localStorage.setItem('bj_player_name', playerName);
    localStorage.setItem('bj_bankroll', buyIn.toString());
    setBankroll(buyIn);
    setHasVisited(true);
  };

  const handleJoinTable = (tableId: string) => {
    setLocation(`/table/${tableId}`);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground flex flex-col relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>
      
      <header className="w-full py-12 flex flex-col items-center justify-center border-b border-border/50 bg-card/30 backdrop-blur-sm z-10 relative shadow-2xl">
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
        <h1 className="text-4xl md:text-6xl font-serif text-transparent bg-clip-text gold-accent tracking-wider font-bold mb-3 text-center px-4">
          ROYAL ACE CASINO
        </h1>
        <div className="flex items-center gap-4 text-muted-foreground uppercase tracking-widest text-sm font-semibold">
          <span className="w-12 h-[1px] bg-primary/30"></span>
          BLACKJACK TABLES
          <span className="w-12 h-[1px] bg-primary/30"></span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-6 md:p-12 z-10 flex flex-col items-center">
        {!hasVisited ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-card border border-card-border p-8 rounded-xl shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
            <h2 className="text-2xl font-serif text-center mb-6 text-foreground">Welcome to the Floor</h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Player Name</label>
                <input 
                  type="text" 
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-input border border-border rounded-md px-4 py-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all font-serif text-lg"
                  placeholder="Enter your name"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Initial Buy-in</label>
                <div className="grid grid-cols-3 gap-3">
                  {[500, 1000, 5000, 10000, 50000].map(amount => (
                    <button
                      key={amount}
                      onClick={() => setBuyIn(amount)}
                      className={`py-2 rounded-md border transition-all text-sm font-semibold ${buyIn === amount ? 'bg-primary/20 border-primary text-primary' : 'bg-transparent border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
                    >
                      ${amount.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
              
              <button 
                onClick={handleEnterCasino}
                disabled={!playerName.trim()}
                className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-md uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-[0_0_15px_rgba(223,169,56,0.3)]"
              >
                Enter Casino
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="w-full flex flex-col items-center w-full">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
               className="mb-12 text-center"
            >
              <h2 className="text-2xl font-serif text-foreground mb-2">Welcome back, {playerName}</h2>
              <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-card border border-primary/20 shadow-lg">
                <span className="text-muted-foreground text-sm uppercase tracking-wider">Stack:</span>
                <span className="text-xl font-mono text-primary font-bold">${bankroll.toLocaleString()}</span>
              </div>
            </motion.div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              {TABLES.map((table, i) => (
                <TableCard key={table.id} table={table} index={i} onJoin={() => handleJoinTable(table.id)} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TableCard({ table, index, onJoin }: { table: TableConfig, index: number, onJoin: () => void }) {
  const isPremium = table.minBet >= 100;
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`relative group bg-card border rounded-xl overflow-hidden flex flex-col ${isPremium ? 'border-primary/30 hover:border-primary' : 'border-card-border hover:border-border'} transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1`}
    >
      {isPremium && (
         <div className="absolute top-0 right-0 w-24 h-24 overflow-hidden z-10 pointer-events-none">
           <div className="absolute top-6 -right-6 w-32 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest text-center py-1 rotate-45 shadow-md">
             Premium
           </div>
         </div>
      )}
      
      <div className={`p-6 border-b ${isPremium ? 'bg-gradient-to-br from-card to-primary/10 border-primary/20' : 'bg-card border-border'}`}>
        <h3 className={`text-2xl font-serif mb-1 ${isPremium ? 'gold-accent text-transparent bg-clip-text' : 'text-foreground'}`}>
          {table.name}
        </h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{table.decks} Decks</span>
          <span>•</span>
          <span>Dealer Stands 17s</span>
        </div>
      </div>
      
      <div className="p-6 flex-1 flex flex-col gap-4">
        <div className="flex justify-between items-center bg-background/50 rounded-lg p-3 border border-border/50">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Min Bet</span>
            <span className="text-lg font-mono font-semibold text-foreground">${table.minBet}</span>
          </div>
          <div className="w-px h-8 bg-border/50"></div>
          <div className="flex flex-col text-right">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Max Bet</span>
            <span className="text-lg font-mono font-semibold text-foreground">${table.maxBet}</span>
          </div>
        </div>
        
        <div className="flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Side Bets</p>
          <div className="flex flex-wrap gap-2">
            {table.sideBets.map(sb => (
              <span key={sb} className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-secondary text-secondary-foreground border border-border/50">
                {formatSideBetName(sb)}
              </span>
            ))}
          </div>
        </div>
        
        <button 
          onClick={onJoin}
          className={`w-full py-3 rounded-md uppercase tracking-wider font-bold text-sm transition-all mt-2 ${isPremium ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_10px_rgba(223,169,56,0.2)]' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
        >
          Join Table
        </button>
      </div>
    </motion.div>
  );
}

function formatSideBetName(key: string) {
  const names: Record<string, string> = {
    insurance: 'Insurance',
    perfectPairs: 'Perfect Pairs',
    twentyOnePlusThree: '21+3',
    luckyLadies: 'Lucky Ladies',
    superSevens: 'Super Sevens',
    luckyLucky: 'Lucky Lucky',
    royalMatch: 'Royal Match',
    bustIt: 'Bust It'
  };
  return names[key] || key;
}
