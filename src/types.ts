export interface InventoryItem {
  id?: string;          // raw item key from reporter.lua (e.g. "unit_xxx")
  name: string;         // display name (NameCache resolved) or raw ID in legacy format
  displayName?: string;
  image?: string;       // rbxassetid:// URL from ImageCache
  count?: number;       // quantity field name in new reporter.lua format
  quantity?: number;    // quantity field name in legacy format
  category?: 'seed' | 'gem' | 'equipment' | 'misc';
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  rawName?: string;
}

export interface AccountData {
  id: string | number;
  username: string;
  seeds: number;
  lucky_blocks?: number;
  units: string | number;
  status?: string;
  lobby?: string;
  inventory: InventoryItem[] | null;
  updated_at: string;
}

export type SortField = 'username' | 'seeds' | 'updated_at';
export type SortOrder = 'asc' | 'desc';
export type StatusFilter = 'all' | 'online' | 'offline';
