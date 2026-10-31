import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function StudioDialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return createPortal(<dialog className={`studio-dialog ${wide ? 'studio-dialog-wide' : ''}`} ref={ref} aria-label={title} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div><header><h2>{title}</h2><button autoFocus className="studio-icon" aria-label="关闭" onClick={onClose}><X size={20} /></button></header>{children}</div></dialog>, document.body);
}
export function Coin({ pair }: { pair: string }) { return <span className={`studio-coin ${pair.startsWith('ETH') ? 'eth' : ''}`}>{pair.startsWith('BTC') ? '₿' : pair.startsWith('ETH') ? 'Ξ' : pair.slice(0, 1)}</span>; }
export function Money({ value }: { value: string }) { const [whole, decimals] = value.split('.'); return <>{whole}{decimals && <span className="studio-decimal">.{decimals}</span>}</>; }
