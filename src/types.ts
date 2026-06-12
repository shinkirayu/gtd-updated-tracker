export interface InventoryItem {
  name: string;
  quantity: number;
  category?: 'seed' | 'gem' | 'equipment' | 'misc';
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  rawName?: string;
}

export interface AccountData {
  id: string | number;
  username: string;
  map?: string;
  seeds: number;
  gems: number;
  xp: number;
  games_won: number;
  wave: number;
  units: string | number;
  pc: string;
  lobby?: string;
  inventory: InventoryItem[] | null;
  updated_at: string;
}

export type SortField = 'username' | 'gems' | 'seeds' | 'xp' | 'games_won' | 'wave' | 'updated_at';
export type SortOrder = 'asc' | 'desc';
export type StatusFilter = 'all' | 'online' | 'offline';
