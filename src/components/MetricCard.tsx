import { ReactNode } from 'react';
import { motion } from 'motion/react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
  trend?: {
    label: string;
    isPositive?: boolean;
  };
  color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'muted';
}

export default function MetricCard({ title, value, icon, subtitle, trend, color }: MetricCardProps) {
  const colorSchemes = {
    indigo: {
      border: 'hover:border-indigo-500/50 border-zinc-800/80',
      iconBg: 'bg-indigo-500/10 text-indigo-400',
      textGlow: 'text-indigo-400',
      badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      gradient: 'from-indigo-500/5 to-transparent',
    },
    emerald: {
      border: 'hover:border-emerald-500/50 border-zinc-800/80',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      textGlow: 'text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      gradient: 'from-emerald-500/5 to-transparent',
    },
    amber: {
      border: 'hover:border-amber-500/50 border-zinc-800/80',
      iconBg: 'bg-amber-500/10 text-amber-400',
      textGlow: 'text-amber-400',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      gradient: 'from-amber-500/5 to-transparent',
    },
    rose: {
      border: 'hover:border-rose-500/50 border-zinc-800/80',
      iconBg: 'bg-rose-500/10 text-rose-400',
      textGlow: 'text-rose-400',
      badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      gradient: 'from-rose-500/5 to-transparent',
    },
    muted: {
      border: 'hover:border-zinc-700 border-zinc-800/80',
      iconBg: 'bg-zinc-800 text-zinc-400',
      textGlow: 'text-zinc-200',
      badge: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      gradient: 'from-zinc-800/5 to-transparent',
    },
  };

  const scheme = colorSchemes[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.3, type: "spring", stiffness: 180 }}
      className={`relative overflow-hidden bg-zinc-900/50 backdrop-blur-xl border ${scheme.border} rounded-3xl p-6 transition-all duration-300 flex flex-col justify-between h-full group`}
    >
      {/* Background soft glow gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${scheme.gradient} pointer-events-none opacity-50 z-0`} />

      <div className="flex items-center justify-between gap-4 z-10 relative">
        <span className="text-zinc-400 text-xs font-semibold tracking-wider font-display uppercase">
          {title}
        </span>
        <div className={`p-2.5 rounded-2xl ${scheme.iconBg} transition-all duration-300 group-hover:scale-110 shadow`}>
          {icon}
        </div>
      </div>

      <div className="mt-4 z-10 relative">
        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-extrabold font-display leading-tight tracking-tight ${scheme.textGlow}`}>
            {value}
          </span>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-850">
          <span className="text-zinc-500 text-[11px] truncate">
            {subtitle || 'Node network stream'}
          </span>
          {trend && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-medium ${scheme.badge}`}>
              {trend.label}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
