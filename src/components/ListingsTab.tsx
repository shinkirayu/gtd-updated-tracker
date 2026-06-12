import React, { useState, useEffect, useMemo, useRef } from 'react';
import { gtdUnitsList } from '../data/gtdUnits';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell, Package, RefreshCw, ChevronLeft, ChevronRight, Search, X, Edit2, Layers, CheckCircle, ArrowUpRight
} from 'lucide-react';

const cn = (...c: (string | undefined | null | false)[]) => c.filter(Boolean).join(' ');
const GTDCDN_BASE = 'https://andero2003.github.io/GTDCDN';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListingsTabProps {
  aggregateStorage: Record<string, {
    name: string; rawName?: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    accounts: { username: string; pc: string; quantity: number; updated_at: string }[];
    totalQuantity: number;
  }>;
  tradingAccounts: { id: string; name: string; type: string; items: any[] }[];
}

interface OfferItem {
  id: string; userId?: string; gameId: string; category: string;
  gameCategoryTitle: string; gameSeoAlias?: string; quantity: number;
  pricePerUnit: { amount: number; currency: string };
  pricePerUnitInUSD?: { amount: number; currency: string };
  description?: string; guaranteedDeliveryTime?: string;
  offerState: 'Active' | 'Paused' | 'Closed' | 'Offline'; offerTitle: string;
  mainOfferImage?: string | { smallImage: string; largeImage: string };
  offerImages?: { smallImage: string; largeImage: string }[];
  imageLocation?: string; sellerName?: string;
}

interface ZXSale {
  offer_id: string; title: string; listed_price: number; offer_status: string;
  cover_photo?: string; has_multiple_stock?: boolean; quantity?: number; is_hidden?: boolean;
  service_category_id?: string; service_category?: string; service_category_base_id?: string;
  attribute_values?: any[];
}

interface GFPhoto { status: string; display_order?: number; view_url?: string }
interface GFListing {
  id: string; name: string; price: number; qty_avail?: number; qty_sold?: number;
  status: 'prepare' | 'ready' | 'onsale' | 'sold' | 'cancelled';
  cover_photo?: string; photo?: Record<string, GFPhoto>; owner?: string; version: string;
  description?: string;
}

interface G2GOffer {
  offer_id: string; seller_id?: string; title?: string; status?: string;
  unit_price?: number; currency?: string; offer_currency?: string;
  unit_price_in_usd?: number; display_price?: string; available_qty?: number; api_qty?: number;
  brand_id?: string; primary_img_attributes?: string[]; offer_title_collection_tree?: string[];
  offer_attributes?: { collection_id: string; dataset_id: string }[];
  username?: string; service_id?: string; cat_id?: string;
}

// ── Image helpers ─────────────────────────────────────────────────────────────

const buildMainOfferImage = (offer: OfferItem) => {
  if (offer.mainOfferImage && typeof offer.mainOfferImage === 'object') return offer.mainOfferImage;
  if (offer.offerImages?.length) return offer.offerImages[0];
  if (typeof offer.mainOfferImage === 'string' && offer.mainOfferImage)
    return { smallImage: offer.mainOfferImage, largeImage: offer.mainOfferImage };
  if (offer.imageLocation) return { smallImage: offer.imageLocation, largeImage: offer.imageLocation };
  return undefined;
};

const extractImage = (offer: any): string | null =>
  offer.mainOfferImage?.smallImage || offer.offerImages?.[0]?.smallImage ||
  offer.mainOfferImage?.largeImage ||
  (typeof offer.mainOfferImage === 'string' && offer.mainOfferImage !== 'string' ? offer.mainOfferImage : null) ||
  offer.imageLocation || null;

const eldoCandidates = (raw: string, size = 200): string[] => {
  if (raw.startsWith('http')) { const b = raw.split('?')[0]; return [`${b}?w=${size}&q=80`, b]; }
  return [
    `https://assetsdelivery.eldorado.gg/v7/_offers-v2_/${raw}?w=${size}&q=80`,
    `https://assetsdelivery.eldorado.gg/v7/_offers-v2_/${raw}`,
  ];
};

const lookupCdn = (offer: OfferItem, map: Map<string, string>): string | null => {
  if (offer.gameId !== '268' || map.size === 0) return null;
  const raw = (offer.gameCategoryTitle || offer.offerTitle || '').split(' | ')[0].trim().toLowerCase();
  if (map.has(raw)) return map.get(raw)!;
  const stripped = raw.replace(/\s*[\(×x]\s*\d+\)?\s*$/, '').trim();
  if (stripped !== raw && map.has(stripped)) return map.get(stripped)!;
  for (const [n, u] of map) { if (raw.includes(n) || n.includes(raw)) return u; }
  return null;
};

const g2gImg = (o: G2GOffer): string | null => {
  const id = o.primary_img_attributes?.[0] ?? o.offer_title_collection_tree?.[1];
  if (id) return `https://assets.g2g.com/offer_title_collection/${id}.png`;
  if (o.brand_id) return `https://assets.g2g.com/brand/${o.brand_id}.jpg`;
  return null;
};

// ── Eldorado: OfferCard ───────────────────────────────────────────────────────

const OfferCard = ({ offer, cdnUrl, isOwn, onClick, onEdit, onStockUpdate }: {
  offer: OfferItem; cdnUrl?: string | null; isOwn?: boolean;
  onClick?: () => void; onEdit?: () => void; onStockUpdate?: (q: number) => void;
}) => {
  const [editingStock, setEditingStock] = useState(false);
  const [stockVal, setStockVal] = useState(String(offer.quantity));
  useEffect(() => setStockVal(String(offer.quantity)), [offer.quantity]);

  const fallbacks: string[] = [];
  if (cdnUrl) fallbacks.push(cdnUrl);
  const raw = extractImage(offer);
  if (raw) fallbacks.push(...eldoCandidates(raw, 200));
  const primary = fallbacks[0] ?? null;

  const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    const next = parseInt(img.dataset.fi || '0') + 1;
    if (next < fallbacks.length) { img.dataset.fi = String(next); img.src = fallbacks[next]; }
    else { img.onerror = null; img.src = ''; }
  };

  const dp = offer.pricePerUnitInUSD || offer.pricePerUnit || { amount: 0, currency: 'USD' };

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ y: -2 }}
      onClick={() => onClick?.()}
      className={cn("group bg-zinc-900 rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-xl",
        isOwn ? "border-2 border-violet-500 shadow-lg shadow-violet-500/20" : "border border-zinc-800 hover:border-violet-500/50")}>
      <div className="relative aspect-square overflow-hidden bg-zinc-950">
        {primary ? (
          <img src={primary} data-fi="0" alt={offer.offerTitle}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer" onError={onImgErr} />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-zinc-800" /></div>
        )}
        <div className="absolute top-2 right-2">
          <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider backdrop-blur-md",
            offer.offerState === 'Active' ? "text-green-400 bg-green-500/20 border-green-500/30" :
            offer.offerState === 'Paused' ? "text-amber-400 bg-amber-500/20 border-amber-500/30" :
            "text-red-400 bg-red-500/20 border-red-500/30")}>
            {offer.offerState}
          </span>
        </div>
      </div>
      <div className="p-2 flex flex-col flex-grow">
        <h3 className="text-[11px] font-bold text-white line-clamp-2 group-hover:text-violet-400 transition-colors leading-tight min-h-[1.75rem]">
          {offer.offerTitle || offer.gameCategoryTitle}
        </h3>
        <div className="mt-auto pt-1.5 border-t border-zinc-800/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Price</div>
              <div className="text-xs font-black text-violet-500">${dp.amount.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Stock</div>
              {editingStock && onStockUpdate ? (
                <input type="number" value={stockVal} autoFocus
                  onChange={e => setStockVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { const q = parseInt(stockVal); if (!isNaN(q) && q > 0) onStockUpdate(q); setEditingStock(false); }
                    else if (e.key === 'Escape') { setStockVal(String(offer.quantity)); setEditingStock(false); }
                  }}
                  onBlur={() => { setStockVal(String(offer.quantity)); setEditingStock(false); }}
                  onClick={e => e.stopPropagation()}
                  className="w-12 text-[10px] font-bold text-zinc-300 bg-zinc-800 border border-violet-500/50 rounded px-1 text-right focus:outline-none" />
              ) : (
                <div className={cn("text-[10px] font-bold text-zinc-300", onStockUpdate && "cursor-pointer hover:text-violet-400")}
                  onClick={e => { if (onStockUpdate) { e.stopPropagation(); setEditingStock(true); } }}>
                  {offer.quantity}
                </div>
              )}
            </div>
          </div>
          {isOwn && onEdit && (
            <div className="mt-1.5 flex justify-end">
              <button onClick={e => { e.stopPropagation(); onEdit(); }}
                className="p-1 bg-zinc-800 hover:bg-violet-500 text-zinc-400 hover:text-white rounded-md transition-all">
                <Edit2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── Eldorado: EditPriceModal ──────────────────────────────────────────────────

const EditPriceModal = ({ offer, token, cdnUrl, onClose, onUpdate }: {
  offer: OfferItem; token: string; cdnUrl?: string | null;
  onClose: () => void; onUpdate: (silent?: boolean) => Promise<OfferItem[]>;
}) => {
  const dp = offer.pricePerUnitInUSD || offer.pricePerUnit || { amount: 0, currency: 'USD' };
  const [price, setPrice] = useState(dp.amount.toString());
  const [qty, setQty] = useState(offer.quantity.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const thumbFallbacks = (() => { const r = extractImage(offer); return r ? eldoCandidates(r, 96) : []; })();

  const handleSave = async () => {
    setLoading(true); setError(null);
    try {
      const np = parseFloat(price); const nq = parseInt(qty);
      const imgObj = buildMainOfferImage(offer) ?? (cdnUrl ? { smallImage: cdnUrl, largeImage: cdnUrl } : undefined);
      await axios.put(`/api/eldorado/offers/${offer.id}/details`, {
        quantity: nq, offerTitle: offer.offerTitle || offer.gameCategoryTitle,
        description: offer.description ?? '', gameId: offer.gameId, category: offer.category,
        currentPrice: np, currentCurrency: 'USD', guaranteedDeliveryTime: offer.guaranteedDeliveryTime,
        mainOfferImage: imgObj, offerImages: offer.offerImages,
      }, { headers: { Authorization: token } });
      if (np !== dp.amount) {
        try { await axios.put(`/api/eldorado/offers/${offer.id}/change-price`, { amount: np, currency: 'USD' }, { headers: { Authorization: token } }); } catch {}
      }
      let attempts = 0;
      const poll = async () => {
        attempts++;
        const results = await onUpdate(true);
        const updated = results?.find((o: any) => o.id === offer.id);
        if (updated) {
          const cp = updated.pricePerUnitInUSD?.amount || updated.pricePerUnit?.amount;
          if (cp !== undefined) setLivePrice(cp);
          if (cp === np || attempts >= 5) { await onUpdate(); onClose(); } else setTimeout(poll, 1500);
        } else setTimeout(poll, 1500);
      };
      setTimeout(poll, 1500);
    } catch (err: any) {
      const d = err.response?.data;
      setError(d?.error || d?.message || d?.title || `Failed (${err.response?.status ?? 'error'})`);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-base font-black text-white uppercase tracking-tighter">Edit Listing</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-zinc-950 rounded-xl border border-zinc-800">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-zinc-800">
              {thumbFallbacks.length > 0 ? (
                <img src={thumbFallbacks[0]} data-fi="0" alt="" className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={e => { const img = e.target as HTMLImageElement; const n = parseInt(img.dataset.fi||'0')+1; if(n<thumbFallbacks.length){img.dataset.fi=String(n);img.src=thumbFallbacks[n];}else img.onerror=null; }} />
              ) : <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 text-zinc-800" /></div>}
            </div>
            <div className="min-w-0 flex-grow">
              <p className="text-xs font-bold text-white truncate">{offer.offerTitle}</p>
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-zinc-500 uppercase">{offer.gameCategoryTitle}</p>
                {livePrice !== null && <span className="text-[9px] font-black text-violet-500 animate-pulse">Live: ${livePrice.toFixed(2)}</span>}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Price (USD)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
              <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-4 py-3 text-white font-bold focus:outline-none focus:border-violet-500 transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Quantity</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-violet-500 transition-all" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-500/10 p-2 rounded border border-red-500/20">{error}</p>}
          <button onClick={handleSave} disabled={loading}
            className="w-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all text-xs uppercase tracking-widest">
            {loading ? 'Updating...' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Eldorado: MarketPricesModal ───────────────────────────────────────────────

const MarketModal = ({ offer, unitMap, onClose, onEdit }: {
  offer: OfferItem; unitMap: Map<string, string>; onClose: () => void; onEdit: (o: OfferItem) => void;
}) => {
  const [items, setItems] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = (offer.offerTitle || offer.gameCategoryTitle || '').split(' | ')[0].trim();
    const norm = (data: any[]): OfferItem[] =>
      data.map((r: any) => ({ ...(r.offer || r), offerTitle: r.offer?.offerTitle || r.offerTitle || r.gameCategoryTitle || '', offerState: r.offer?.offerState || r.offerState || 'Active' }))
        .sort((a: any, b: any) => (a.pricePerUnitInUSD?.amount || a.pricePerUnit?.amount || 0) - (b.pricePerUnitInUSD?.amount || b.pricePerUnit?.amount || 0));
    (async () => {
      try {
        const r = await axios.get('/api/eldorado/public-item-offers', { params: { gameId: offer.gameId, category: offer.category, searchQuery: q, pageSize: 24 } });
        if (r.data.results?.length > 0) { setItems(norm(r.data.results)); return; }
      } catch {}
      try {
        const r = await axios.get('/api/eldorado/predefined-offers', { params: { gameId: offer.gameId, category: offer.category, searchQuery: q, pageSize: 24 } });
        if (r.data.results) setItems(norm(r.data.results));
      } catch {}
      setLoading(false);
    })();
    setLoading(false);
  }, [offer]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tighter">Market Prices</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Comparing: <span className="text-violet-400">{offer.offerTitle}</span></p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-grow overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl aspect-[4/5] animate-pulse" />)}
            </div>
          ) : items.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {items.map(o => (
                <OfferCard key={o.id} offer={o} cdnUrl={lookupCdn(o, unitMap)}
                  isOwn={o.id === offer.id} onEdit={o.id === offer.id ? () => onEdit(o) : undefined} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20"><Package className="w-12 h-12 text-zinc-800 mx-auto mb-3" /><p className="text-zinc-500 text-sm">No offers found</p></div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── ZeusX: ZXSaleCard ────────────────────────────────────────────────────────

const ZXSaleCard = ({ sale, isOwn, onClick, onQtyUpdate, onEdit }: {
  sale: ZXSale; isOwn?: boolean; onClick?: () => void;
  onQtyUpdate?: (id: string, q: number) => Promise<void>; onEdit?: () => void;
}) => {
  const [editingQty, setEditingQty] = useState(false);
  const [qtyVal, setQtyVal] = useState(String(sale.quantity ?? 1));
  useEffect(() => setQtyVal(String(sale.quantity ?? 1)), [sale.quantity]);

  const isActive = sale.offer_status === 'CREATED' && !sale.is_hidden;
  const isHidden = sale.offer_status === 'CREATED' && sale.is_hidden;
  const isSold = sale.offer_status === 'GOOD_DELIVERY';
  const label = isActive ? 'Active' : isHidden ? 'Hidden' : isSold ? 'Sold' : sale.offer_status;
  const sc = isActive ? 'text-green-400 bg-green-500/20 border-green-500/30'
    : isHidden ? 'text-amber-400 bg-amber-500/20 border-amber-500/30'
    : isSold ? 'text-zinc-500 bg-zinc-800/50 border-zinc-700/30'
    : 'text-red-400 bg-red-500/20 border-red-500/30';
  const photo = sale.cover_photo?.startsWith('http') ? sale.cover_photo
    : sale.cover_photo ? `https://cdn-offer-photos.zeusx.com/${sale.cover_photo}` : null;

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn("group bg-zinc-900 rounded-xl overflow-hidden flex flex-col transition-all", onClick && "cursor-pointer",
        isOwn ? "border-2 border-violet-500 shadow-lg shadow-violet-500/20" : "border border-zinc-800 hover:border-violet-500/50 hover:shadow-xl")}>
      <div className="relative aspect-square overflow-hidden bg-zinc-950">
        {photo ? <img src={photo} alt={sale.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-zinc-800" /></div>}
        <div className="absolute top-2 right-2">
          <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider backdrop-blur-md", sc)}>{label}</span>
        </div>
        {isOwn && <div className="absolute top-2 left-2"><span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-500 text-white uppercase border border-violet-400">Mine</span></div>}
      </div>
      <div className="p-2 flex flex-col flex-grow">
        <h3 className="text-[11px] font-bold text-white line-clamp-2 group-hover:text-violet-400 transition-colors leading-tight mb-1">{sale.title}</h3>
        <div className="mt-auto pt-1.5 border-t border-zinc-800/50">
          <div className="flex items-center justify-between">
            <div><div className="text-[8px] text-zinc-500 font-bold uppercase">Price</div><div className="text-xs font-black text-violet-500">${sale.listed_price.toFixed(2)}</div></div>
            {sale.has_multiple_stock && (
              <div className="text-right">
                <div className="text-[8px] text-zinc-500 font-bold uppercase">Stock</div>
                {editingQty && onQtyUpdate ? (
                  <input type="number" autoFocus value={qtyVal} onChange={e => setQtyVal(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter'){const q=parseInt(qtyVal);if(!isNaN(q)&&q>=0&&onQtyUpdate)onQtyUpdate(sale.offer_id,q);setEditingQty(false);}else if(e.key==='Escape'){setQtyVal(String(sale.quantity??1));setEditingQty(false);} }}
                    onBlur={() => { setQtyVal(String(sale.quantity??1)); setEditingQty(false); }}
                    onClick={e => e.stopPropagation()}
                    className="w-12 text-[10px] font-bold text-zinc-300 bg-zinc-800 border border-violet-500/50 rounded px-1 text-right focus:outline-none" />
                ) : (
                  <div className={cn("text-[10px] font-bold text-zinc-300", onQtyUpdate && "cursor-pointer hover:text-violet-400")}
                    onClick={e => { if(onQtyUpdate){e.stopPropagation();setEditingQty(true);} }}>
                    {sale.quantity ?? 1}
                  </div>
                )}
              </div>
            )}
          </div>
          {isOwn && onEdit && sale.offer_status === 'CREATED' && (
            <div className="mt-1.5 flex justify-end">
              <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-1 bg-zinc-800 hover:bg-violet-500 text-zinc-400 hover:text-white rounded-md transition-all"><Edit2 className="w-2.5 h-2.5" /></button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── ZeusX: ZXEditModal ───────────────────────────────────────────────────────

const ZXEditModal = ({ sale, token, cf, onClose, onUpdate }: {
  sale: ZXSale; token: string; cf?: string; onClose: () => void; onUpdate: () => void;
}) => {
  const [price, setPrice] = useState(sale.listed_price.toFixed(2));
  const [qty, setQty] = useState(String(sale.quantity ?? 1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true); setError(null);
    try {
      const np = parseFloat(price); const nq = parseInt(qty);
      const full: any = { ...sale, id: sale.offer_id,
        listed_price: !isNaN(np) ? np : sale.listed_price,
        ...(sale.has_multiple_stock && !isNaN(nq) ? { quantity: nq } : {}),
        agreeTerm: true, removing_photo_ids: [], photos: [], uploaded_photos: [],
        service_category_id: sale.service_category_id || sale.service_category || sale.service_category_base_id,
        service_category: sale.service_category_id || sale.service_category || sale.service_category_base_id,
        offer_base_attribute_value: (sale.attribute_values || []).map((av: any) => ({ base_attribute_id: av.base_attribute_id, base_attribute_value: av.base_attribute_value })),
      };
      const r = await axios.put(`/api/zeusx/offer/${sale.offer_id}`, { _fullOffer: full },
        { headers: { 'x-zx-token': token, ...(cf ? { 'x-zx-cf': cf } : {}) } });
      if (r.data?.status === 'FAILURE' || r.data?.error) throw new Error(String(r.data?.error?.message ?? r.data?.error ?? 'Failure'));
      onUpdate(); onClose();
    } catch (e: any) {
      const raw = e.response?.data?.message ?? e.response?.data?.error ?? e.message ?? 'Update failed';
      setError(`${e.response?.status ? e.response.status + ': ' : ''}${typeof raw === 'string' ? raw : JSON.stringify(raw)}`);
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold">Edit ZeusX Listing</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-zinc-400 text-sm mb-4 truncate">{sale.title}</p>
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs break-all">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Price (USD)</label>
            <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
          </div>
          {sale.has_multiple_stock && (
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Quantity</label>
              <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white text-sm">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold text-sm">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Gameflip: GFListingCard ───────────────────────────────────────────────────

const GFListingCard = ({ listing, isOwn, onClick, onQtyUpdate, onEdit }: {
  listing: GFListing; isOwn?: boolean; onClick?: () => void;
  onQtyUpdate?: (id: string, q: number) => Promise<void>; onEdit?: () => void;
}) => {
  const [editingQty, setEditingQty] = useState(false);
  const [qtyVal, setQtyVal] = useState(String(listing.qty_avail ?? 1));
  useEffect(() => setQtyVal(String(listing.qty_avail ?? 1)), [listing.qty_avail]);

  const photo = (() => {
    if (!listing.photo) return null;
    if (listing.cover_photo && listing.photo[listing.cover_photo]?.view_url) return listing.photo[listing.cover_photo].view_url;
    const active = Object.entries(listing.photo).filter(([, p]) => p.status === 'active' && p.view_url)
      .sort(([, a], [, b]) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return active[0]?.[1].view_url ?? null;
  })();

  const sc = listing.status === 'onsale' ? 'text-green-400 bg-green-500/10 border-green-500/20'
    : listing.status === 'sold' ? 'text-zinc-500 bg-zinc-800/50 border-zinc-700/30'
    : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  const canEdit = listing.status === 'onsale' || listing.status === 'ready';

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn("group bg-zinc-900 rounded-xl overflow-hidden flex flex-col transition-all", onClick && "cursor-pointer",
        isOwn ? "border-2 border-violet-500 shadow-lg shadow-violet-500/20" : "border border-zinc-800 hover:border-violet-500/50 hover:shadow-xl")}>
      <div className="relative aspect-square overflow-hidden bg-zinc-950">
        {photo ? <img src={photo} alt={listing.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-zinc-700" /></div>}
        <div className="absolute top-2 right-2">
          <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider backdrop-blur-md", sc)}>
            {listing.status === 'onsale' ? 'On Sale' : listing.status}
          </span>
        </div>
        {isOwn && <div className="absolute top-2 left-2"><span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-500 text-white uppercase border border-violet-400">Mine</span></div>}
      </div>
      <div className="p-2 flex flex-col flex-grow">
        <p className="text-white text-[11px] font-bold leading-tight line-clamp-2 group-hover:text-violet-400 transition-colors mb-1">{listing.name}</p>
        <div className="mt-auto pt-1.5 border-t border-zinc-800/50">
          <div className="flex items-center justify-between">
            <div><div className="text-[8px] text-zinc-500 font-bold uppercase">Price</div><div className="text-xs font-black text-violet-500">${(listing.price / 100).toFixed(2)}</div></div>
            <div className="text-right">
              <div className="text-[8px] text-zinc-500 font-bold uppercase">Stock</div>
              {editingQty && onQtyUpdate ? (
                <input type="number" autoFocus value={qtyVal} onChange={e => setQtyVal(e.target.value)}
                  onKeyDown={e => { if(e.key==='Enter'){const q=parseInt(qtyVal);if(!isNaN(q)&&q>=0&&onQtyUpdate)onQtyUpdate(listing.id,q);setEditingQty(false);}else if(e.key==='Escape'){setQtyVal(String(listing.qty_avail??1));setEditingQty(false);} }}
                  onBlur={() => { setQtyVal(String(listing.qty_avail??1)); setEditingQty(false); }}
                  onClick={e => e.stopPropagation()}
                  className="w-12 text-[10px] font-bold text-zinc-300 bg-zinc-800 border border-violet-500/50 rounded px-1 text-right focus:outline-none" />
              ) : (
                <div className={cn("text-[10px] font-bold text-zinc-300", canEdit && onQtyUpdate && "cursor-pointer hover:text-violet-400")}
                  onClick={e => { if(canEdit&&onQtyUpdate){e.stopPropagation();setEditingQty(true);} }}>{listing.qty_avail ?? 1}</div>
              )}
            </div>
          </div>
          {isOwn && onEdit && canEdit && (
            <div className="mt-1.5 flex justify-end">
              <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-1 bg-zinc-800 hover:bg-violet-500 text-zinc-400 hover:text-white rounded-md transition-all"><Edit2 className="w-2.5 h-2.5" /></button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── Gameflip: GFEditModal ────────────────────────────────────────────────────

const GFEditModal = ({ listing, gfKey, gfSecret, onClose, onUpdate }: {
  listing: GFListing; gfKey: string; gfSecret: string; onClose: () => void; onUpdate: () => void;
}) => {
  const [price, setPrice] = useState((listing.price / 100).toFixed(2));
  const [qty, setQty] = useState(String(listing.qty_avail ?? 1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true); setError(null);
    try {
      const ops: any[] = [];
      const np = Math.round(parseFloat(price) * 100);
      if (np !== listing.price) ops.push({ op: 'replace', path: '/price', value: np });
      const nq = parseInt(qty);
      if (!isNaN(nq) && nq !== listing.qty_avail) ops.push({ op: 'replace', path: '/qty_avail', value: nq });
      if (ops.length === 0) { onClose(); return; }
      await axios.patch(`/api/gameflip/listing/${listing.id}`, ops, { headers: { 'x-gf-key': gfKey, 'x-gf-secret': gfSecret, 'x-gf-version': String(listing.version) } });
      onUpdate(); onClose();
    } catch (e: any) {
      const d = e.response?.data;
      const raw = d?.error?.message ?? d?.message ?? d?.error ?? e.message ?? 'Update failed';
      setError(typeof raw === 'string' ? raw : JSON.stringify(raw));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold">Edit Gameflip Listing</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-zinc-400 text-sm mb-4 truncate">{listing.name}</p>
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Price (USD)</label>
            <input type="number" step="0.01" min="0.75" value={price} onChange={e => setPrice(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Quantity</label>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white text-sm">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold text-sm">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Gameflip: GFMarketModal ──────────────────────────────────────────────────

const GFMarketModal = ({ listing, gfKey, gfSecret, gfUserId, onClose, onEdit }: {
  listing: GFListing; gfKey: string; gfSecret: string; gfUserId: string;
  onClose: () => void; onEdit: () => void;
}) => {
  const [results, setResults] = useState<GFListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const doFetch = async () => {
      setLoading(true);
      try {
        const r = await axios.get('/api/gameflip/search', {
          headers: { 'x-gf-key': gfKey, 'x-gf-secret': gfSecret },
          params: { status: 'onsale', limit: 100, sort: 'price:asc', name: listing.name },
        });
        const raw = r.data?.data;
        const items: GFListing[] = Array.isArray(raw) ? raw : (raw?.listings ?? []);
        setResults(items.sort((a, b) => a.price - b.price));
      } catch { setResults([]); }
      finally { setLoading(false); }
    };
    doFetch();
  }, [listing.id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tighter">Market Prices</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Comparing: <span className="text-violet-400 normal-case font-semibold">{listing.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-grow overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl aspect-[4/5] animate-pulse" />)}
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {results.map(r => (
                <div key={r.id}>
                  <GFListingCard listing={r} isOwn={r.owner === gfUserId}
                    onEdit={r.owner === gfUserId ? onEdit : undefined} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Package className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest">No other listings found</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── G2G: G2GOfferCard ─────────────────────────────────────────────────────────

const G2GOfferCard = ({ offer, onEdit, onMarket }: { offer: G2GOffer; onEdit: () => void; onMarket: () => void }) => {
  const [imgErr, setImgErr] = useState(false);
  const imgUrl = imgErr ? null : g2gImg(offer);
  const cur = offer.offer_currency ?? offer.currency ?? 'USD';
  const qty = offer.api_qty ?? offer.available_qty ?? 0;
  const sc = offer.status === 'live' ? 'text-green-400 bg-green-500/20 border-green-500/30'
    : offer.status === 'delisted' ? 'text-zinc-500 bg-zinc-800/50 border-zinc-700/30'
    : 'text-amber-400 bg-amber-500/20 border-amber-500/30';

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ y: -2 }}
      onClick={onMarket}
      className="group bg-zinc-900 border border-zinc-800 hover:border-violet-500/50 rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-xl">
      <div className="relative aspect-square overflow-hidden bg-zinc-950">
        {imgUrl ? <img src={imgUrl} alt={offer.title} onError={() => setImgErr(true)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-zinc-800" /></div>}
        <div className="absolute top-2 right-2"><span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider backdrop-blur-md", sc)}>{offer.status ?? 'live'}</span></div>
        <div className="absolute top-2 left-2">
          <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-1 bg-zinc-800/80 hover:bg-violet-500 text-zinc-400 hover:text-white rounded-md transition-all backdrop-blur-sm"><Edit2 className="w-2.5 h-2.5" /></button>
        </div>
      </div>
      <div className="p-2 flex flex-col flex-grow">
        <h3 className="text-[11px] font-bold text-white line-clamp-2 group-hover:text-violet-400 transition-colors leading-tight mb-1">{offer.title || offer.offer_id}</h3>
        <div className="mt-auto pt-1.5 border-t border-zinc-800/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[8px] text-zinc-500 font-bold uppercase">Price</div>
              <div className="text-xs font-black text-violet-500">{cur} {(offer.unit_price ?? 0).toLocaleString()}</div>
              {offer.display_price && <div className="text-[9px] text-zinc-500">≈ ${offer.display_price}</div>}
            </div>
            <div className="text-right"><div className="text-[8px] text-zinc-500 font-bold uppercase">Stock</div><div className="text-[10px] font-bold text-zinc-300">{qty.toLocaleString()}</div></div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ── G2G: G2GEditModal ─────────────────────────────────────────────────────────

const G2GEditModal = ({ offer, g2gKey, g2gSecret, g2gUser, onClose, onUpdate }: {
  offer: G2GOffer; g2gKey: string; g2gSecret: string; g2gUser: string; onClose: () => void; onUpdate: () => void;
}) => {
  const [price, setPrice] = useState(String(offer.unit_price ?? ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cur = offer.offer_currency ?? offer.currency ?? 'PHP';

  const handleSave = async () => {
    setLoading(true); setError(null);
    try {
      const np = parseFloat(price);
      if (isNaN(np)) { setError('Invalid price'); setLoading(false); return; }
      const r = await axios.patch(`/api/g2g/offer/${offer.offer_id}`, { unit_price: np }, { headers: { 'x-g2g-key': g2gKey, 'x-g2g-secret': g2gSecret, 'x-g2g-user': g2gUser } });
      const code = r.data?.code;
      if (code && code !== 2000 && code !== '2000' && code !== 20000001) throw new Error(r.data?.message ?? JSON.stringify(r.data));
      onUpdate(); onClose();
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.response?.data?.error ?? e.message ?? 'Update failed';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold">Edit G2G Offer</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-zinc-400 text-sm mb-4 truncate">{offer.title || offer.offer_id}</p>
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm break-all">{error}</div>}
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Unit Price ({cur})</label>
          <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white text-sm">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold text-sm">
            {loading ? 'Saving...' : 'Save Price'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── G2G: G2GMarketModal ───────────────────────────────────────────────────────

const G2GMarketModal = ({ offer, sellerId, g2gKey, g2gSecret, g2gJwt, onClose, onEdit }: {
  offer: G2GOffer; sellerId: string; g2gKey: string; g2gSecret: string; g2gJwt: string;
  onClose: () => void; onEdit: () => void;
}) => {
  const [competitors, setCompetitors] = useState<G2GOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cur = offer.offer_currency ?? offer.currency ?? 'USD';

  useEffect(() => {
    const search = (attrs: any[]) => {
      const params: any = {};
      if (attrs?.length > 0) {
        const cid = attrs[0].collection_id ?? attrs[0].attribute_group_id;
        const did = attrs[0].dataset_id ?? attrs[0].attribute_id;
        if (cid && did) params.fa = `${cid}:${did}`;
      }
      if (!params.fa && offer.offer_title_collection_tree?.length) params.fa = offer.offer_title_collection_tree[0];
      if (offer.title) params.q = offer.title.split(' | ')[0].trim();
      if (offer.brand_id) params.brand_id = offer.brand_id;
      const offerCur = (offer.offer_currency ?? offer.currency ?? 'USD').toUpperCase();
      params.currency = offerCur;
      const c2c: Record<string, string> = { PHP: 'PH', USD: 'US', SGD: 'SG', MYR: 'MY', AUD: 'AU', EUR: 'DE', GBP: 'GB', THB: 'TH', IDR: 'ID' };
      params.country = c2c[offerCur] ?? 'US';
      if (!params.fa && !params.q) { setLoading(false); setError('Not enough data to search'); return; }
      const headers: any = {};
      if (g2gJwt) headers['x-g2g-jwt'] = g2gJwt;
      axios.get('/api/g2g/market', { params, headers })
        .then(r => setCompetitors((r.data?.payload?.results ?? []).sort((a: any, b: any) => (a.unit_price ?? 0) - (b.unit_price ?? 0))))
        .catch(e => setError(e.response?.data?.error ?? 'Failed to load'))
        .finally(() => setLoading(false));
    };
    const attrs = offer.offer_attributes as any[];
    const hasAttrs = attrs?.length > 0 && (attrs[0].collection_id || attrs[0].attribute_group_id);
    if (hasAttrs) { search(attrs); }
    else {
      axios.get(`/api/g2g/offer/${offer.offer_id}`, { headers: { 'x-g2g-key': g2gKey, 'x-g2g-secret': g2gSecret, 'x-g2g-user': sellerId } })
        .then(r => search((r.data?.payload ?? r.data)?.offer_attributes ?? []))
        .catch(() => search([]));
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div>
            <h2 className="text-base font-bold text-white">G2G Market Prices</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xs">{offer.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="px-3 py-1.5 text-xs font-semibold bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-all">Edit My Price</button>
            <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-grow overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-zinc-900 rounded-xl animate-pulse" />)}</div>
          ) : error ? (
            <p className="text-red-400 text-sm text-center py-10">{error}</p>
          ) : competitors.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">No other listings found</p>
          ) : (
            <div className="space-y-2">
              {competitors.map((c, i) => {
                const isMe = c.seller_id === sellerId;
                const cCur = c.offer_currency ?? c.currency ?? cur;
                return (
                  <div key={c.offer_id} className={cn("flex items-center justify-between px-4 py-3 rounded-xl border", isMe ? "bg-violet-500/10 border-violet-500/30" : "bg-zinc-900 border-zinc-800")}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-zinc-500 w-5 text-right flex-shrink-0">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className={cn("text-xs font-semibold truncate", isMe ? "text-violet-400" : "text-zinc-300")}>
                          {c.username ?? c.seller_id ?? 'Seller'} {isMe && <span className="text-[10px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full ml-1">YOU</span>}
                        </p>
                        <p className="text-[10px] text-zinc-600">{c.api_qty ?? c.available_qty ?? 0} in stock</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn("text-sm font-black", isMe ? "text-violet-400" : "text-white")}>{cCur} {(c.unit_price ?? 0).toLocaleString()}</p>
                      {c.display_price && <p className="text-[10px] text-zinc-500">≈ ${c.display_price}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── Main ListingsTab ──────────────────────────────────────────────────────────

export default function ListingsTab({ aggregateStorage, tradingAccounts }: ListingsTabProps) {
  const storageList = useMemo(() => Object.values(aggregateStorage || {}), [aggregateStorage]);

  // Tab state
  const [marketTab, setMarketTab] = useState<'analyzer' | 'eldorado' | 'gameflip' | 'zeusx' | 'g2g' | 'tolist'>('analyzer');
  const [toListPlatform, setToListPlatform] = useState<'eldorado' | 'gameflip' | 'zeusx' | 'g2g'>('eldorado');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  // Unit image map for CDN lookup
  const [unitMap, setUnitMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    fetch(`${GTDCDN_BASE}/units.json`).then(r => r.json()).then((units: { id: string; name: string }[]) => {
      const m = new Map<string, string>();
      for (const u of units) m.set(u.name.toLowerCase(), `${GTDCDN_BASE}/images/${u.id}.png`);
      setUnitMap(m);
    }).catch(() => {});
  }, []);

  // ── Credentials ──
  const [eldoToken, setEldoToken] = useState(() => localStorage.getItem('eldorado_token') || '');
  const [eldoTokenInput, setEldoTokenInput] = useState('');
  const [gfKey, setGfKey] = useState(() => localStorage.getItem('gf_key') || '');
  const [gfSecret, setGfSecret] = useState(() => localStorage.getItem('gf_secret') || '');
  const [gfKeyInput, setGfKeyInput] = useState('');
  const [gfSecretInput, setGfSecretInput] = useState('');
  const [gfUserId, setGfUserId] = useState(() => localStorage.getItem('gf_user_id') || '');
  const [zxToken, setZxToken] = useState(() => localStorage.getItem('zeusx_token') || '');
  const [zxTokenInput, setZxTokenInput] = useState('');
  const [zxCf, setZxCf] = useState(() => localStorage.getItem('zeusx_cf') || '');
  const [zxCfInput, setZxCfInput] = useState('');
  const [showZxCfUpdate, setShowZxCfUpdate] = useState(false);
  const [g2gKey, setG2gKey] = useState(() => localStorage.getItem('g2g_key') || '');
  const [g2gSecret, setG2gSecret] = useState(() => localStorage.getItem('g2g_secret') || '');
  const [g2gUser, setG2gUser] = useState(() => localStorage.getItem('g2g_user') || '');
  const [g2gJwt, setG2gJwt] = useState(() => localStorage.getItem('g2g_jwt') || '');
  const [g2gKeyInput, setG2gKeyInput] = useState('');
  const [g2gSecretInput, setG2gSecretInput] = useState('');
  const [g2gUserInput, setG2gUserInput] = useState('');

  // ── Login state ──
  const [eldoLoggedIn, setEldoLoggedIn] = useState(false);
  const [gfLoggedIn, setGfLoggedIn] = useState(false);
  const [zxLoggedIn, setZxLoggedIn] = useState(false);
  const [g2gLoggedIn, setG2gLoggedIn] = useState(false);

  // ── Data ──
  const [eldoOffers, setEldoOffers] = useState<OfferItem[]>([]);
  const [eldoTotalPages, setEldoTotalPages] = useState(0);
  const [eldoPage, setEldoPage] = useState(1);
  const [eldoGameId, setEldoGameId] = useState('268');
  const [eldoState, setEldoState] = useState<string>('Active');
  const [eldoSearch, setEldoSearch] = useState('');
  const [eldoSearchInput, setEldoSearchInput] = useState('');
  const [gfListings, setGfListings] = useState<GFListing[]>([]);
  const [gfWallet, setGfWallet] = useState<any>(null);
  const [gfStatusFilter, setGfStatusFilter] = useState('all');
  const [zxSales, setZxSales] = useState<ZXSale[]>([]);
  const [zxStatusFilter, setZxStatusFilter] = useState('all');
  const [g2gOffers, setG2gOffers] = useState<G2GOffer[]>([]);
  const [g2gPage, setG2gPage] = useState(1);
  const [g2gHasMore, setG2gHasMore] = useState(false);

  // ── Loading ──
  const [loadingEldo, setLoadingEldo] = useState(false);
  const [loadingGf, setLoadingGf] = useState(false);
  const [loadingZx, setLoadingZx] = useState(false);
  const [loadingG2g, setLoadingG2g] = useState(false);

  // ── Modals ──
  const [editingEldo, setEditingEldo] = useState<OfferItem | null>(null);
  const [marketEldo, setMarketEldo] = useState<OfferItem | null>(null);
  const [editingZx, setEditingZx] = useState<ZXSale | null>(null);
  const [editingGf, setEditingGf] = useState<GFListing | null>(null);
  const [marketGf, setMarketGf] = useState<GFListing | null>(null);
  const [editingG2g, setEditingG2g] = useState<G2GOffer | null>(null);
  const [marketG2g, setMarketG2g] = useState<G2GOffer | null>(null);

  // ── Eldorado fetch ──
  const fetchEldorado = async (silent = false): Promise<OfferItem[]> => {
    if (!eldoToken) return [];
    if (!silent) setLoadingEldo(true);
    try {
      const all: OfferItem[] = [];
      const PAGE_SIZE = 20; // Eldorado default page size (API caps at 20)
      const baseParams = {
        pageSize: PAGE_SIZE,
        gameId: eldoGameId || undefined,
        offerState: eldoState === 'All' ? undefined : eldoState,
        searchQuery: eldoSearch || undefined,
        category: 'CustomItem',
      };

      const normalizeOffer = (o: any): OfferItem => ({
        ...o,
        offerTitle: o.offerTitle || o.gameCategoryTitle || o.title || o.name || '',
        gameCategoryTitle: o.gameCategoryTitle || o.offerTitle || o.title || o.name || '',
        pricePerUnit: o.pricePerUnit || (o.price ? { amount: o.price?.amount ?? o.price, currency: o.price?.currency ?? 'USD' } : { amount: 0, currency: 'USD' }),
        pricePerUnitInUSD: o.pricePerUnitInUSD || o.pricePerUnit || (o.price ? { amount: o.price?.amount ?? o.price, currency: 'USD' } : undefined),
        quantity: o.quantity ?? o.stock ?? 0,
        offerState: o.offerState || o.state || 'Active',
      });

      let page = 1;
      let totalPages = 999; // start high; we'll learn the real value from first response

      while (page <= totalPages) {
        let pageData: any = null;
        try {
          const r = await axios.get('/api/eldorado/offers', {
            headers: { Authorization: eldoToken },
            params: { ...baseParams, pageIndex: page },
          });
          pageData = r.data;
        } catch (err: any) {
          if (err.response?.status === 401 || err.response?.status === 403) {
            triggerToast('Eldorado token expired — please reconnect', 'error');
            setEldoLoggedIn(false);
          }
          break;
        }

        const results: any[] = pageData?.results || pageData?.items || [];
        if (results.length === 0) break;

        all.push(...results.map(normalizeOffer));

        // Resolve totalPages from any field Eldorado might use
        const knownTotal =
          pageData?.totalPages ??
          pageData?.total_pages ??
          pageData?.pages ??
          (pageData?.recordCount != null ? Math.ceil(pageData.recordCount / PAGE_SIZE) : null) ??
          (pageData?.totalRecords != null ? Math.ceil(pageData.totalRecords / PAGE_SIZE) : null);

        if (knownTotal != null) {
          totalPages = Number(knownTotal);
        } else if (results.length < PAGE_SIZE) {
          // Got a partial page — this is the last one
          break;
        } else {
          // Still don't know how many pages; keep going
          totalPages = page + 10; // safety cap: at most 10 more pages
        }

        page++;
      }

      // Fallback: flexible offers if item-management returned nothing
      if (all.length === 0) {
        try {
          const r = await axios.get('/api/eldorado/flexible-offers', {
            headers: { Authorization: eldoToken },
            params: { ...baseParams, pageIndex: 1 },
          });
          const res: any[] = r.data?.results || r.data?.items || [];
          all.push(...res.map(normalizeOffer));
        } catch {}
      }

      setEldoOffers(all);
      return all;
    } finally { if (!silent) setLoadingEldo(false); }
  };

  const connectEldorado = async () => {
    const t = eldoTokenInput.trim(); if (!t) return;
    setLoadingEldo(true);
    try {
      await axios.get('/api/eldorado/notifications', { headers: { Authorization: t } });
      setEldoToken(t); localStorage.setItem('eldorado_token', t); setEldoLoggedIn(true);
      triggerToast('Connected to Eldorado!');
    } catch { triggerToast('Failed to connect — check token', 'error'); }
    finally { setLoadingEldo(false); }
  };

  const disconnectEldorado = () => {
    localStorage.removeItem('eldorado_token'); setEldoToken(''); setEldoLoggedIn(false);
    setEldoOffers([]); triggerToast('Disconnected from Eldorado', 'info');
  };

  // ── Gameflip fetch ──
  const fetchGameflip = async (userId?: string) => {
    const uid = userId || gfUserId; if (!gfKey || !gfSecret) return;
    setLoadingGf(true);
    try {
      const hdrs = { 'x-gf-key': gfKey, 'x-gf-secret': gfSecret };
      const params: any = { owner: uid, limit: 100 };
      if (gfStatusFilter !== 'all') params.status = gfStatusFilter;
      const [listRes, walletRes] = await Promise.all([
        axios.get('/api/gameflip/listings', { headers: hdrs, params }),
        axios.get('/api/gameflip/wallet', { headers: hdrs }),
      ]);
      const raw = listRes.data.data;
      setGfListings(Array.isArray(raw) ? raw : (raw?.listings ?? []));
      setGfWallet(walletRes.data.data || walletRes.data || null);
    } finally { setLoadingGf(false); }
  };

  const connectGameflip = async () => {
    const key = gfKeyInput.trim(); const secret = gfSecretInput.trim();
    if (!key || !secret) return;
    setLoadingGf(true);
    try {
      const hdrs = { 'x-gf-key': key, 'x-gf-secret': secret };
      const r = await axios.get('/api/gameflip/me', { headers: hdrs });
      const d = r.data?.data ?? r.data;
      const uid = d?.owner || d?.id || d?.profile?.owner || d?.profile?.id;
      if (!uid) throw new Error('Could not get user ID');
      setGfKey(key); setGfSecret(secret); setGfUserId(uid);
      localStorage.setItem('gf_key', key); localStorage.setItem('gf_secret', secret); localStorage.setItem('gf_user_id', uid);
      setGfLoggedIn(true);
      triggerToast('Connected to Gameflip!');
      await fetchGameflip(uid);
    } catch (e: any) { triggerToast(e.message || 'Failed to connect', 'error'); }
    finally { setLoadingGf(false); }
  };

  const disconnectGameflip = () => {
    localStorage.removeItem('gf_key'); localStorage.removeItem('gf_secret'); localStorage.removeItem('gf_user_id');
    setGfKey(''); setGfSecret(''); setGfUserId(''); setGfLoggedIn(false); setGfListings([]); setGfWallet(null);
    triggerToast('Disconnected from Gameflip', 'info');
  };

  const handleGfQtyUpdate = async (id: string, qty: number) => {
    await axios.patch(`/api/gameflip/listing/${id}`, [{ op: 'replace', path: '/qty_avail', value: qty }], { headers: { 'x-gf-key': gfKey, 'x-gf-secret': gfSecret } });
    setGfListings(prev => prev.map(l => l.id === id ? { ...l, qty_avail: qty } : l));
  };

  // ── ZeusX fetch ──
  const fetchZeusx = async (tok = zxToken) => {
    if (!tok) return;
    setLoadingZx(true);
    try {
      const all: ZXSale[] = [];
      let page = 0;
      let totalPages: number | null = null;
      while (true) {
        const r = await axios.get('/api/zeusx/listings', { headers: { 'x-zx-token': tok }, params: { pageIndex: page } });
        const payload = r.data?.data ?? r.data;
        const sales: ZXSale[] = payload?.sales ?? [];
        all.push(...sales);
        if (totalPages === null) {
          const tp = payload?.totalPages ?? payload?.total_pages ?? payload?.pages ?? payload?.totalCount ?? payload?.total_count;
          if (tp != null) totalPages = Number(tp);
        }
        page++;
        if (totalPages !== null && page >= totalPages) break;
        if (sales.length === 0) break;
        if (page > 50) break;
      }
      setZxSales(all);
    } finally { setLoadingZx(false); }
  };

  const connectZeusx = async () => {
    const t = zxTokenInput.trim(); const cf = zxCfInput.trim();
    if (!t) return;
    setLoadingZx(true);
    try {
      await axios.get('/api/zeusx/me', { headers: { 'x-zx-token': t } });
      setZxToken(t); localStorage.setItem('zeusx_token', t);
      if (cf) { setZxCf(cf); localStorage.setItem('zeusx_cf', cf); }
      setZxLoggedIn(true); triggerToast('Connected to ZeusX!');
      await fetchZeusx(t);
    } catch { triggerToast('Failed to connect — check token', 'error'); }
    finally { setLoadingZx(false); }
  };

  const disconnectZeusx = () => {
    localStorage.removeItem('zeusx_token'); localStorage.removeItem('zeusx_cf');
    setZxToken(''); setZxCf(''); setZxLoggedIn(false); setZxSales([]);
    triggerToast('Disconnected from ZeusX', 'info');
  };

  const handleZxQtyUpdate = async (id: string, qty: number) => {
    await axios.put(`/api/zeusx/offer/${id}`, { quantity: qty }, { headers: { 'x-zx-token': zxToken, ...(zxCf ? { 'x-zx-cf': zxCf } : {}) } });
    setZxSales(prev => prev.map(s => s.offer_id === id ? { ...s, quantity: qty } : s));
  };

  // ── G2G fetch ──
  const fetchG2g = async (p = 1, keyOverride?: string) => {
    const key = keyOverride || g2gKey; if (!key || !g2gSecret) return;
    setLoadingG2g(true);
    try {
      const r = await axios.get('/api/g2g/offers', { headers: { 'x-g2g-key': key, 'x-g2g-secret': g2gSecret, 'x-g2g-user': g2gUser }, params: { page: p, page_size: 48 } });
      const payload = r.data?.payload;
      const list: G2GOffer[] = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
      if (!g2gUser && list.length > 0 && list[0].seller_id) {
        const sid = list[0].seller_id; setG2gUser(sid); localStorage.setItem('g2g_user', sid);
      }
      const total: number = payload?.total_result ?? payload?.max_total_result ?? 0;
      if (p === 1) setG2gOffers(list); else setG2gOffers(prev => [...prev, ...list]);
      setG2gHasMore(list.length > 0 && (p * 48) < total);
      setG2gPage(p);
    } finally { setLoadingG2g(false); }
  };

  const connectG2g = async () => {
    const key = g2gKeyInput.trim(); const secret = g2gSecretInput.trim(); const user = g2gUserInput.trim();
    if (!key || !secret) return;
    setLoadingG2g(true);
    try {
      const r = await axios.get('/api/g2g/me', { headers: { 'x-g2g-key': key, 'x-g2g-secret': secret, 'x-g2g-user': user } });
      const uid = user || r.data?.payload?.seller_id || r.data?.payload?.user_id || '';
      setG2gKey(key); setG2gSecret(secret); setG2gUser(uid);
      localStorage.setItem('g2g_key', key); localStorage.setItem('g2g_secret', secret); localStorage.setItem('g2g_user', uid);
      setG2gLoggedIn(true); triggerToast('Connected to G2G!');
      await fetchG2g(1, key);
    } catch (e: any) { triggerToast(e.response?.data?.message || 'Failed to connect', 'error'); }
    finally { setLoadingG2g(false); }
  };

  const disconnectG2g = () => {
    localStorage.removeItem('g2g_key'); localStorage.removeItem('g2g_secret'); localStorage.removeItem('g2g_user');
    setG2gKey(''); setG2gSecret(''); setG2gUser(''); setG2gLoggedIn(false); setG2gOffers([]);
    triggerToast('Disconnected from G2G', 'info');
  };

  // ── Eldorado stock update ──
  const handleEldoStockUpdate = async (offer: OfferItem, qty: number) => {
    const cdnUrl = lookupCdn(offer, unitMap);
    const imgObj = buildMainOfferImage(offer) ?? (cdnUrl ? { smallImage: cdnUrl, largeImage: cdnUrl } : undefined);
    const dp = offer.pricePerUnitInUSD || offer.pricePerUnit || { amount: 0, currency: 'USD' };
    try {
      await axios.put(`/api/eldorado/offers/${offer.id}/details`, {
        quantity: qty, offerTitle: offer.offerTitle || offer.gameCategoryTitle, description: offer.description ?? '',
        gameId: offer.gameId, category: offer.category, currentPrice: dp.amount, currentCurrency: dp.currency,
        guaranteedDeliveryTime: offer.guaranteedDeliveryTime, mainOfferImage: imgObj, offerImages: offer.offerImages,
      }, { headers: { Authorization: eldoToken } });
      setEldoOffers(prev => prev.map(o => o.id === offer.id ? { ...o, quantity: qty } : o));
      triggerToast('Stock updated!');
    } catch (e: any) { triggerToast(e.response?.data?.error || 'Stock update failed', 'error'); }
  };

  // ── Auto-connect on mount ──
  useEffect(() => {
    if (eldoToken) { setEldoLoggedIn(true); fetchEldorado(); }
    if (gfKey && gfSecret && gfUserId) { setGfLoggedIn(true); fetchGameflip(); }
    if (zxToken) { setZxLoggedIn(true); fetchZeusx(); }
    if (g2gKey && g2gSecret) { setG2gLoggedIn(true); fetchG2g(); }
  }, []);

  useEffect(() => { if (eldoLoggedIn) fetchEldorado(); }, [eldoGameId, eldoState, eldoSearch]);
  useEffect(() => { if (gfLoggedIn) fetchGameflip(); }, [gfStatusFilter]);

  // ── Analyzer data ──
  const normalizedListings = useMemo(() => {
    const list: { id: string; name: string; price: number; quantity: number; platform: string }[] = [];
    eldoOffers.forEach(o => { const name = (o.offerTitle || o.gameCategoryTitle || '').trim(); if (name) list.push({ id: o.id, name, price: (o.pricePerUnitInUSD || o.pricePerUnit)?.amount ?? 0, quantity: o.quantity ?? 0, platform: 'eldorado' }); });
    gfListings.forEach(g => list.push({ id: g.id, name: g.name, price: g.price / 100, quantity: g.qty_avail || 1, platform: 'gameflip' }));
    zxSales.forEach(z => list.push({ id: z.offer_id, name: z.title, price: z.listed_price, quantity: z.quantity || 1, platform: 'zeusx' }));
    g2gOffers.forEach(g => list.push({ id: g.offer_id, name: g.title || '', price: g.unit_price || 0, quantity: g.available_qty || 0, platform: 'g2g' }));
    return list;
  }, [eldoOffers, gfListings, zxSales, g2gOffers]);

  const analyzer = useMemo(() => {
    const map: Record<string, { name: string; localQty: number; listings: { platform: string; price: number; qty: number }[] }> = {};
    storageList.forEach(item => { map[item.name] = { name: item.name, localQty: item.totalQuantity, listings: [] }; });
    const findMatch = (title: string | undefined) => {
      if (!title) return null;
      const lower = title.toLowerCase();
      for (const item of storageList) { if (item.name && lower.includes(item.name.toLowerCase())) return item.name; }
      for (const item of storageList) {
        if (!item.name) continue;
        const parts = item.name.toLowerCase().split(' ');
        const main = parts.find(p => p.length > 3 && !['gtd','gold','silver','bronze'].includes(p));
        if (main && lower.includes(main)) return item.name;
      }
      return null;
    };
    normalizedListings.forEach(l => {
      if (!l.name) return;
      const match = findMatch(l.name);
      const key = match || l.name;
      if (!map[key]) map[key] = { name: key, localQty: 0, listings: [] };
      map[key].listings.push({ platform: l.platform, price: l.price, qty: l.quantity });
    });
    const all = Object.values(map);
    return {
      listed: all.filter(i => i.listings.length > 0),
      unlisted: all.filter(i => i.listings.length === 0 && i.localQty > 0),
      oversold: all.filter(i => i.listings.length > 0 && i.localQty === 0),
    };
  }, [storageList, normalizedListings]);

  // ── ZeusX filtered ──
  const zxFiltered = useMemo(() => zxSales.filter(s => {
    if (zxStatusFilter === 'active') return s.offer_status === 'CREATED' && !s.is_hidden;
    if (zxStatusFilter === 'hidden') return s.offer_status === 'CREATED' && s.is_hidden;
    if (zxStatusFilter === 'sold') return s.offer_status === 'GOOD_DELIVERY';
    return true;
  }), [zxSales, zxStatusFilter]);

  // ── To List: gap computation ──
  const toListGaps = useMemo(() => {
    // Strip emojis, symbols, and the " | Game Name" suffix; keep only a-z, digits, spaces
    const norm = (s: string) =>
      s.split(' | ')[0]
       .toLowerCase()
       .replace(/[^a-z0-9 ]/g, '')
       .replace(/\s+/g, ' ')
       .trim();

    const getPlatformTitles = (platform: string): string[] => {
      switch (platform) {
        case 'eldorado': return eldoOffers.map(o => norm(o.offerTitle || o.gameCategoryTitle || ''));
        case 'gameflip': return gfListings.map(l => norm(l.name || ''));
        case 'zeusx': return zxSales.map(s => norm(s.title || ''));
        case 'g2g': return g2gOffers.map(o => norm(o.title || ''));
        default: return [];
      }
    };
    const titles = getPlatformTitles(toListPlatform).filter(Boolean);
    const isListed = (name: string) => {
      const n = norm(name);
      return n.length > 0 && titles.some(t => t.includes(n) || n.includes(t));
    };

    const rarityLookup = new Map<string, string>(gtdUnitsList.map(u => [u.Name.toLowerCase(), u.Rarity || 'ra_common']));
    const isGodlyOrExclusive = (name: string) => {
      const r = rarityLookup.get(name.toLowerCase());
      return r === 'ra_godly' || r === 'ra_exclusive';
    };

    const farmGaps = storageList
      .filter(item => isGodlyOrExclusive(item.name) && !isListed(item.name))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .map(item => ({ name: item.name, qty: item.totalQuantity }));

    const sellingMap = new Map<string, number>();
    (tradingAccounts || [])
      .filter(acc => acc.type === 'Selling' || acc.type === 'Both')
      .forEach(acc => {
        (acc.items || []).filter((i: any) => i.category === 'Selling').forEach((i: any) => {
          sellingMap.set(i.unitName, (sellingMap.get(i.unitName) || 0) + (i.quantity || 0));
        });
      });
    const sellingGaps = Array.from(sellingMap.entries())
      .filter(([name]) => isGodlyOrExclusive(name) && !isListed(name))
      .sort((a, b) => b[1] - a[1])
      .map(([name, qty]) => ({ name, qty }));

    const tradeMap = new Map<string, number>();
    (tradingAccounts || [])
      .filter(acc => acc.type === 'Trading' || acc.type === 'Both')
      .forEach(acc => {
        (acc.items || []).filter((i: any) => i.category === 'Trading').forEach((i: any) => {
          tradeMap.set(i.unitName, (tradeMap.get(i.unitName) || 0) + (i.quantity || 0));
        });
      });
    const tradeGaps = Array.from(tradeMap.entries())
      .filter(([name]) => !isListed(name))
      .sort((a, b) => b[1] - a[1])
      .map(([name, qty]) => ({ name, qty }));

    return { farmGaps, sellingGaps, tradeGaps };
  }, [toListPlatform, eldoOffers, gfListings, zxSales, g2gOffers, storageList, tradingAccounts]);

  // ── Login forms ──
  const loginForm = (platform: string, onSubmit: () => void, loading: boolean, fields: React.ReactNode) => (
    <div className="max-w-md mx-auto">
      <div className="bg-zinc-950/60 border border-zinc-900 rounded-3xl p-8 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-violet-500" />
          </div>
          <h3 className="text-lg font-black text-white">Connect {platform}</h3>
        </div>
        {fields}
        <button onClick={onSubmit} disabled={loading}
          className="w-full py-3 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : `Connect ${platform}`}
        </button>
      </div>
    </div>
  );

  const credInput = (label: string, value: string, onChange: (v: string) => void, placeholder: string, password = false) => (
    <div>
      <label className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500 font-bold mb-1.5">{label}</label>
      <input type={password ? 'password' : 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-violet-500" />
    </div>
  );

  // ── Platform status badges ──
  const platforms = [
    { id: 'eldorado' as const, label: 'Eldorado', connected: eldoLoggedIn, count: eldoOffers.length },
    { id: 'gameflip' as const, label: 'Gameflip', connected: gfLoggedIn, count: gfListings.length },
    { id: 'zeusx' as const, label: 'ZeusX', connected: zxLoggedIn, count: zxSales.length },
    { id: 'g2g' as const, label: 'G2G', connected: g2gLoggedIn, count: g2gOffers.length },
  ];

  return (
    <div className="space-y-6">
      {/* Platform status badges */}
      <div className="flex flex-wrap items-center gap-2">
        {platforms.map(p => (
          <div key={p.id} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold",
            p.connected ? 'bg-emerald-950/20 border-emerald-900 text-emerald-400' : 'bg-zinc-900/40 border-zinc-800 text-zinc-500')}>
            <span className={cn("w-2 h-2 rounded-full", p.connected ? 'bg-emerald-500' : 'bg-zinc-600')} />
            {p.label} {p.connected && <span className="font-mono text-[10px] opacity-70">({p.count})</span>}
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'analyzer' as const, label: 'Analyzer', badge: `${analyzer.unlisted.length} unlisted` },
            { id: 'eldorado' as const, label: 'Eldorado', badge: eldoLoggedIn ? String(eldoOffers.length) : null },
            { id: 'gameflip' as const, label: 'Gameflip', badge: gfLoggedIn ? String(gfListings.length) : null },
            { id: 'zeusx' as const, label: 'ZeusX', badge: zxLoggedIn ? String(zxSales.length) : null },
            { id: 'g2g' as const, label: 'G2G', badge: g2gLoggedIn ? String(g2gOffers.length) : null },
            { id: 'tolist' as const, label: 'What to List', badge: null },
          ].map(tab => (
            <button key={tab.id} onClick={() => setMarketTab(tab.id)}
              className={cn("px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 border",
                marketTab === tab.id ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800')}>
              {tab.label}
              {tab.badge && <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{tab.badge}</span>}
            </button>
          ))}
        </div>
        <button onClick={() => {
          if (eldoLoggedIn) fetchEldorado();
          if (gfLoggedIn) fetchGameflip();
          if (zxLoggedIn) fetchZeusx();
          if (g2gLoggedIn) fetchG2g();
          triggerToast('Refreshed all platforms!');
        }} className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition flex items-center gap-1.5 text-xs font-bold">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync All</span>
        </button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={cn("fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl border text-xs font-bold flex items-center gap-3 shadow-lg",
              toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-400' :
              toast.type === 'error' ? 'bg-red-950/90 border-red-500/30 text-red-400' : 'bg-indigo-950/90 border-indigo-500/30 text-indigo-400')}>
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} className="text-current opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ANALYZER TAB ── */}
      {marketTab === 'analyzer' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Listings', value: normalizedListings.length, color: 'text-white' },
              { label: 'Unlisted In-Stock', value: analyzer.unlisted.length, color: 'text-amber-400' },
              { label: 'Listed No-Stock', value: analyzer.oversold.length, color: 'text-red-400' },
              { label: 'Unique Items', value: storageList.length, color: 'text-white' },
            ].map(s => (
              <div key={s.label} className="bg-zinc-900/20 border border-zinc-800 p-4 rounded-2xl">
                <div className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider font-bold mb-1.5">{s.label}</div>
                <div className={cn("text-2xl font-black", s.color)}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider mb-3 flex items-center gap-1.5">
                  ⚠️ In Stock but NOT Listed ({analyzer.unlisted.length})
                </h4>
                <div className="bg-zinc-900/10 border border-zinc-900 rounded-2xl divide-y divide-zinc-900/40 max-h-96 overflow-y-auto">
                  {analyzer.unlisted.length > 0 ? analyzer.unlisted.map(item => (
                    <div key={item.name} className="p-3.5 flex items-center justify-between hover:bg-zinc-900/10 transition">
                      <div>
                        <span className="text-xs font-black text-zinc-200 block">{item.name}</span>
                        <span className="text-[10px] text-zinc-500">Stock: <strong className="text-zinc-300">{item.localQty}x</strong></span>
                      </div>
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-lg text-[9px] font-bold">UNPOSTED</span>
                    </div>
                  )) : (
                    <div className="py-10 text-center flex flex-col items-center">
                      <CheckCircle className="text-emerald-500/40 w-8 h-8 mb-2" />
                      <p className="text-xs font-bold text-zinc-400">Everything in stock is listed!</p>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider mb-3 flex items-center gap-1.5">
                  ✅ Active Listings ({analyzer.listed.length})
                </h4>
                <div className="bg-zinc-900/10 border border-zinc-900 rounded-2xl divide-y divide-zinc-900/40 max-h-96 overflow-y-auto">
                  {analyzer.listed.length > 0 ? analyzer.listed.map(item => (
                    <div key={item.name} className={cn("p-3.5 hover:bg-zinc-900/10 transition", item.localQty === 0 && 'bg-red-500/5')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-zinc-200">{item.name}</span>
                        <div className="flex flex-wrap gap-1">
                          {item.listings.map((l, i) => (
                            <span key={i} className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                              l.platform === 'eldorado' ? 'bg-amber-400/10 text-amber-500' :
                              l.platform === 'gameflip' ? 'bg-cyan-500/10 text-cyan-400' :
                              l.platform === 'g2g' ? 'bg-blue-500/10 text-blue-400' :
                              'bg-emerald-500/10 text-emerald-400')}>
                              {l.platform.substring(0, 2)}: ${l.price.toFixed(2)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        Stock: <strong className={item.localQty === 0 ? 'text-red-400' : 'text-zinc-300'}>{item.localQty}x</strong>
                        {' · '}Listed: <strong className="text-zinc-300">{item.listings.reduce((s, l) => s + l.qty, 0)}x</strong>
                      </div>
                    </div>
                  )) : (
                    <div className="py-10 text-center">
                      <p className="text-xs text-zinc-500">No active listings loaded — connect your shops above.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ELDORADO TAB ── */}
      {marketTab === 'eldorado' && (
        <div className="space-y-5">
          {!eldoLoggedIn ? loginForm('Eldorado', connectEldorado, loadingEldo, (
            <div>{credInput('__Host-EldoradoIdToken', eldoTokenInput, setEldoTokenInput, 'Paste your token...', true)}</div>
          )) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
                    {['Active','Paused','Closed','All'].map(s => (
                      <button key={s} onClick={() => setEldoState(s)}
                        className={cn("px-3 py-1.5 text-xs font-medium transition-all", eldoState === s ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white")}>{s}</button>
                    ))}
                  </div>
                  <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
                    <button onClick={() => setEldoGameId('268')} className={cn("px-3 py-1.5 text-xs font-medium transition-all", eldoGameId === '268' ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white")}>GTD</button>
                    <button onClick={() => setEldoGameId('')} className={cn("px-3 py-1.5 text-xs font-medium transition-all", eldoGameId === '' ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white")}>All Games</button>
                  </div>
                  <form onSubmit={e => { e.preventDefault(); setEldoSearch(eldoSearchInput); }} className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                      <input value={eldoSearchInput} onChange={e => setEldoSearchInput(e.target.value)} placeholder="Search offers..."
                        className="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-violet-500 w-40" />
                    </div>
                    <button type="submit" className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold rounded-lg transition-all">Search</button>
                  </form>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => fetchEldorado()} className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition">
                    <RefreshCw className={cn("w-4 h-4", loadingEldo && "animate-spin")} />
                  </button>
                  <button onClick={disconnectEldorado} className="px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 border border-red-900/30 rounded-lg transition">Disconnect</button>
                </div>
              </div>

              {loadingEldo && eldoOffers.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl aspect-[4/5] animate-pulse" />)}
                </div>
              ) : eldoOffers.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  <AnimatePresence mode="popLayout">
                    {eldoOffers.map(offer => (
                      <div key={offer.id}>
                        <OfferCard offer={offer} cdnUrl={lookupCdn(offer, unitMap)} isOwn
                          onClick={() => setMarketEldo(offer)}
                          onEdit={() => setEditingEldo(offer)}
                          onStockUpdate={(offer.offerState === 'Active' || offer.offerState === 'Paused') ? (q) => handleEldoStockUpdate(offer, q) : undefined}
                        />
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-16 border border-dashed border-zinc-800 rounded-3xl">
                  <Package className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm font-bold">No offers found</p>
                </div>
              )}

            </>
          )}
        </div>
      )}

      {/* ── GAMEFLIP TAB ── */}
      {marketTab === 'gameflip' && (
        <div className="space-y-5">
          {!gfLoggedIn ? loginForm('Gameflip', connectGameflip, loadingGf, (
            <div className="space-y-3">
              {credInput('API Key', gfKeyInput, setGfKeyInput, 'Your Gameflip API key')}
              {credInput('OTP Secret (Base32)', gfSecretInput, setGfSecretInput, 'JBSWY3DPEHPK3PXP...', true)}
            </div>
          )) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
                    {['all','onsale','sold'].map(s => (
                      <button key={s} onClick={() => setGfStatusFilter(s)}
                        className={cn("px-3 py-1.5 text-xs font-medium transition-all capitalize", gfStatusFilter === s ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white")}>
                        {s === 'onsale' ? 'On Sale' : s}
                      </button>
                    ))}
                  </div>
                  {gfWallet?.cash_balance != null && (
                    <span className="text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-1 rounded-lg font-mono">
                      ${(gfWallet.cash_balance / 100).toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => fetchGameflip()} className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition">
                    <RefreshCw className={cn("w-4 h-4", loadingGf && "animate-spin")} />
                  </button>
                  <button onClick={disconnectGameflip} className="px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 border border-red-900/30 rounded-lg transition">Disconnect</button>
                </div>
              </div>
              {loadingGf && gfListings.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl aspect-[4/5] animate-pulse" />)}
                </div>
              ) : gfListings.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  <AnimatePresence mode="popLayout">
                    {gfListings.filter(l => gfStatusFilter === 'all' || l.status === gfStatusFilter).map(l => (
                      <div key={l.id}>
                        <GFListingCard listing={l} isOwn onClick={() => setMarketGf(l)} onQtyUpdate={handleGfQtyUpdate} onEdit={() => setEditingGf(l)} />
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-16 border border-dashed border-zinc-800 rounded-3xl">
                  <Package className="w-12 h-12 text-zinc-800 mx-auto mb-3" /><p className="text-zinc-500 text-sm font-bold">No listings found</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ZEUSX TAB ── */}
      {marketTab === 'zeusx' && (
        <div className="space-y-5">
          {!zxLoggedIn ? loginForm('ZeusX', connectZeusx, loadingZx, (
            <div className="space-y-3">
              {credInput('Access Token (Bearer)', zxTokenInput, setZxTokenInput, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', true)}
              {credInput('cf_clearance (required for editing)', zxCfInput, setZxCfInput, 'Paste cf_clearance cookie value...')}
            </div>
          )) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
                    {[{v:'all',l:'All'},{v:'active',l:'Active'},{v:'hidden',l:'Hidden'},{v:'sold',l:'Sold'}].map(({v,l}) => (
                      <button key={v} onClick={() => setZxStatusFilter(v)}
                        className={cn("px-3 py-1.5 text-xs font-medium transition-all", zxStatusFilter === v ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white")}>{l}</button>
                    ))}
                  </div>
                  <button onClick={() => { setShowZxCfUpdate(v => !v); setZxCfInput(''); }}
                    className={cn("px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-all", zxCf ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-amber-400 border-amber-500/30 bg-amber-500/10")}>
                    CF {zxCf ? '✓' : '!'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => fetchZeusx()} className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition">
                    <RefreshCw className={cn("w-4 h-4", loadingZx && "animate-spin")} />
                  </button>
                  <button onClick={disconnectZeusx} className="px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 border border-red-900/30 rounded-lg transition">Disconnect</button>
                </div>
              </div>
              {showZxCfUpdate && (
                <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
                  <span className="text-xs text-zinc-400 whitespace-nowrap">cf_clearance:</span>
                  <input autoFocus value={zxCfInput} onChange={e => setZxCfInput(e.target.value)} placeholder="Paste new cf_clearance value..."
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-violet-500" />
                  <button onClick={() => { if (zxCfInput.trim()) { setZxCf(zxCfInput.trim()); localStorage.setItem('zeusx_cf', zxCfInput.trim()); } setShowZxCfUpdate(false); }}
                    className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition">Save</button>
                  <button onClick={() => setShowZxCfUpdate(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
              )}
              {loadingZx && zxSales.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl aspect-[4/5] animate-pulse" />)}
                </div>
              ) : zxFiltered.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  <AnimatePresence mode="popLayout">
                    {zxFiltered.map(s => (
                      <div key={s.offer_id}>
                        <ZXSaleCard sale={s} isOwn onQtyUpdate={handleZxQtyUpdate} onEdit={() => setEditingZx(s)} />
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-16 border border-dashed border-zinc-800 rounded-3xl">
                  <Package className="w-12 h-12 text-zinc-800 mx-auto mb-3" /><p className="text-zinc-500 text-sm font-bold">No listings found</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── G2G TAB ── */}
      {marketTab === 'g2g' && (
        <div className="space-y-5">
          {!g2gLoggedIn ? loginForm('G2G', connectG2g, loadingG2g, (
            <div className="space-y-3">
              {credInput('API Key', g2gKeyInput, setG2gKeyInput, 'Your G2G API key')}
              {credInput('API Secret', g2gSecretInput, setG2gSecretInput, 'Your G2G API secret', true)}
              {credInput('Account ID (optional)', g2gUserInput, setG2gUserInput, 'Numeric account ID')}
            </div>
          )) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg font-mono">{g2gOffers.length} offers</span>
                  {g2gJwt && <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">JWT ✓</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => fetchG2g(1)} className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition">
                    <RefreshCw className={cn("w-4 h-4", loadingG2g && "animate-spin")} />
                  </button>
                  <button onClick={disconnectG2g} className="px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 border border-red-900/30 rounded-lg transition">Disconnect</button>
                </div>
              </div>
              {loadingG2g && g2gOffers.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl aspect-[4/5] animate-pulse" />)}
                </div>
              ) : g2gOffers.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {g2gOffers.map(o => (
                      <G2GOfferCard key={o.offer_id} offer={o} onEdit={() => setEditingG2g(o)} onMarket={() => setMarketG2g(o)} />
                    ))}
                  </div>
                  {g2gHasMore && (
                    <div className="flex justify-center mt-4">
                      <button onClick={() => fetchG2g(g2gPage + 1)} disabled={loadingG2g}
                        className="px-6 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                        {loadingG2g ? 'Loading...' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 border border-dashed border-zinc-800 rounded-3xl">
                  <Package className="w-12 h-12 text-zinc-800 mx-auto mb-3" /><p className="text-zinc-500 text-sm font-bold">No G2G offers found</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── WHAT TO LIST TAB ── */}
      {marketTab === 'tolist' && (
        <div className="space-y-5">
          {/* Platform page navigator */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              {([
                { id: 'eldorado' as const, label: 'Eldorado', connected: eldoLoggedIn, loading: loadingEldo, fetch: () => fetchEldorado(), hasData: eldoOffers.length > 0 },
                { id: 'gameflip' as const, label: 'Gameflip', connected: gfLoggedIn, loading: loadingGf, fetch: () => fetchGameflip(), hasData: gfListings.length > 0 },
                { id: 'zeusx' as const, label: 'ZeusX', connected: zxLoggedIn, loading: loadingZx, fetch: () => fetchZeusx(), hasData: zxSales.length > 0 },
                { id: 'g2g' as const, label: 'G2G', connected: g2gLoggedIn, loading: loadingG2g, fetch: () => fetchG2g(), hasData: g2gOffers.length > 0 },
              ]).map(p => (
                <button key={p.id}
                  onClick={() => {
                    setToListPlatform(p.id);
                    if (p.connected && !p.hasData && !p.loading) p.fetch();
                  }}
                  className={cn("px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5",
                    toListPlatform === p.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50')}>
                  <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", p.connected ? 'bg-emerald-500' : 'bg-zinc-600')} />
                  {p.label}
                  {p.loading && <RefreshCw className="w-2.5 h-2.5 animate-spin opacity-60" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                if (toListPlatform === 'eldorado' && eldoLoggedIn) fetchEldorado();
                else if (toListPlatform === 'gameflip' && gfLoggedIn) fetchGameflip();
                else if (toListPlatform === 'zeusx' && zxLoggedIn) fetchZeusx();
                else if (toListPlatform === 'g2g' && g2gLoggedIn) fetchG2g();
                triggerToast('Refreshed listings!');
              }}
              className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition flex items-center gap-1.5 text-xs font-bold">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {/* Not connected warning */}
          {!([eldoLoggedIn, gfLoggedIn, zxLoggedIn, g2gLoggedIn][['eldorado','gameflip','zeusx','g2g'].indexOf(toListPlatform)]) ? (
            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-3xl">
              <Package className="w-12 h-12 text-zinc-800 mx-auto mb-3" />
              <p className="text-zinc-400 font-bold text-sm">Not connected to {toListPlatform}</p>
              <p className="text-zinc-600 text-xs mt-1">Go to the {toListPlatform} tab above to connect your account first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Farm Storage missing */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <span>🌾</span> Farm Storage not on {toListPlatform} ({toListGaps.farmGaps.length})
                  </h4>
                  <span className="text-[9px] text-zinc-600 font-mono">sorted by qty</span>
                </div>
                <div className="bg-zinc-900/10 border border-zinc-900 rounded-2xl divide-y divide-zinc-900/40 max-h-[480px] overflow-y-auto">
                  {toListGaps.farmGaps.length > 0 ? (
                    toListGaps.farmGaps.map(item => (
                      <div key={item.name} className="flex items-center justify-between px-3.5 py-2.5 hover:bg-zinc-900/15 transition">
                        <span className="text-xs font-bold text-zinc-200">{item.name}</span>
                        <span className="text-[10px] font-mono font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                          x{item.qty.toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center flex flex-col items-center gap-2">
                      <span className="text-2xl">✅</span>
                      <p className="text-xs font-bold text-emerald-400">All farm items are listed!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Selling Storage missing */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                    <span>💰</span> Selling Storage not on {toListPlatform} ({toListGaps.sellingGaps.length})
                  </h4>
                  <span className="text-[9px] text-zinc-600 font-mono">sorted by qty</span>
                </div>
                <div className="bg-zinc-900/10 border border-zinc-900 rounded-2xl divide-y divide-zinc-900/40 max-h-[480px] overflow-y-auto">
                  {toListGaps.sellingGaps.length > 0 ? (
                    toListGaps.sellingGaps.map(item => (
                      <div key={item.name} className="flex items-center justify-between px-3.5 py-2.5 hover:bg-zinc-900/15 transition">
                        <span className="text-xs font-bold text-zinc-200">{item.name}</span>
                        <span className="text-[10px] font-mono font-black text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-lg">
                          x{item.qty.toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center flex flex-col items-center gap-2">
                      {(tradingAccounts || []).filter(a => a.type === 'Selling' || a.type === 'Both').length === 0 ? (
                        <p className="text-xs text-zinc-500">No selling portfolios set up yet.</p>
                      ) : (
                        <>
                          <span className="text-2xl">✅</span>
                          <p className="text-xs font-bold text-emerald-400">All selling items are listed!</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Trade Storage missing */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                    <span>🔄</span> Trade Storage not on {toListPlatform} ({toListGaps.tradeGaps.length})
                  </h4>
                  <span className="text-[9px] text-zinc-600 font-mono">sorted by qty</span>
                </div>
                <div className="bg-zinc-900/10 border border-zinc-900 rounded-2xl divide-y divide-zinc-900/40 max-h-[480px] overflow-y-auto">
                  {toListGaps.tradeGaps.length > 0 ? (
                    toListGaps.tradeGaps.map(item => (
                      <div key={item.name} className="flex items-center justify-between px-3.5 py-2.5 hover:bg-zinc-900/15 transition">
                        <span className="text-xs font-bold text-zinc-200">{item.name}</span>
                        <span className="text-[10px] font-mono font-black text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-lg">
                          x{item.qty.toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center flex flex-col items-center gap-2">
                      {(tradingAccounts || []).filter(a => a.type === 'Trading' || a.type === 'Both').length === 0 ? (
                        <p className="text-xs text-zinc-500">No trading portfolios set up yet.</p>
                      ) : (
                        <>
                          <span className="text-2xl">✅</span>
                          <p className="text-xs font-bold text-emerald-400">All trade items are listed!</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {editingEldo && (
          <EditPriceModal offer={editingEldo} token={eldoToken} cdnUrl={lookupCdn(editingEldo, unitMap)}
            onClose={() => setEditingEldo(null)} onUpdate={fetchEldorado} />
        )}
        {marketEldo && !editingEldo && (
          <MarketModal offer={marketEldo} unitMap={unitMap}
            onClose={() => setMarketEldo(null)}
            onEdit={o => { setEditingEldo(o); setMarketEldo(null); }} />
        )}
        {editingZx && (
          <ZXEditModal sale={editingZx} token={zxToken} cf={zxCf}
            onClose={() => setEditingZx(null)}
            onUpdate={() => { fetchZeusx(); setEditingZx(null); }} />
        )}
        {editingGf && (
          <GFEditModal listing={editingGf} gfKey={gfKey} gfSecret={gfSecret}
            onClose={() => setEditingGf(null)} onUpdate={fetchGameflip} />
        )}
        {marketGf && !editingGf && (
          <GFMarketModal listing={marketGf} gfKey={gfKey} gfSecret={gfSecret} gfUserId={gfUserId}
            onClose={() => setMarketGf(null)}
            onEdit={() => { setEditingGf(marketGf); setMarketGf(null); }} />
        )}
        {editingG2g && (
          <G2GEditModal offer={editingG2g} g2gKey={g2gKey} g2gSecret={g2gSecret} g2gUser={g2gUser}
            onClose={() => setEditingG2g(null)}
            onUpdate={() => { fetchG2g(1); setEditingG2g(null); }} />
        )}
        {marketG2g && !editingG2g && (
          <G2GMarketModal offer={marketG2g} sellerId={g2gUser} g2gKey={g2gKey} g2gSecret={g2gSecret} g2gJwt={g2gJwt}
            onClose={() => setMarketG2g(null)}
            onEdit={() => { setEditingG2g(marketG2g); setMarketG2g(null); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
