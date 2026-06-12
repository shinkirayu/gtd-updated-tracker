import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronDown, 
  ChevronUp, 
  Cpu, 
  Sparkles, 
  Crown, 
  Award, 
  Flame, 
  Zap, 
  Wifi, 
  WifiOff, 
  Clock, 
  Compass, 
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { AccountData, InventoryItem } from '../types';

interface PcGroupCardProps {
  key?: string | number;
  pc: string;
  accounts: AccountData[];
  onViewInventory: (username: string, inventory: any) => void;
}

export default function PcGroupCard({ pc, accounts, onViewInventory }: PcGroupCardProps): any {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Aggregated KPIs for this specific PC node group
  const stats = useMemo(() => {
    let totalGems = 0;
    let totalWins = 0;
    let totalSeeds = 0;
    let onlineCount = 0;
    let maxWave = 0;

    accounts.forEach((acc) => {
      totalGems += Number(acc.gems || 0);
      totalWins += Number(acc.games_won || 0);
      totalSeeds += Number(acc.seeds || 0);
      
      const age = Math.floor((new Date().getTime() - new Date(acc.updated_at).getTime()) / 1000);
      if (age < 300) {
        onlineCount++;
      }

      if (Number(acc.wave || 0) > maxWave) {
        maxWave = Number(acc.wave);
      }
    });

    const onlineRatio = accounts.length > 0 ? (onlineCount / accounts.length) * 100 : 0;

    return {
      totalGems,
      totalWins,
      totalSeeds,
      onlineCount,
      totalCount: accounts.length,
      onlineRatio,
      maxWave
    };
  }, [accounts]);

  // Determine critical states
  const isHealthy = stats.onlineCount === stats.totalCount;
  const isDead = stats.onlineCount === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-3xl overflow-hidden shadow-xl mb-6 flex flex-col transition-all duration-300 hover:border-zinc-800"
    >
      {/* PC Group Header with Statistics overview */}
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="p-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer bg-zinc-900/70 border-b border-zinc-850 select-none hover:bg-zinc-900 transition"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-xl border border-zinc-700/60 text-indigo-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold font-display tracking-tight text-white capitalize">{pc}</h3>
              <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-md border ${
                isHealthy 
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40' 
                  : isDead 
                    ? 'bg-rose-950/40 text-rose-400 border-rose-900/40' 
                    : 'bg-amber-950/40 text-amber-400 border-amber-900/40'
              }`}>
                {stats.onlineCount} / {stats.totalCount} Alive
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">PC Node Cluster Group</p>
          </div>
        </div>

        {/* Aggregate Stats Highlights for this PC */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-zinc-400">
          <div className="bg-zinc-950/50 px-3 py-1.5 rounded-xl border border-zinc-850/80">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-0.5">Gems Block</span>
            <span className="font-mono text-zinc-200 font-bold">{stats.totalGems.toLocaleString()}</span>
          </div>

          <div className="bg-zinc-950/50 px-3 py-1.5 rounded-xl border border-zinc-850/80">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-0.5">Total Wins</span>
            <span className="font-mono text-zinc-200 font-bold">{stats.totalWins.toLocaleString()}</span>
          </div>

          <div className="bg-zinc-950/50 px-3 py-1.5 rounded-xl border border-zinc-850/80">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-0.5">Peak Wave</span>
            <span className="text-amber-400 font-extrabold flex items-center gap-1">
              <Flame className="w-3 h-3 animate-bounce" /> {stats.maxWave}
            </span>
          </div>

          {/* Collapsible toggle icon */}
          <div className="p-1.5 bg-zinc-850 rounded-lg hover:text-white transition ml-2">
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Account Table */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-850 text-[11px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-900/30 font-display">
                    <th className="p-4 pl-6 text-center w-16">State</th>
                    <th className="p-4">Account Metadata</th>
                    <th className="p-4">Seeds</th>
                    <th className="p-4">Gems Sum</th>
                    <th className="p-4">XP Level / Status</th>
                    <th className="p-4 text-center">Wins</th>
                    <th className="p-4">Wave</th>
                    <th className="p-4">Active Units</th>
                    <th className="p-4 text-center">Key Items</th>
                    <th className="p-4 text-center">Loot</th>
                    <th className="p-4 pr-6 text-right">Heartbeat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/55">
                  {accounts.map((acc, idx) => {
                    const age = Math.floor((new Date().getTime() - new Date(acc.updated_at).getTime()) / 1000);
                    const isOnline = age < 300;
                    
                    // Determine highlight states
                    const isHighEarn = acc.gems > 100000;
                    const isHighWinner = acc.games_won > 500;
                    const isGodMode = acc.wave > 120;

                    return (
                      <motion.tr
                        key={acc.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        className={`group hover:bg-zinc-900/40 transition duration-150 relative ${
                          !isOnline ? 'opacity-70 saturate-75' : ''
                        }`}
                      >
                        {/* Status Column */}
                        <td className="p-4 pl-6 text-center">
                          <div className="inline-flex items-center justify-center relative">
                            {isOnline ? (
                              <>
                                <span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                              </>
                            ) : (
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-650" />
                            )}
                          </div>
                        </td>

                        {/* Account Name */}
                        <td className="p-4 font-semibold">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-zinc-100 group-hover:text-white transition">
                              {acc.username}
                            </span>
                            {/* Badges system */}
                            {isGodMode && (
                              <span className="text-amber-500 p-0.5 bg-amber-500/10 rounded-md border border-amber-500/20" title="Survival Elite">
                                <Crown className="w-3 h-3" />
                              </span>
                            )}
                            {isHighWinner && (
                              <span className="text-indigo-400 p-0.5 bg-indigo-500/10 rounded-md border border-indigo-500/20" title="Champ Winner">
                                <Award className="w-3 h-3" />
                              </span>
                            )}
                            {isHighEarn && (
                              <span className="text-yellow-400 p-0.5 bg-yellow-500/10 rounded-md border border-yellow-500/20" title="Millionaire status">
                                <Sparkles className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono font-normal tracking-wide block">
                            PC ID: {acc.pc}
                          </span>
                        </td>

                        {/* Seeds */}
                        <td className="p-4">
                          <span className="font-mono text-xs font-semibold text-zinc-300">
                            {Number(acc.seeds || 0).toLocaleString()} 🌱
                          </span>
                        </td>

                        {/* Gems */}
                        <td className="p-4">
                          <span className={`font-mono font-extrabold text-sm ${isHighEarn ? 'text-amber-400' : 'text-zinc-200'}`}>
                            {Number(acc.gems || 0).toLocaleString()}
                          </span>
                        </td>

                        {/* XP */}
                        <td className="p-4">
                          <div className="w-32">
                            <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-1">
                              <span>Level {Math.floor((acc.xp || 0) / 1000) + 1}</span>
                              <span>{acc.xp % 1000}/1000 XP</span>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min((acc.xp % 1000) / 10, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Wins */}
                        <td className="p-4 text-center font-mono text-xs font-bold text-zinc-300">
                          {acc.games_won}
                        </td>

                        {/* Wave */}
                        <td className="p-4">
                          <div className="flex items-center gap-1 text-sm font-bold font-mono">
                            {acc.wave >= 100 ? (
                              <span className="flex items-center gap-0.5 text-rose-400 animate-pulse font-extrabold text-xs">
                                <Flame className="w-3.5 h-3.5" /> W{acc.wave}
                              </span>
                            ) : (
                              <span className="text-zinc-300 text-xs">W{acc.wave}</span>
                            )}
                          </div>
                        </td>

                        {/* Active Units */}
                        <td className="p-4">
                          <span className="text-[11px] font-mono text-zinc-400 max-w-[120px] truncate block" title={String(acc.units || '')}>
                            {acc.units || 'None Deploy'}
                          </span>
                        </td>

                        {/* Key Items: Rafflesia & Trident */}
                        <td className="p-4 text-center">
                          {(() => {
                            const inv = acc.inventory || [];
                            const hasRafflesia = inv.some(i => i.name?.toLowerCase().includes('rafflesia'));
                            const hasTrident = inv.some(i => i.name?.toLowerCase().includes('trident'));
                            return (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${hasRafflesia ? 'text-pink-400 bg-pink-500/10 border-pink-500/20' : 'text-zinc-600 bg-zinc-800/50 border-zinc-700/30'}`}>
                                  RAF
                                </span>
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${hasTrident ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' : 'text-zinc-600 bg-zinc-800/50 border-zinc-700/30'}`}>
                                  TRI
                                </span>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Inventory launcher */}
                        <td className="p-4 text-center">
                          <button
                            onClick={() => onViewInventory(acc.username, acc.inventory)}
                            className="bg-zinc-800 hover:bg-indigo-650 hover:text-white border border-zinc-700/80 px-3.5 py-1.5 rounded-xl font-display text-xs font-semibold text-zinc-300 transition shadow hover:border-indigo-500 cursor-pointer flex items-center gap-1 mx-auto"
                          >
                            Storage
                          </button>
                        </td>

                        {/* Heartbeat Updated Time */}
                        <td className="p-4 pr-6 text-right font-mono text-xs">
                          {isOnline ? (
                            <span className="text-emerald-400 flex items-center justify-end gap-1 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                              {age <= 0 ? 'now' : `${age}s ago`}
                            </span>
                          ) : (
                            <span className="text-zinc-500 italic">
                              {age > 3600 ? `${Math.floor(age / 3600)}h ago` : `${Math.floor(age / 60)}m ago`}
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
