export interface InventoryItem {
  name: string;
  displayName?: string;
  quantity: number;
  category?: 'seed' | 'gem' | 'equipment' | 'misc';
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  rawName?: string;
}

export interface AccountData {
  id: string | number;
  username: string;
  seeds: number;
  units: string | number;
  status?: string;
  lobby?: string;
  inventory: InventoryItem[] | null;
  updated_at: string;
}

export type SortField = 'username' | 'seeds' | 'updated_at';
export type SortOrder = 'asc' | 'desc';
export type StatusFilter = 'all' | 'online' | 'offline';
