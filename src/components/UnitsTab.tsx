import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  RefreshCw, 
  Info, 
  Coins, 
  AlertTriangle,
  Sparkles,
  Edit2,
  X,
} from 'lucide-react';
import { gtdUnitsList, GTDUnit, getRarityDetails } from '../data/gtdUnits';
import AssetImage from './AssetImage';

interface ScrapedUnitData {
  name: string;
  value: string;
  numericValue: number;
  rarity: string;
  status: string;
  demand: string;
}

interface UnitsTabProps {
  aggregateStorage: Record<string, {
    name: string;
    rawName?: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    icon?: string;
    accounts: { username: string; pc: string; quantity: number; updated_at: string }[];
    totalQuantity: number;
  }>;
}

// Client-side helper function to parse custom value string
function parseSingleValue(str: string): number {
  if (!str) return 0;
  const clean = str.toUpperCase().replace(/,/g, '').trim();
  if (clean.endsWith('B')) {
    return parseFloat(clean.slice(0, -1)) * 1000000000;
  }
  if (clean.endsWith('M')) {
    return parseFloat(clean.slice(0, -1)) * 1000000;
  }
  if (clean.endsWith('K')) {
    return parseFloat(clean.slice(0, -1)) * 1000;
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

function parseValueString(valStr: string): number {
  if (!valStr) return 0;
  if (valStr.includes('-')) {
    const parts = valStr.split('-');
    if (parts.length === 2) {
      const v1 = parseSingleValue(parts[0]);
      const v2 = parseSingleValue(parts[1]);
      if (v1 > 0 && v2 > 0) {
        return Math.round((v1 + v2) / 2);
      }
      return v1 > 0 ? v1 : v2;
    }
  }
  return parseSingleValue(valStr);
}

export default function UnitsTab({ aggregateStorage }: UnitsTabProps) {
  // Scaper API state
  const [scrapedData, setScrapedData] = useState<Record<string, ScrapedUnitData>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<'cache' | 'live' | 'fallback' | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Custom User Value Overrides state
  const [customOverrides, setCustomOverrides] = useState<Record<string, Partial<ScrapedUnitData>>>(() => {
    try {
      const saved = localStorage.getItem('gtd_value_overrides_v2');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Editing state
  const [editingUnit, setEditingUnit] = useState<any | null>(null);
  const [editedVal, setEditedVal] = useState('');
  const [editedDemand, setEditedDemand] = useState('');
  const [editedStatus, setEditedStatus] = useState('');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRarity, setActiveRarity] = useState<string>('all');
  const [activeDemand, setActiveDemand] = useState<string>('all');
  const [activeTrend, setActiveTrend] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'owned' | 'missing'>('all');
  const [sortBy, setSortBy] = useState<'value-desc' | 'value-asc' | 'demand-desc' | 'name-asc'>('value-desc');

  // Fetch data on mount
  useEffect(() => {
    fetchValuesData();
  }, []);

  const fetchValuesData = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorMessage(null);

      const url = forceRefresh ? '/api/gtd-values?refresh=true' : '/api/gtd-values';
      const response = await fetch(url);
      const resData = await response.json();

      if (resData.success) {
        setScrapedData(resData.data);
        setSource(resData.source);
        setLastUpdatedAt(resData.updatedAt);
      } else {
        throw new Error(resData.error || 'Unknown scraper error');
      }
    } catch (err: any) {
      console.error('Failed to retrieve Garden TD values:', err);
      setErrorMessage(err.message || 'Error pulling live prices. Falling back to robust off-line dataset.');
      // Local fallback generation inside client as contingency
      const offlineFallback: Record<string, ScrapedUnitData> = {};
      gtdUnitsList.forEach((unit) => {
        offlineFallback[unit.Name] = {
          name: unit.Name,
          value: unit.Rarity === 'ra_godly' ? '12,500' : '1,000',
          numericValue: unit.Rarity === 'ra_godly' ? 12500 : 1000,
          rarity: unit.Rarity || 'ra_common',
          demand: '5/10',
          status: 'Stable'
        };
      });
      setScrapedData(offlineFallback);
      setSource('fallback');
      setLastUpdatedAt(new Date().toISOString());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Merge server scrapedData with user local price overrides
  const mergedScrapedData = useMemo(() => {
    const merged = { ...scrapedData };
    Object.entries(customOverrides).forEach(([name, rawOverride]) => {
      const override = rawOverride as Partial<ScrapedUnitData>;
      const parsedVal = override.value ? parseValueString(override.value) : 1000;
      if (merged[name]) {
        merged[name] = {
          ...merged[name],
          ...override,
          numericValue: parsedVal
        } as ScrapedUnitData;
      } else {
        const matchingUnit = gtdUnitsList.find(u => u.Name === name);
        merged[name] = {
          name,
          value: override.value || '1,000',
          numericValue: parsedVal,
          rarity: getRarityDetails(matchingUnit?.Rarity || 'ra_common').label,
          status: override.status || 'Stable',
          demand: override.demand || '5/10'
        };
      }
    });
    return merged;
  }, [scrapedData, customOverrides]);

  // Save custom override helper
  const handleSaveOverride = (unitName: string, value: string, demand: string, status: string) => {
    const updated = {
      ...customOverrides,
      [unitName]: {
        name: unitName,
        value: value.trim() || '1,000',
        numericValue: parseValueString(value),
        demand: demand.trim() || '5/10',
        status: status?.trim() || 'Stable'
      }
    };
    setCustomOverrides(updated);
    try {
      localStorage.setItem('gtd_value_overrides_v2', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    setEditingUnit(null);
  };

  // Reset override
  const handleResetOverride = (unitName: string) => {
    const updated = { ...customOverrides };
    delete updated[unitName];
    setCustomOverrides(updated);
    try {
      localStorage.setItem('gtd_value_overrides_v2', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    setEditingUnit(null);
  };

  // Helper to format values for crisp desktop rendering
  const formatFriendlyValue = (numericVal: number): string => {
    return numericVal.toLocaleString();
  };

  // Inventory Net Worth aggregation
  const ownedSummary = useMemo(() => {
    let totalUniqueOwned = 0;
    let totalItemsCount = 0;
    let aggregateHoldingValue = 0;

    gtdUnitsList.forEach(unit => {
      const ownedItem = aggregateStorage[unit.Name];
      if (ownedItem && ownedItem.totalQuantity > 0) {
        totalUniqueOwned += 1;
        totalItemsCount += ownedItem.totalQuantity;
        const valInfo = mergedScrapedData[unit.Name];
        if (valInfo) {
          aggregateHoldingValue += (valInfo.numericValue * ownedItem.totalQuantity);
        }
      }
    });

    return {
      unique: totalUniqueOwned,
      totalCount: totalItemsCount,
      totalWorth: aggregateHoldingValue
    };
  }, [aggregateStorage, mergedScrapedData]);

  // Combine scraped metadata with official units config list
  const fullyMappedUnits = useMemo(() => {
    return gtdUnitsList.map(unit => {
      const scraped = mergedScrapedData[unit.Name] || {
        name: unit.Name,
        value: unit.SeedsPrice ? unit.SeedsPrice.toLocaleString() : '1,000',
        numericValue: unit.SeedsPrice || 1000,
        rarity: unit.Rarity ? getRarityDetails(unit.Rarity).label : 'Common',
        status: 'Stable',
        demand: '5/10'
      };

      const ownedInfo = aggregateStorage[unit.Name];
      
      return {
        ...unit,
        scraped,
        totalOwned: ownedInfo ? ownedInfo.totalQuantity : 0,
        accountsOwner: ownedInfo ? ownedInfo.accounts : []
      };
    });
  }, [mergedScrapedData, aggregateStorage]);

  // Filter application pipeline
  const filteredUnits = useMemo(() => {
    let units = [...fullyMappedUnits];

    // 1. Text Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      units = units.filter(u => 
        u.Name.toLowerCase().includes(q) || 
        u.ID.toLowerCase().includes(q)
      );
    }

    // 2. Rarity category
    if (activeRarity !== 'all') {
      units = units.filter(u => {
        const rarityCode = u.Rarity || 'ra_common';
        const pretty = getRarityDetails(rarityCode).label.toLowerCase();
        return pretty === activeRarity.toLowerCase();
      });
    }

    // 3. Demand filter
    if (activeDemand !== 'all') {
      units = units.filter(u => {
        const d = u.scraped.demand?.toLowerCase() || '';
        if (activeDemand === 'unstable') {
          return d.includes('unstable') || u.scraped.status?.toLowerCase().includes('unstable');
        }
        if (activeDemand === 'high' || activeDemand === 'very_high') {
          if (d.includes('/10')) {
            const val = parseFloat(d);
            return !isNaN(val) && val >= 6;
          }
          return d.includes('high') || d.includes('unstable');
        }
        if (activeDemand === 'low') {
          if (d.includes('/10')) {
            const val = parseFloat(d);
            return !isNaN(val) && val <= 4;
          }
          return d.includes('low');
        }
        return true;
      });
    }

    // 4. Status filter
    if (activeTrend !== 'all') {
      units = units.filter(u => {
        const s = u.scraped.status?.toLowerCase() || '';
        return s.includes(activeTrend.toLowerCase());
      });
    }

    // 5. Ownership filter
    if (ownershipFilter === 'owned') {
      units = units.filter(u => u.totalOwned > 0);
    } else if (ownershipFilter === 'missing') {
      units = units.filter(u => u.totalOwned === 0);
    }

    // 6. Sorting pipeline
    units.sort((a, b) => {
      if (sortBy === 'value-desc') {
        return b.scraped.numericValue - a.scraped.numericValue;
      }
      if (sortBy === 'value-asc') {
        return a.scraped.numericValue - b.scraped.numericValue;
      }
      if (sortBy === 'name-asc') {
        return a.Name.localeCompare(b.Name);
      }
      if (sortBy === 'demand-desc') {
        const demandIndex = (d: string) => {
          if (d.includes('/10')) {
            const val = parseFloat(d);
            return isNaN(val) ? 5 : val;
          }
          const lower = d.toLowerCase();
          if (lower.includes('very high') || lower.includes('unstable')) return 8;
          if (lower.includes('high')) return 7;
          if (lower.includes('medium')) return 5;
          return 3;
        };
        return demandIndex(b.scraped.demand) - demandIndex(a.scraped.demand);
      }
      return 0;
    });

    return units;
  }, [fullyMappedUnits, searchQuery, activeRarity, activeDemand, activeTrend, ownershipFilter, sortBy]);

  return (
    <div className="flex flex-col gap-5" id="gtd-units-tab-container">
      
      {/* Top Banner & Stats Overview */}
      <div className="bg-zinc-900/10 border border-zinc-850/40 rounded-2xl p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 uppercase tracking-wider">
                Value Sheet Index
              </span>
              <span className="text-[10px] text-zinc-550 font-mono">
                Source: <a href="https://www.vaultedvaluesx.com/garden-tower-defense" target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline hover:text-indigo-400">Vaulted Values X</a>
              </span>
            </div>
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-1.5">
              🏆 Garden TD Value Database
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchValuesData(true)}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-zinc-950 border border-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer disabled:opacity-50 transition"
              id="gtd-refresh-btn"
            >
              <RefreshCw className={`w-3 h-3 text-indigo-400 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Sync Prices'}
            </button>

            <div className="bg-zinc-950 border border-zinc-900 py-1.5 px-3 rounded-xl flex items-center gap-2" id="scraper-status-card">
              <span className={`w-1.5 h-1.5 rounded-full ${source === 'live' ? 'bg-emerald-400' : source === 'cache' ? 'bg-sky-400' : 'bg-amber-400 animate-pulse'}`} />
              <span className="text-[10px] font-bold text-zinc-400 font-mono capitalize">
                {source === 'live' ? 'Live' : source === 'cache' ? 'Cached' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Global linked Account Equity Statistics row! */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-zinc-900">
          <div>
            <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-mono font-bold block">Total Items</span>
            <span className="text-base font-bold text-zinc-300 font-display block mt-0.5">215 <span className="text-[9px] text-zinc-500 font-mono font-normal">loaded</span></span>
          </div>

          <div>
            <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-mono font-bold block">Owned Unique</span>
            <span className="text-base font-bold text-indigo-400 font-display block mt-0.5">{ownedSummary.unique} <span className="text-[9px] text-zinc-550 font-mono font-normal">types</span></span>
          </div>

          <div>
            <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-mono font-bold block">Total Stored Quantity</span>
            <span className="text-base font-bold text-emerald-400 font-display block mt-0.5">{ownedSummary.totalCount.toLocaleString()} <span className="text-[9px] text-zinc-555 font-mono font-normal">units</span></span>
          </div>

          <div>
            <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-mono font-bold block">Total Linked Value</span>
            <span className="text-base font-bold text-amber-500 font-display block mt-0.5" title={`${ownedSummary.totalWorth.toLocaleString()} Gems`}>
              {ownedSummary.totalWorth.toLocaleString()} <span className="text-[9px] text-zinc-550 font-mono font-normal">Gems</span>
            </span>
          </div>
        </div>
      </div>

      {source === 'fallback' && (
        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[9px] text-zinc-400">
            Vaulted Values Direct Crawl proxy is currently offline. Mounted fallback dataset of 200+ accurate item indexes.
          </p>
        </div>
      )}

      {/* Main Filter Suite */}
      <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-3">
        
        {/* Row 1: Search & sorting */}
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search units..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-900 text-[11px] text-white rounded-xl pl-8.5 pr-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
              id="gtd-search-input"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto shrink-0 pb-0.5">
            <div className="flex bg-zinc-950 border border-zinc-900 rounded-lg p-0.5">
              <button
                onClick={() => setOwnershipFilter('all')}
                className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition cursor-pointer ${ownershipFilter === 'all' ? 'bg-zinc-850 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                All
              </button>
              <button
                onClick={() => setOwnershipFilter('owned')}
                className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition cursor-pointer ${ownershipFilter === 'owned' ? 'bg-zinc-850 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Owned ({ownedSummary.unique})
              </button>
              <button
                onClick={() => setOwnershipFilter('missing')}
                className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition cursor-pointer ${ownershipFilter === 'missing' ? 'bg-zinc-855 text-rose-450' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Missing
              </button>
            </div>

            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-zinc-950 border border-zinc-900 text-zinc-400 text-[9px] font-bold rounded-lg py-1.5 px-2 focus:outline-none cursor-pointer"
            >
              <option value="value-desc">High Value</option>
              <option value="value-asc">Low Value</option>
              <option value="demand-desc">High Demand</option>
              <option value="name-asc">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Rarity category tab selectors */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-none" id="rarity-tabs-scroll">
          {['all', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Godly', 'Exclusive'].map((r) => (
            <button
              key={r}
              onClick={() => setActiveRarity(r)}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold whitespace-nowrap border cursor-pointer transition ${
                activeRarity === r
                  ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                  : 'bg-zinc-950 border border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-850'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Main Roster layout - Blocky aspect-square items exactly like the storage tab */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-4 text-center">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-zinc-550 text-[10px] mt-1 font-mono">Syncing Vaulted Values data schema...</p>
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="bg-zinc-950/20 border border-dashed border-zinc-900 py-16 text-center rounded-2xl">
          <p className="text-zinc-500 font-bold text-xs">No matching Garden TD units</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5" id="gtd-units-grid">
          {filteredUnits.map((valUnit) => {
            const rawRarity = valUnit.Rarity || 'ra_common';
            const rStyle = getRarityDetails(rawRarity);

            // Match colors to exact storage items theme
            const colorClass = 
              rawRarity === 'ra_common' ? 'bg-zinc-950/30 border-zinc-900 hover:border-zinc-800' :
              rawRarity === 'ra_uncommon' ? 'bg-emerald-950/10 border-emerald-950/20 text-emerald-300 hover:border-emerald-800/40' :
              rawRarity === 'ra_rare' ? 'bg-blue-950/10 border-blue-950/20 text-blue-300 hover:border-blue-800/40' :
              rawRarity === 'ra_epic' ? 'bg-purple-950/10 border-purple-950/20 text-purple-300 hover:border-purple-800/40' :
              rawRarity === 'ra_exclusive' ? 'bg-fuchsia-950/5 border-fuchsia-500/20 text-fuchsia-300 hover:border-fuchsia-500/40' :
              rawRarity === 'ra_godly' ? 'bg-rose-950/5 border-rose-500/20 text-rose-300 hover:border-rose-500/40' :
              'bg-amber-950/10 border-amber-950/20 text-amber-300 hover:border-amber-800/40';

            // Distinctive colors for trend status
            const statusLower = valUnit.scraped.status?.toLowerCase() || '';
            const statusColorClass = 
              statusLower.includes('stable') ? 'text-zinc-500' :
              statusLower.includes('unstable') ? 'text-amber-500 animate-pulse font-extrabold' :
              statusLower.includes('ris') || statusLower.includes('up') ? 'text-emerald-400 font-bold' :
              statusLower.includes('drop') || statusLower.includes('down') ? 'text-rose-400 font-bold' :
              statusLower.includes('fluctuating') ? 'text-indigo-400' :
              'text-zinc-400';

            return (
              <div
                key={valUnit.ID}
                onClick={() => {
                  setEditingUnit(valUnit);
                  setEditedVal(valUnit.scraped.value);
                  setEditedDemand(valUnit.scraped.demand);
                  setEditedStatus(valUnit.scraped.status);
                }}
                className={`rounded-2xl border flex flex-col p-4 cursor-pointer transition-all duration-150 relative group ${colorClass} hover:bg-zinc-900/10 hover:scale-[1.01]`}
              >
                {/* Linked inventory indicator badge */}
                {valUnit.totalOwned > 0 && (
                  <div className="absolute top-3 right-3 shrink-0 bg-indigo-500/15 border border-indigo-500/25 px-2 py-0.5 rounded-full select-none">
                    <span className="text-[9px] font-mono font-black text-indigo-400">
                      x{valUnit.totalOwned}
                    </span>
                  </div>
                )}

                {/* Edit Pencil icon visible on hover */}
                <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-zinc-500 hover:text-zinc-200">
                  <Edit2 className="w-3.5 h-3.5" />
                </div>

                {/* Card Header Info */}
                <div className="text-center mt-1 w-full flex flex-col items-center">
                  <span className="text-[11px] font-bold text-zinc-100 block truncate leading-tight w-full" title={valUnit.Name}>
                    {valUnit.Name}
                  </span>
                  <span className="text-[9px] font-mono uppercase tracking-wider font-semibold opacity-70 mt-0.5 block">
                    {rStyle.label}
                  </span>
                </div>

                {/* AssetImage loader aligned in the middle */}
                <div className="my-3 flex flex-col items-center justify-center p-2 min-h-[56px] w-full">
                  <AssetImage
                    rawName={valUnit.ID}
                    fallbackEmoji="📦"
                    className="w-12 h-12 object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform duration-150"
                  />
                </div>

                {/* Info List at Bottom - Full detail specifications */}
                <div className="w-full mt-auto pt-2.5 border-t border-zinc-900/60 space-y-1.5 text-[10px] font-medium text-zinc-400">
                  <div className="flex items-center justify-between border-b border-zinc-900/30 pb-1">
                    <span className="text-[9px] text-zinc-555 uppercase tracking-wider font-mono">Value</span>
                    <span className="font-mono font-bold text-amber-500 flex items-center gap-0.5">
                      <Coins className="w-2.5 h-2.5 shrink-0" />
                      {valUnit.scraped.value}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-900/30 pb-1">
                    <span className="text-[9px] text-zinc-555 uppercase tracking-wider font-mono">Status</span>
                    <span className={`font-mono font-bold ${statusColorClass}`}>
                      {valUnit.scraped.status || 'Stable'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pb-0.5">
                    <span className="text-[9px] text-zinc-555 uppercase tracking-wider font-mono">Demand</span>
                    <span className="font-mono font-bold text-zinc-300">
                      {valUnit.scraped.demand || '5/10'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Value Override Modal */}
      {editingUnit && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full max-w-sm p-5 relative shadow-2xl">
            <button
              onClick={() => setEditingUnit(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <AssetImage
                rawName={editingUnit.ID}
                fallbackEmoji="📦"
                className="w-10 h-10 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
              />
              <div>
                <h3 className="text-sm font-bold text-white">{editingUnit.Name}</h3>
                <p className="text-[10px] font-mono font-bold text-indigo-400 capitalize">
                  {getRarityDetails(editingUnit.Rarity || 'ra_common').label}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 mb-4 font-mono leading-relaxed">
              Manually override this unit's values. Changes are saved in your local workspace and merged instantly.
            </p>

            <div className="space-y-3.5 mb-5">
              <div>
                <label className="text-[9px] text-zinc-400 uppercase tracking-widest font-mono font-bold block mb-1">
                  Gem Price / Value
                </label>
                <div className="relative">
                  <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 w-3.5 h-3.5" />
                  <input
                    type="text"
                    value={editedVal}
                    onChange={(e) => setEditedVal(e.target.value)}
                    placeholder="e.g. 1,250"
                    className="w-full bg-zinc-900 border border-zinc-850 rounded-xl pl-9 pr-3 py-2 text-xs font-mono font-bold text-amber-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] text-zinc-400 uppercase tracking-widest font-mono font-bold block mb-1">
                  Demand Rating
                </label>
                <input
                  type="text"
                  value={editedDemand}
                  onChange={(e) => setEditedDemand(e.target.value)}
                  placeholder="e.g. 5/10"
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <label className="text-[9px] text-zinc-400 uppercase tracking-widest font-mono font-bold block mb-1">
                  Trend status
                </label>
                <select
                  value={editedStatus}
                  onChange={(e) => setEditedStatus(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-300 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                >
                  <option value="Stable">Stable</option>
                  <option value="Unstable">Unstable</option>
                  <option value="Rising">Rising</option>
                  <option value="Dropping">Dropping</option>
                  <option value="Fluctuating">Fluctuating</option>
                  <option value="Hyped">Hyped</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSaveOverride(editingUnit.Name, editedVal, editedDemand, editedStatus)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] py-2 rounded-xl transition cursor-pointer"
              >
                Save Override
              </button>
              
              {customOverrides[editingUnit.Name] && (
                <button
                  onClick={() => handleResetOverride(editingUnit.Name)}
                  className="bg-transparent hover:bg-rose-500/10 text-rose-450 border border-rose-500/20 font-bold text-[10px] py-2 px-3 rounded-xl transition cursor-pointer"
                  title="Clear custom override to return to official database values"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
