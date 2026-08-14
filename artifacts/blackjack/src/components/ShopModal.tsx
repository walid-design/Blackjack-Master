import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Gem, ShieldCheck, Sparkles, X } from 'lucide-react';
import { CHIP_PRODUCTS, type ChipProduct, useEconomy } from '@/economy/EconomyContext';

interface ShopModalProps {
  open: boolean;
  onClose: () => void;
  onChipsGranted?: (amount: number) => void;
}

export function ShopModal({ open, onClose, onChipsGranted }: ShopModalProps) {
  const { demoCheckoutEnabled, completeDemoPurchase } = useEconomy();
  const [selected, setSelected] = useState<ChipProduct | null>(null);
  const [successAmount, setSuccessAmount] = useState(0);
  const purchaseLockedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setSuccessAmount(0);
      purchaseLockedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onClose]);

  const confirmDemoPurchase = () => {
    if (!selected || purchaseLockedRef.current) return;
    purchaseLockedRef.current = true;
    const granted = completeDemoPurchase(selected.sku);
    if (!granted) {
      purchaseLockedRef.current = false;
      return;
    }
    setSuccessAmount(granted);
    onChipsGranted?.(granted);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="shop-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={event => event.target === event.currentTarget && onClose()}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(4,5,13,0.78)', backdropFilter: 'blur(12px)',
            display: 'grid', placeItems: 'center', padding: 18,
          }}
        >
          <motion.section
            role="dialog" aria-modal="true" aria-label="Play chip shop"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            style={{
              width: 'min(820px, 100%)', maxHeight: 'min(760px, 92dvh)', overflowY: 'auto',
              borderRadius: 22, border: '1px solid rgba(240,184,48,0.24)',
              background: 'radial-gradient(circle at 50% 0%, rgba(71,61,120,0.52), transparent 42%), #111426',
              boxShadow: '0 30px 120px rgba(0,0,0,0.72), 0 0 70px rgba(240,184,48,0.08)',
              color: '#f6eddc', position: 'relative',
            }}
          >
            <button data-testid="shop-close" aria-label="Close shop" onClick={onClose} style={{
              position: 'absolute', top: 16, right: 16, zIndex: 2, width: 34, height: 34,
              display: 'grid', placeItems: 'center', borderRadius: '50%', cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.06)',
            }}><X size={17} /></button>

            <header style={{ textAlign: 'center', padding: '38px 48px 24px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#f0c85a', font: '700 10px Inter, sans-serif', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                <Gem size={14} /> Royal Ace cashier
              </div>
              <h2 style={{ font: "700 clamp(28px, 5vw, 42px) 'Playfair Display', serif", marginTop: 8 }}>Build Your Stack</h2>
              <p style={{ color: 'rgba(235,237,248,0.56)', font: '12px Inter, sans-serif', marginTop: 8 }}>
                Virtual play chips only. No cash value, withdrawal or transfer.
              </p>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
                borderRadius: 999, padding: '6px 11px', font: '700 9px Inter, sans-serif',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: demoCheckoutEnabled ? '#93e7ba' : '#f5c66b',
                background: demoCheckoutEnabled ? 'rgba(52,211,153,0.09)' : 'rgba(245,158,11,0.09)',
                border: `1px solid ${demoCheckoutEnabled ? 'rgba(52,211,153,0.22)' : 'rgba(245,158,11,0.22)'}`,
              }}><ShieldCheck size={13} /> {demoCheckoutEnabled ? 'Demo checkout · no charge' : 'Payments coming soon'}</div>
            </header>

            {successAmount > 0 ? (
              <div data-testid="purchase-success" style={{ padding: '26px 28px 44px', textAlign: 'center' }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{
                  width: 72, height: 72, margin: '0 auto 18px', borderRadius: '50%',
                  display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#a97508,#f6cd58)',
                  color: '#12121d', boxShadow: '0 0 42px rgba(240,184,48,0.3)',
                }}><Check size={35} strokeWidth={3} /></motion.div>
                <h3 style={{ font: "700 29px 'Playfair Display', serif" }}>Stack delivered</h3>
                <p style={{ color: '#f4c952', font: '700 21px Inter, sans-serif', marginTop: 8 }}>
                  +{successAmount.toLocaleString()} chips
                </p>
                <p style={{ color: 'rgba(255,255,255,0.45)', font: '11px Inter, sans-serif', margin: '8px auto 24px', maxWidth: 380 }}>
                  This was a sandbox preview. No payment was collected and no card information was requested.
                </p>
                <button data-testid="purchase-done" onClick={onClose} style={goldButtonStyle}>Return to the tables</button>
              </div>
            ) : selected ? (
              <div style={{ padding: '14px 28px 38px' }}>
                <button onClick={() => setSelected(null)} style={{ border: 0, background: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', font: '600 11px Inter, sans-serif', padding: 0 }}>← Back to chip packs</button>
                <div style={{ marginTop: 18, padding: 24, borderRadius: 16, border: '1px solid rgba(240,184,48,0.18)', background: 'rgba(255,255,255,0.045)' }}>
                  <p style={{ color: 'rgba(255,255,255,0.45)', font: '700 9px Inter, sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Order summary</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginTop: 12 }}>
                    <div>
                      <h3 style={{ font: "700 24px 'Playfair Display', serif" }}>{selected.name}</h3>
                      <p style={{ color: '#f4c952', font: '700 17px Inter, sans-serif', marginTop: 4 }}>{(selected.chips + (selected.bonus ?? 0)).toLocaleString()} play chips</p>
                    </div>
                    <strong style={{ font: '700 24px Inter, sans-serif' }}>{selected.price}</strong>
                  </div>
                </div>
                <button
                  data-testid="confirm-demo-purchase"
                  disabled={!demoCheckoutEnabled}
                  onClick={confirmDemoPurchase}
                  style={{ ...goldButtonStyle, width: '100%', marginTop: 18, opacity: demoCheckoutEnabled ? 1 : 0.45, cursor: demoCheckoutEnabled ? 'pointer' : 'not-allowed' }}
                >{demoCheckoutEnabled ? 'Complete demo purchase' : 'Checkout unavailable'}</button>
                <p style={{ color: 'rgba(255,255,255,0.32)', font: '10px Inter, sans-serif', lineHeight: 1.6, textAlign: 'center', marginTop: 12 }}>
                  Production checkout will be activated only after a payment provider approves the game. The browser will never be allowed to grant paid chips itself.
                </p>
              </div>
            ) : (
              <div style={{ padding: '6px 24px 34px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  {CHIP_PRODUCTS.map(product => {
                    const total = product.chips + (product.bonus ?? 0);
                    return (
                      <button key={product.sku} data-testid={`product-${product.sku}`} onClick={() => setSelected(product)} style={{
                        position: 'relative', textAlign: 'left', cursor: 'pointer', color: 'inherit',
                        padding: '20px 17px 17px', borderRadius: 15,
                        border: `1px solid ${product.popular ? 'rgba(240,184,48,0.48)' : 'rgba(255,255,255,0.1)'}`,
                        background: product.popular ? 'linear-gradient(160deg,rgba(240,184,48,0.13),rgba(255,255,255,0.045))' : 'rgba(255,255,255,0.04)',
                        boxShadow: product.popular ? '0 14px 35px rgba(240,184,48,0.08)' : 'none',
                      }}>
                        {product.popular && <span style={{ position: 'absolute', top: 8, right: 8, color: '#f3c958', font: '800 8px Inter, sans-serif', letterSpacing: '0.1em' }}>POPULAR</span>}
                        <Sparkles size={22} color="#e6b83f" />
                        <div style={{ font: "700 16px 'Playfair Display', serif", marginTop: 17 }}>{product.name}</div>
                        <div style={{ color: '#f3c958', font: '800 20px Inter, sans-serif', marginTop: 6 }}>{total.toLocaleString()}</div>
                        <div style={{ color: 'rgba(255,255,255,0.38)', font: '600 9px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.12em' }}>play chips</div>
                        {product.bonus && <div style={{ color: '#6ee7a8', font: '700 9px Inter, sans-serif', marginTop: 8 }}>Includes {product.bonus.toLocaleString()} bonus</div>}
                        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', font: '700 15px Inter, sans-serif' }}>{product.price}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const goldButtonStyle: React.CSSProperties = {
  border: 0, borderRadius: 9, padding: '14px 22px', color: '#101019',
  background: 'linear-gradient(135deg,#a87507,#e8b830 43%,#fbe076 72%,#b9850d)',
  boxShadow: '0 8px 28px rgba(240,184,48,0.2)', cursor: 'pointer',
  font: '800 11px Inter, sans-serif', letterSpacing: '0.16em', textTransform: 'uppercase',
};
