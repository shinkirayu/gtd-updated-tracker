import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Sparkles, Inbox, Package, Shield, Coins, AlertCircle } from 'lucide-react';
import { InventoryItem } from '../types';
import AssetImage from './AssetImage';
import { gtdUnitsList } from '../data/gtdUnits';

// ID → display name lookup built once from the units database
const gtdNameMap = new Map<string, string>(gtdUnitsList.map(u => [u.ID, u.Name]));

interface InventoryDrawerProps {
  username: string;
  inventory: InventoryItem[] | null;
  onClose: () => void;
}

// Function to dynamically assign item rarity and tags based on name for rich UI visuals
function parseItemMetadata(item: InventoryItem) {
  const nameLower = item.name.toLowerCase();
  let rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' = 'common';
  let category: 'seed' | 'gem' | 'equipment' | 'material' | 'consumable' = 'material';
  let icon = '📦';

  if (nameLower.includes('seed') || nameLower.includes('sprout') || nameLower.includes('flower') || nameLower.includes('plant')) {
    category = 'seed';
    icon = '🌱';
  } else if (nameLower.includes('gem') || nameLower.includes('diamond') || nameLower.includes('ruby') || nameLower.includes('crystal') || nameLower.includes('emerald')) {
    category = 'gem';
    icon = '💎';
  } else if (nameLower.includes('sword') || nameLower.includes('bow') || nameLower.includes('armor') || nameLower.includes('shield') || nameLower.includes('ring') || nameLower.includes('helmet') || nameLower.includes('boots')) {
    category = 'equipment';
    icon = '⚔️';
  } else if (nameLower.includes('potion') || nameLower.includes('elixir') || nameLower.includes('scroll') || nameLower.includes('book') || nameLower.includes('food')) {
    category = 'consumable';
    icon = '🧪';
  }

  // Determine Rarity
  if (
    nameLower.includes('god') || 
    nameLower.includes('dragon') || 
    nameLower.includes('eldritch') || 
    nameLower.includes('mythic') || 
    nameLower.includes('sacred') || 
    nameLower.includes('omega') ||
    nameLower.includes('soul')
  ) {
    rarity = 'legendary';
  } else if (
    nameLower.includes('supreme') || 
    nameLower.includes('ancient') || 
    nameLower.includes('epic') || 
    nameLower.includes('gold') || 
    nameLower.includes('vortex')
  ) {
    rarity = 'epic';
  } else if (
    nameLower.includes('rare') || 
    nameLower.includes('crystal') || 
    nameLower.includes('silver') || 
    nameLower.includes('shard') ||
    nameLower.includes('key')
  ) {
    rarity = 'rare';
  } else if (
    nameLower.includes('uncommon') || 
    nameLower.includes('iron') || 
    nameLower.includes('magic') || 
    nameLower.includes('refined')
  ) {
    rarity = 'uncommon';
  }

  return { rarity, category, icon };
}

// Resolve display name: units database first, then strip known prefixes
function formatItemName(rawName: string, displayName?: string): string {
  if (!rawName) return '';
  if (displayName) return displayName;
  const dbName = gtdNameMap.get(rawName);
  if (dbName) return dbName;
  let cleaned = rawName
    .replace(/^dp_wt_unit_|^dp_unit_|^dp_gd_|^dp_|^gp_|^unit_/i, '')
    .replace(/_/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '')
    .join(' ');
}

export default function InventoryDrawer({ username, inventory, onClose }: InventoryDrawerProps) {
  const [search, setSearch] = useState('');

  // Parse inventory items with rich metadata
  const parsedItems = useMemo(() => {
    if (!inventory) return [];
    return inventory.map((item) => {
      // New reporter.lua format: { id, name (display), image, count }
      // Legacy format:           { name (raw ID), displayName, quantity }
      const rawId = item.id || item.name;
      const resolvedDisplay = item.id ? item.name : item.displayName;
      const quantity = item.count ?? item.quantity ?? 0;

      const formattedItem = {
        ...item,
        name: formatItemName(rawId, resolvedDisplay),
        rawName: rawId,
        quantity,
      };
      const meta = parseItemMetadata(formattedItem);
      return {
        ...formattedItem,
        ...meta,
      };
    });
  }, [inventory]);

  // Filter products inside inventory
  const filteredItems = useMemo(() => {
    return parsedItems.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [parsedItems, search]);

  // General dashboard stats inside chest
  const totalItemsCount = useMemo(() => {
    return parsedItems.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  }, [parsedItems]);

  const rarityWeights = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 };
  const rarestItem = useMemo(() => {
    if (parsedItems.length === 0) return null;
    return [...parsedItems].sort((a, b) => rarityWeights[b.rarity] - rarityWeights[a.rarity])[0];
  }, [parsedItems]);

  const rarityColors = {
    common: {
      bg: 'bg-zinc-900 border-zinc-800 text-zinc-300',
      tag: 'bg-zinc-800/80 text-zinc-400 border-zinc-700',
      glow: '',
      text: 'text-zinc-400',
    },
    uncommon: {
      bg: 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300 hover:border-emerald-800/80',
      tag: 'bg-emerald-950/80 text-emerald-400 border-emerald-900/60',
      glow: 'shadow-[0_0_12px_-3px_rgba(16,185,129,0.15)]',
      text: 'text-emerald-400',
    },
    rare: {
      bg: 'bg-blue-950/20 border-blue-900/40 text-blue-300 hover:border-blue-800/80',
      tag: 'bg-blue-950/80 text-blue-400 border-blue-900/60',
      glow: 'shadow-[0_0_12px_-3px_rgba(59,130,246,0.2)]',
      text: 'text-blue-400',
    },
    epic: {
      bg: 'bg-purple-950/20 border-purple-900/40 text-purple-300 hover:border-purple-800/80',
      tag: 'bg-purple-950/80 text-purple-400 border-purple-900/60',
      glow: 'shadow-[0_0_15px_-2px_rgba(168,85,247,0.35)]',
      text: 'text-purple-400',
    },
    legendary: {
      bg: 'bg-amber-950/30 border-amber-850/50 text-amber-300 hover:border-amber-700/80',
      tag: 'bg-amber-950/80 text-amber-400 border-amber-900/60',
      glow: 'shadow-[0_0_20px_-1px_rgba(245,158,11,0.45)]',
      text: 'text-amber-400 font-extrabold',
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="w-full max-w-2xl bg-[#08080c] border border-zinc-800/80 rounded-3xl max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-indigo-500/10 via-purple-500/0 to-transparent pointer-events-none rounded-full blur-3xl z-0" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-emerald-500/5 via-teal-500/0 to-transparent pointer-events-none rounded-full blur-2xl z-0" />

        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between z-10 relative">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl shadow-lg ring-2 ring-indigo-500/30">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold font-display tracking-tight text-white">{username}</h2>
                <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full font-mono text-zinc-400 border border-zinc-700">Storage</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Vault Inventory & Game Loot</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-xl transition hover:border-zinc-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls - Search */}
        <div className="p-6 pb-4 z-10 relative">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-550 w-4 h-4" />
            <input
              type="text"
              placeholder="Search items in vault storage by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 transition placeholder-zinc-500 text-zinc-150"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs cursor-pointer font-bold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Main inventory content */}
        <div className="flex-1 overflow-y-auto p-6 pt-0 z-10 relative">
          {filteredItems.length > 0 ? (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-6">
                {filteredItems.map((item, index) => {
                  const colors = rarityColors[item.rarity];
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.01, 0.2) }}
                      className={`aspect-square rounded-2xl border flex flex-col items-center justify-between p-3 relative ${colors.bg} ${colors.glow} hover:border-zinc-500 group`}
                    >
                      {/* Centered Emoji icon with GTDCDN Image fallback loader */}
                      <div className="my-auto flex flex-col items-center justify-center p-1 min-h-[50px] w-full">
                        <AssetImage
                          rawName={item.rawName}
                          fallbackEmoji={item.icon}
                          name={item.name}
                          image={item.image}
                          className="w-12 h-12 object-contain select-none filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                        />
                      </div>

                      {/* Name & Quantity */}
                      <div className="w-full text-center mt-auto">
                        <span className="text-[10px] font-bold text-zinc-150 block truncate leading-tight px-0.5 group-hover:text-white">
                          {item.name}
                        </span>
                        {item.rawName && item.rawName !== item.name && (
                          <span className="text-[8px] font-mono text-zinc-600 block truncate px-0.5 mt-0.5">
                            {item.rawName}
                          </span>
                        )}
                        <span className="text-[9px] font-mono font-black text-indigo-400 block mt-0.5">
                          x{item.quantity.toLocaleString()}
                        </span>
                        {item.rarity !== 'common' && (
                          <span className={`text-[8px] font-mono tracking-widest uppercase block ${colors.text} mt-0.5`}>
                            {item.rarity}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {/* Aesthetic filler gaps */}
                {Array.from({ length: Math.max(5, 10 - filteredItems.length) }).map((_, idx) => (
                  <div 
                    key={`empty-${idx}`} 
                    className="aspect-square bg-zinc-950/20 rounded-2xl border border-zinc-900/40 border-dashed" 
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-3xl p-8 text-center bg-zinc-900/20">
              <Inbox className="w-10 h-10 text-zinc-650 mb-3" />
              <p className="text-zinc-400 font-semibold text-sm">No items matching filters</p>
              <p className="text-zinc-650 text-xs mt-1">Try resetting the keyword search or category options</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
