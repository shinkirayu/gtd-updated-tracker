import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Monitor,
  Search,
  Users,
  Wifi,
  WifiOff,
  Gem,
  RefreshCw,
  Clock,
  Cpu,
  Inbox,
  Flame,
  Award,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Copy,
  Check,
  ExternalLink,
  FileCode
} from 'lucide-react';

import { AccountData, InventoryItem } from './types';
import InventoryDrawer from './components/InventoryDrawer';
import AssetImage from './components/AssetImage';
import UnitsTab from './components/UnitsTab';
import ListingsTab from './components/ListingsTab';
import { gtdUnitsList, getRarityDetails } from './data/gtdUnits';

const gtdNameMap = new Map<string, string>(gtdUnitsList.map(u => [u.ID, u.Name]));

// Supabase Connection Client
const DEFAULT_SUPABASE_URL = "https://aamxhmrecxtiecjevyht.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhbXhobXJlY3h0aWVjamV2eWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTY1MzgsImV4cCI6MjA5NjkzMjUzOH0.RJDYdY9wPVHTerzx9t9PgMKkEGv3zVp-WPF1joYGRL0";

let supabaseUrl = (() => {
  try {
    return localStorage.getItem('GTD_SUPABASE_URL') || DEFAULT_SUPABASE_URL;
  } catch (e) {
    return DEFAULT_SUPABASE_URL;
  }
})();

let supabaseKey = (() => {
  try {
    return localStorage.getItem('GTD_SUPABASE_KEY') || DEFAULT_SUPABASE_KEY;
  } catch (e) {
    return DEFAULT_SUPABASE_KEY;
  }
})();

export let supabase = createClient(supabaseUrl, supabaseKey);

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

interface ImportedAccount {
  username: string;
  pass?: string;
  cookie?: string;
  pcCategoryByClient?: string;
  game?: string;
  status?: string;
  createdAt: string;
}

interface GameConfig {
  name: string;
  isActive: boolean;
  trackedColumns: {
    account: boolean;
    game: boolean;
    map: boolean;
    seeds: boolean;
    storage: boolean;
    lobby: boolean;
    updated: boolean;
  };
  createdAt: string;
}

export default function App() {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  
  // -- NEW GAMES TAB STATE MANAGEMENT --
  const [games, setGames] = useState<GameConfig[]>([]);
  const [selectedGameFilter, setSelectedGameFilter] = useState<string>('all');
  const [newGameName, setNewGameName] = useState('');
  const [newGameColumns, setNewGameColumns] = useState({
    account: true,
    game: true,
    map: true,
    seeds: true,
    storage: true,
    lobby: false,
    updated: true
  });
  
  // Loading and refreshing states
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Inventory drawer state
  const [selectedInventoryUser, setSelectedInventoryUser] = useState<{
    username: string;
    inventory: InventoryItem[] | null;
  } | null>(null);

  // Tabs navigation state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'storage' | 'games' | 'units' | 'listings'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Collapsed state for PC groups
  const [collapsedPcs, setCollapsedPcs] = useState<Record<string, boolean>>({});
  // Selected global storage item detailed view
  const [selectedStorageItemName, setSelectedStorageItemName] = useState<string | null>(null);

  // Trading/Selling manual accounts ledger state
  const [storageSubTab, setStorageSubTab] = useState<'farm' | 'portfolios' | 'sql'>('farm');
  const [portfolioActiveTab, setPortfolioActiveTab] = useState<'trade' | 'selling'>('trade');
  const [sqlDialect, setSqlDialect] = useState<'sqlite' | 'postgres' | 'mysql' | 'supabase'>('supabase');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [supabaseToken, setSupabaseToken] = useState<number>(0);
  const [seedsNoonBaseline, setSeedsNoonBaseline] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('gtd_seeds_noon_snapshot');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {};
      }
    } catch {}
    return {};
  });
  const [seedsSnapshotTimestamp, setSeedsSnapshotTimestamp] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('gtd_seeds_noon_snapshot');
      if (saved) {
        const parsed = JSON.parse(saved);
        return typeof parsed.timestamp === 'number' ? parsed.timestamp : 0;
      }
    } catch {}
    return 0;
  });
  const [schemaTablesMissing, setSchemaTablesMissing] = useState(false);
  const [schemaTablesStatusText, setSchemaTablesStatusText] = useState<string | null>(null);

  // Custom Supabase inputs for database replication across PCs
  const [supabaseSetupUrl, setSupabaseSetupUrl] = useState(() => {
    try {
      return localStorage.getItem('GTD_SUPABASE_URL') || DEFAULT_SUPABASE_URL;
    } catch {
      return DEFAULT_SUPABASE_URL;
    }
  });
  const [supabaseSetupKey, setSupabaseSetupKey] = useState(() => {
    try {
      return localStorage.getItem('GTD_SUPABASE_KEY') || DEFAULT_SUPABASE_KEY;
    } catch {
      return DEFAULT_SUPABASE_KEY;
    }
  });
  const [selectedStorageSource, setSelectedStorageSource] = useState<'farm' | 'trade' | 'selling'>('farm');
  const [tradingAccounts, setTradingAccounts] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('gtd_trading_accounts_ledger');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedTradingAccountId, setSelectedTradingAccountId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('gtd_trading_accounts_ledger');
      const parsed = saved ? JSON.parse(saved) : [];
      return parsed.length > 0 ? parsed[0].id : null;
    } catch {
      return null;
    }
  });
  const [newTradingAccountName, setNewTradingAccountName] = useState('');
  const [newTradingAccountType, setNewTradingAccountType] = useState<'Trading' | 'Selling' | 'Both'>('Both');

  // New manual unit state
  const [manualUnitSearch, setManualUnitSearch] = useState('');
  const [manualUnitSelected, setManualUnitSelected] = useState<any | null>(null);
  const [manualUnitQty, setManualUnitQty] = useState<number>(1);
  const [manualUnitCategory, setManualUnitCategory] = useState<'Trading' | 'Selling'>('Trading');
  const [depositPopupUnit, setDepositPopupUnit] = useState<any | null>(null);
  const [depositRarityFilter, setDepositRarityFilter] = useState<string[]>([]);
  const [depositQtyStr, setDepositQtyStr] = useState('');
  const [unitDepQty, setUnitDepQty] = useState<Record<string, number>>({});

  // Ledger filter states
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState<'all' | 'Trading' | 'Selling'>('all');
  const [ledgerUnitSearch, setLedgerUnitSearch] = useState('');

  // Transfer state for custom portfolio holders
  const [transferringHolderIndex, setTransferringHolderIndex] = useState<number | null>(null);
  const [transferTargetUsername, setTransferTargetUsername] = useState<string>('');
  const [transferQty, setTransferQty] = useState<number>(1);
  const [isTransferringLoader, setIsTransferringLoader] = useState<boolean>(false);

  const syncPortfoliosToSupabase = async (portfolios: any[]) => {
    try {
      for (const port of portfolios) {
        await supabase
          .from('gtd_custom_portfolios')
          .upsert({
            id: port.id,
            name: port.name,
            portfolio_type: port.type,
            items: port.items,
            updated_at: new Date().toISOString()
          });
      }
    } catch (err) {
      // Fail silently to local storage
    }
  };

  const saveTradingAccounts = (updated: any[]) => {
    // Detect deleted portfolios
    const deletedIds = tradingAccounts
      .filter(oldAcc => !updated.some(newAcc => newAcc.id === oldAcc.id))
      .map(oldAcc => oldAcc.id);

    setTradingAccounts(updated);
    try {
      localStorage.setItem('gtd_trading_accounts_ledger', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }

    // Remote deletes
    if (deletedIds.length > 0) {
      try {
        supabase
          .from('gtd_custom_portfolios')
          .delete()
          .in('id', deletedIds)
          .then(() => {});
      } catch (err) {}
    }

    // Remote updates
    syncPortfoliosToSupabase(updated);
  };

  const handleCreateTradingAccount = () => {
    let name = newTradingAccountName.trim();
    const determinedType = portfolioActiveTab === 'selling' ? 'Selling' : 'Trading';
    if (!name) {
      const tabCategory = portfolioActiveTab === 'selling' ? 'Selling' : 'Trading';
      const filteredTradingAccounts = tradingAccounts.filter(
        (acc) => acc.type === tabCategory || acc.type === 'Both'
      );
      const nextNum = filteredTradingAccounts.length + 1;
      name = determinedType === 'Selling' ? `Seller ${nextNum}` : `Storage ${nextNum}`;
    }
    const newAccount = {
      id: 'trade_acc_' + Date.now(),
      name: name,
      type: determinedType,
      items: [],
    };
    const updated = [...tradingAccounts, newAccount];
    saveTradingAccounts(updated);
    setNewTradingAccountName('');
    setSelectedTradingAccountId(newAccount.id);
  };

  const handleDeleteTradingAccount = (id: string) => {
    const updated = tradingAccounts.filter(acc => acc.id !== id);
    saveTradingAccounts(updated);
    if (selectedTradingAccountId === id) {
      setSelectedTradingAccountId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleAddManualUnit = () => {
    if (!selectedTradingAccountId) return;
    if (!manualUnitSelected) return;
    if (manualUnitQty < 1) return;

    const currentAcc = tradingAccounts.find(acc => acc.id === selectedTradingAccountId);
    if (!currentAcc) return;

    const determinedCategory = portfolioActiveTab === 'selling' ? 'Selling' : 'Trading';

    // Check if item already exists in this account with the same category
    const existingIndex = currentAcc.items.findIndex(
      (item: any) => item.unitId === manualUnitSelected.ID && item.category === determinedCategory
    );

    let updatedItems = [...currentAcc.items];
    if (existingIndex > -1) {
      updatedItems[existingIndex].quantity += manualUnitQty;
    } else {
      updatedItems.push({
        id: 'manual_item_' + Date.now() + Math.random().toString(36).substr(2, 4),
        unitId: manualUnitSelected.ID,
        unitName: manualUnitSelected.Name,
        quantity: manualUnitQty,
        category: determinedCategory
      });
    }

    const updatedAccounts = tradingAccounts.map(acc => 
      acc.id === selectedTradingAccountId ? { ...acc, items: updatedItems } : acc
    );

    saveTradingAccounts(updatedAccounts);
    setManualUnitSelected(null);
    setManualUnitSearch('');
    setManualUnitQty(1);
    setToastMessage(`Added x${manualUnitQty} ${manualUnitSelected.Name} to ${currentAcc.name}`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleAddManualUnitDirect = (unit: any, qty: number) => {
    if (!selectedTradingAccountId) {
      setToastMessage("Please select or register a profile first!");
      setTimeout(() => setToastMessage(null), 2500);
      return;
    }
    if (!unit) return;
    if (qty < 1) return;

    const currentAcc = tradingAccounts.find(acc => acc.id === selectedTradingAccountId);
    if (!currentAcc) return;

    const determinedCategory = portfolioActiveTab === 'selling' ? 'Selling' : 'Trading';

    // Check if item already exists in this account with the same category
    const existingIndex = currentAcc.items.findIndex(
      (item: any) => item.unitId === unit.ID && item.category === determinedCategory
    );

    let updatedItems = [...currentAcc.items];
    if (existingIndex > -1) {
      updatedItems[existingIndex].quantity += qty;
    } else {
      updatedItems.push({
        id: 'manual_item_' + Date.now() + Math.random().toString(36).substr(2, 4),
        unitId: unit.ID,
        unitName: unit.Name,
        quantity: qty,
        category: determinedCategory
      });
    }

    const updatedAccounts = tradingAccounts.map(acc => 
      acc.id === selectedTradingAccountId ? { ...acc, items: updatedItems } : acc
    );

    saveTradingAccounts(updatedAccounts);
    setToastMessage(`Added x${qty} ${unit.Name} to ${currentAcc.name}`);
    setTimeout(() => setToastMessage(null), 2550);
  };

  const handleDeleteManualUnit = (accountId: string, itemId: string) => {
    const currentAcc = tradingAccounts.find(acc => acc.id === accountId);
    if (!currentAcc) return;

    const updatedItems = currentAcc.items.filter((item: any) => item.id !== itemId);
    const updatedAccounts = tradingAccounts.map(acc => 
      acc.id === accountId ? { ...acc, items: updatedItems } : acc
    );
    saveTradingAccounts(updatedAccounts);
  };

  const handleUpdateManualUnitQty = (accountId: string, itemId: string, newQty: number) => {
    if (newQty < 1) return;
    const currentAcc = tradingAccounts.find(acc => acc.id === accountId);
    if (!currentAcc) return;

    const updatedItems = currentAcc.items.map((item: any) => 
      item.id === itemId ? { ...item, quantity: newQty } : item
    );
    const updatedAccounts = tradingAccounts.map(acc => 
      acc.id === accountId ? { ...acc, items: updatedItems } : acc
    );
    saveTradingAccounts(updatedAccounts);
  };

  const handleTransferToStorage = async (
    portfolioName: string,
    targetUsername: string,
    qty: number
  ) => {
    if (!selectedStorageItemName) return;
    if (!targetUsername) return;
    if (qty < 1) return;

    // 1. Find the local portfolio
    const portfolio = tradingAccounts.find(acc => acc.name === portfolioName);
    if (!portfolio) {
      setToastMessage("Error: Custom portfolio not found.");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    // 2. Find the specific item inside that portfolio corresponding to current view
    const category = selectedStorageSource === 'trade' ? 'Trading' : 'Selling';
    const itemInPortfolio = portfolio.items?.find(
      (i: any) => i.unitName === selectedStorageItemName && i.category === category
    );

    if (!itemInPortfolio) {
      setToastMessage("Error: Unit item not found inside custom portfolio.");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    if (itemInPortfolio.quantity < qty) {
      setToastMessage(`Error: Insufficient stock. Portfolio only has x${itemInPortfolio.quantity}.`);
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    // 3. Find target farm account from accounts list loaded from Supabase
    const targetAccount = accounts.find(acc => acc.username === targetUsername);
    if (!targetAccount) {
      setToastMessage(`Error: Target farm account "${targetUsername}" not found.`);
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    setIsTransferringLoader(true);
    try {
      // 4. Update the inventory of the target farm account in Supabase
      const currentInventory = targetAccount.inventory || [];
      const existingItemIndex = currentInventory.findIndex(
        (i: any) => i.name.toLowerCase() === selectedStorageItemName.toLowerCase()
      );

      let updatedInventory = [...currentInventory];
      if (existingItemIndex > -1) {
        updatedInventory[existingItemIndex] = {
          ...updatedInventory[existingItemIndex],
          quantity: (updatedInventory[existingItemIndex].quantity || 0) + qty,
        };
      } else {
        const matchingGTD = gtdUnitsList.find(u => u.Name === selectedStorageItemName || u.ID === itemInPortfolio.unitId);
        updatedInventory.push({
          name: selectedStorageItemName,
          quantity: qty,
          category: 'misc',
          rarity: (selectedStorageItem?.rarity || 'common') as any,
          rawName: itemInPortfolio.unitId || matchingGTD?.ID || selectedStorageItemName,
        });
      }

      const { error } = await supabase
        .from('accounts')
        .update({ inventory: updatedInventory })
        .eq('username', targetUsername);

      if (error) {
        throw error;
      }

      // 5. Update the local portfolio state locally (and in localStorage)
      const updatedItems = qty >= itemInPortfolio.quantity
        ? portfolio.items.filter((i: any) => i.id !== itemInPortfolio.id)
        : portfolio.items.map((i: any) => i.id === itemInPortfolio.id ? { ...i, quantity: i.quantity - qty } : i);

      const updatedAccounts = tradingAccounts.map(acc =>
        acc.id === portfolio.id ? { ...acc, items: updatedItems } : acc
      );
      saveTradingAccounts(updatedAccounts);

      // 6. Signal success to the user
      setToastMessage(`Successfully transferred x${qty} ${selectedStorageItemName} to ${targetUsername}'s farm storage!`);
      setTimeout(() => setToastMessage(null), 3000);
      setTransferringHolderIndex(null);
    } catch (e: any) {
      console.error("Transfer error:", e);
      setToastMessage(`Transfer failed: ${e.message || 'Unknown network error'}`);
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsTransferringLoader(false);
    }
  };

  // Smart auto-selection effect for manual portfolios depending on active trade/selling tab
  useEffect(() => {
    if (activeTab === 'storage') {
      if (storageSubTab === 'portfolios') {
        if (portfolioActiveTab === 'trade') {
          const valid = tradingAccounts.find(acc => acc.type === 'Trading' || acc.type === 'Both');
          if (valid && (!selectedTradingAccountId || !tradingAccounts.some(acc => acc.id === selectedTradingAccountId && (acc.type === 'Trading' || acc.type === 'Both')))) {
            setSelectedTradingAccountId(valid.id);
          }
        } else if (portfolioActiveTab === 'selling') {
          const valid = tradingAccounts.find(acc => acc.type === 'Selling' || acc.type === 'Both');
          if (valid && (!selectedTradingAccountId || !tradingAccounts.some(acc => acc.id === selectedTradingAccountId && (acc.type === 'Selling' || acc.type === 'Both')))) {
            setSelectedTradingAccountId(valid.id);
          }
        }
      }
    }
  }, [storageSubTab, portfolioActiveTab, activeTab, tradingAccounts, selectedTradingAccountId]);

  // Generate SQL schema and seed data statements based on active dialect
  const generateSqlBackup = (dialect: 'sqlite' | 'postgres' | 'mysql' | 'supabase' = 'sqlite') => {
    let sql = `-- ==================================================\n`;
    sql += `-- GTD Storage & Farm Inventory Backup SQL Script\n`;
    sql += `-- Generated on ${new Date().toISOString()}\n`;
    sql += `-- Supported Dialect: ${dialect.toUpperCase()}\n`;
    sql += `-- ==================================================\n\n`;

    // 1. DDL Statements
    if (dialect === 'supabase') {
      sql += `-- 1. Create the main accounts tracking table matching your exact schema structure\n`;
      sql += `CREATE TABLE IF NOT EXISTS accounts (\n`;
      sql += `  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\n`;
      sql += `  username text NOT NULL UNIQUE,\n`;
      sql += `  pc text,\n`;
      sql += `  seeds real DEFAULT 0,\n`;
      sql += `  gems real DEFAULT 0,\n`;
      sql += `  xp real DEFAULT 0,\n`;
      sql += `  prismleaf_claimed boolean DEFAULT false,\n`;
      sql += `  units smallint DEFAULT 0,\n`;
      sql += `  wave real DEFAULT 0,\n`;
      sql += `  status text DEFAULT 'offline',\n`;
      sql += `  games_won integer DEFAULT 0,\n`;
      sql += `  gamepasses jsonb DEFAULT '[]'::jsonb,\n`;
      sql += `  inventory jsonb DEFAULT '[]'::jsonb,\n`;
      sql += `  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),\n`;
      sql += `  lobby text\n`;
      sql += `);\n\n`;

      sql += `-- 2. Create the Custom Portfolios tracking table for multi-PC sharing\n`;
      sql += `CREATE TABLE IF NOT EXISTS gtd_custom_portfolios (\n`;
      sql += `  id text PRIMARY KEY,\n`;
      sql += `  name text NOT NULL,\n`;
      sql += `  portfolio_type text NOT NULL,\n`;
      sql += `  items jsonb DEFAULT '[]'::jsonb,\n`;
      sql += `  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())\n`;
      sql += `);\n\n`;

      sql += `-- 3. Create the Imported Accounts grouping and auth metadata table for multi-PC sharing\n`;
      sql += `CREATE TABLE IF NOT EXISTS gtd_imported_accounts (\n`;
      sql += `  username text PRIMARY KEY,\n`;
      sql += `  pass text DEFAULT '',\n`;
      sql += `  cookie text DEFAULT '',\n`;
      sql += `  pc_category_by_client text DEFAULT 'PC-UNKNOWN',\n`;
      sql += `  game text DEFAULT 'None',\n`;
      sql += `  status text DEFAULT 'unused',\n`;
      sql += `  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())\n`;
      sql += `);\n\n`;

      sql += `-- 4. Enable Row Level Security (RLS) policies for secure anonymous synchronization\n`;
      sql += `ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;\n`;
      sql += `ALTER TABLE gtd_custom_portfolios ENABLE ROW LEVEL SECURITY;\n`;
      sql += `ALTER TABLE gtd_imported_accounts ENABLE ROW LEVEL SECURITY;\n\n`;

      sql += `DROP POLICY IF EXISTS "Allow public read access on accounts" ON accounts;\n`;
      sql += `CREATE POLICY "Allow public read access on accounts" ON accounts FOR SELECT USING (true);\n`;
      sql += `DROP POLICY IF EXISTS "Allow public insert access on accounts" ON accounts;\n`;
      sql += `CREATE POLICY "Allow public insert access on accounts" ON accounts FOR INSERT WITH CHECK (true);\n`;
      sql += `DROP POLICY IF EXISTS "Allow public update access on accounts" ON accounts;\n`;
      sql += `CREATE POLICY "Allow public update access on accounts" ON accounts FOR UPDATE USING (true) WITH CHECK (true);\n`;
      sql += `DROP POLICY IF EXISTS "Allow public delete access on accounts" ON accounts;\n`;
      sql += `CREATE POLICY "Allow public delete access on accounts" ON accounts FOR DELETE USING (true);\n\n`;

      sql += `DROP POLICY IF EXISTS "Allow public access on portfolios" ON gtd_custom_portfolios;\n`;
      sql += `CREATE POLICY "Allow public access on portfolios" ON gtd_custom_portfolios FOR ALL USING (true) WITH CHECK (true);\n\n`;

      sql += `DROP POLICY IF EXISTS "Allow public access on imported accounts" ON gtd_imported_accounts;\n`;
      sql += `CREATE POLICY "Allow public access on imported accounts" ON gtd_imported_accounts FOR ALL USING (true) WITH CHECK (true);\n\n`;

      sql += `-- 5. Enable real-time replication dynamic events tracking\n`;
      sql += `ALTER TABLE accounts REPLICA IDENTITY FULL;\n`;
      sql += `ALTER TABLE gtd_custom_portfolios REPLICA IDENTITY FULL;\n`;
      sql += `ALTER TABLE gtd_imported_accounts REPLICA IDENTITY FULL;\n\n`;

      sql += `-- 6. Enable Sub-second Supabase Realtime for these tables to synchronise changes on other PCs instantly!\n`;
      sql += `-- This safe dynamic PL/pgSQL block handles publication setup and prevents "already exists / already member" errors\n`;
      sql += `DO $$\n`;
      sql += `BEGIN\n`;
      sql += `  -- Create publication if it doesn't exist\n`;
      sql += `  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN\n`;
      sql += `    CREATE PUBLICATION supabase_realtime;\n`;
      sql += `  END IF;\n\n`;
      sql += `  -- Add accounts table if not already added\n`;
      sql += `  IF NOT EXISTS (\n`;
      sql += `    SELECT 1 FROM pg_publication_rel pr \n`;
      sql += `    JOIN pg_publication p ON p.oid = pr.prpubid \n`;
      sql += `    JOIN pg_class c ON c.oid = pr.prrelid \n`;
      sql += `    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'accounts'\n`;
      sql += `  ) THEN\n`;
      sql += `    ALTER PUBLICATION supabase_realtime ADD TABLE accounts;\n`;
      sql += `  END IF;\n\n`;
      sql += `  -- Add gtd_custom_portfolios table if not already added\n`;
      sql += `  IF NOT EXISTS (\n`;
      sql += `    SELECT 1 FROM pg_publication_rel pr \n`;
      sql += `    JOIN pg_publication p ON p.oid = pr.prpubid \n`;
      sql += `    JOIN pg_class c ON c.oid = pr.prrelid \n`;
      sql += `    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'gtd_custom_portfolios'\n`;
      sql += `  ) THEN\n`;
      sql += `    ALTER PUBLICATION supabase_realtime ADD TABLE gtd_custom_portfolios;\n`;
      sql += `  END IF;\n\n`;
      sql += `  -- Add gtd_imported_accounts table if not already added\n`;
      sql += `  IF NOT EXISTS (\n`;
      sql += `    SELECT 1 FROM pg_publication_rel pr \n`;
      sql += `    JOIN pg_publication p ON p.oid = pr.prpubid \n`;
      sql += `    JOIN pg_class c ON c.oid = pr.prrelid \n`;
      sql += `    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'gtd_imported_accounts'\n`;
      sql += `  ) THEN\n`;
      sql += `    ALTER PUBLICATION supabase_realtime ADD TABLE gtd_imported_accounts;\n`;
      sql += `  END IF;\n\n`;
      sql += `END $$;\n\n`;
    } else if (dialect === 'postgres') {
      sql += `CREATE TABLE IF NOT EXISTS farm_accounts (\n`;
      sql += `  username VARCHAR(100) PRIMARY KEY,\n`;
      sql += `  pc VARCHAR(100),\n`;
      sql += `  gems INT DEFAULT 0,\n`;
      sql += `  seeds INT DEFAULT 0,\n`;
      sql += `  xp INT DEFAULT 0,\n`;
      sql += `  games_won INT DEFAULT 0,\n`;
      sql += `  wave INT DEFAULT 0,\n`;
      sql += `  updated_at VARCHAR(100)\n`;
      sql += `);\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS farm_inventory (\n`;
      sql += `  id SERIAL PRIMARY KEY,\n`;
      sql += `  account_username VARCHAR(100),\n`;
      sql += `  item_name VARCHAR(150),\n`;
      sql += `  quantity INT DEFAULT 0,\n`;
      sql += `  category VARCHAR(50),\n`;
      sql += `  rarity VARCHAR(50)\n`;
      sql += `);\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS custom_portfolios (\n`;
      sql += `  id VARCHAR(100) PRIMARY KEY,\n`;
      sql += `  name VARCHAR(150) NOT NULL,\n`;
      sql += `  portfolio_type VARCHAR(50) NOT NULL\n`;
      sql += `);\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS portfolio_items (\n`;
      sql += `  id VARCHAR(100) PRIMARY KEY,\n`;
      sql += `  portfolio_id VARCHAR(100),\n`;
      sql += `  item_name VARCHAR(150) NOT NULL,\n`;
      sql += `  item_id_code VARCHAR(100),\n`;
      sql += `  quantity INT DEFAULT 0,\n`;
      sql += `  category VARCHAR(50)\n`;
      sql += `);\n\n`;
    } else if (dialect === 'mysql') {
      sql += `CREATE TABLE IF NOT EXISTS farm_accounts (\n`;
      sql += `  username VARCHAR(100) PRIMARY KEY,\n`;
      sql += `  pc VARCHAR(100),\n`;
      sql += `  gems INT DEFAULT 0,\n`;
      sql += `  seeds INT DEFAULT 0,\n`;
      sql += `  xp INT DEFAULT 0,\n`;
      sql += `  games_won INT DEFAULT 0,\n`;
      sql += `  wave INT DEFAULT 0,\n`;
      sql += `  updated_at VARCHAR(100)\n`;
      sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS farm_inventory (\n`;
      sql += `  id INT AUTO_INCREMENT PRIMARY KEY,\n`;
      sql += `  account_username VARCHAR(100),\n`;
      sql += `  item_name VARCHAR(150),\n`;
      sql += `  quantity INT DEFAULT 0,\n`;
      sql += `  category VARCHAR(50),\n`;
      sql += `  rarity VARCHAR(50)\n`;
      sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS custom_portfolios (\n`;
      sql += `  id VARCHAR(100) PRIMARY KEY,\n`;
      sql += `  name VARCHAR(150) NOT NULL,\n`;
      sql += `  portfolio_type VARCHAR(50) NOT NULL\n`;
      sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS portfolio_items (\n`;
      sql += `  id VARCHAR(100) PRIMARY KEY,\n`;
      sql += `  portfolio_id VARCHAR(100),\n`;
      sql += `  item_name VARCHAR(150) NOT NULL,\n`;
      sql += `  item_id_code VARCHAR(100),\n`;
      sql += `  quantity INT DEFAULT 0,\n`;
      sql += `  category VARCHAR(50)\n`;
      sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;
    } else {
      // default: sqlite
      sql += `CREATE TABLE IF NOT EXISTS farm_accounts (\n`;
      sql += `  username TEXT PRIMARY KEY,\n`;
      sql += `  pc TEXT,\n`;
      sql += `  gems INTEGER DEFAULT 0,\n`;
      sql += `  seeds INTEGER DEFAULT 0,\n`;
      sql += `  xp INTEGER DEFAULT 0,\n`;
      sql += `  games_won INTEGER DEFAULT 0,\n`;
      sql += `  wave INTEGER DEFAULT 0,\n`;
      sql += `  updated_at TEXT\n`;
      sql += `);\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS farm_inventory (\n`;
      sql += `  id INTEGER PRIMARY KEY AUTOINCREMENT,\n`;
      sql += `  account_username TEXT,\n`;
      sql += `  item_name TEXT,\n`;
      sql += `  quantity INTEGER DEFAULT 0,\n`;
      sql += `  category TEXT,\n`;
      sql += `  rarity TEXT\n`;
      sql += `);\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS custom_portfolios (\n`;
      sql += `  id TEXT PRIMARY KEY,\n`;
      sql += `  name TEXT,\n`;
      sql += `  portfolio_type TEXT\n`;
      sql += `);\n\n`;

      sql += `CREATE TABLE IF NOT EXISTS portfolio_items (\n`;
      sql += `  id TEXT PRIMARY KEY,\n`;
      sql += `  portfolio_id TEXT,\n`;
      sql += `  item_name TEXT,\n`;
      sql += `  item_id_code TEXT,\n`;
      sql += `  quantity INTEGER DEFAULT 0,\n`;
      sql += `  category TEXT\n`;
      sql += `);\n\n`;
    }

    const escapeVal = (v: any) => {
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return v;
      return "'" + String(v).replace(/'/g, "''") + "'";
    };

    // 2. Insert rows for farm accounts
    sql += `-- ==================================================\n`;
    sql += `-- SEED ROWS: farm_accounts / accounts\n`;
    sql += `-- ==================================================\n`;
    accounts.forEach(acc => {
      if (dialect === 'supabase') {
        const invStr = JSON.stringify(acc.inventory || []);
        const gpStr = JSON.stringify((acc as any).gamepasses || []);
        const isClaimed = (acc as any).prismleaf_claimed ? 'true' : 'false';
        const unitsVal = isNaN(Number(acc.units)) ? 0 : Number(acc.units);
        const statusVal = (acc as any).status || 'offline';
        const lobbyVal = (acc as any).lobby || '';

        sql += `INSERT INTO accounts (username, seeds, units, status, inventory, updated_at, lobby) VALUES (${escapeVal(acc.username)}, ${acc.seeds ?? 0}, ${unitsVal}, ${escapeVal(statusVal)}, ${escapeVal(invStr)}::jsonb, ${escapeVal(acc.updated_at)}::timestamptz, ${escapeVal(lobbyVal)}) ON CONFLICT (username) DO UPDATE SET seeds=EXCLUDED.seeds, units=EXCLUDED.units, status=EXCLUDED.status, inventory=EXCLUDED.inventory, updated_at=EXCLUDED.updated_at, lobby=EXCLUDED.lobby;\n`;
      } else if (dialect === 'mysql') {
        sql += `INSERT INTO farm_accounts (username, seeds, updated_at) VALUES (${escapeVal(acc.username)}, ${acc.seeds ?? 0}, ${escapeVal(acc.updated_at)}) ON DUPLICATE KEY UPDATE seeds=${acc.seeds ?? 0}, updated_at=${escapeVal(acc.updated_at)};\n`;
      } else if (dialect === 'postgres') {
        sql += `INSERT INTO farm_accounts (username, seeds, updated_at) VALUES (${escapeVal(acc.username)}, ${acc.seeds ?? 0}, ${escapeVal(acc.updated_at)}) ON CONFLICT (username) DO UPDATE SET seeds=EXCLUDED.seeds, updated_at=EXCLUDED.updated_at;\n`;
      } else {
        sql += `INSERT OR REPLACE INTO farm_accounts (username, seeds, updated_at) VALUES (${escapeVal(acc.username)}, ${acc.seeds ?? 0}, ${escapeVal(acc.updated_at)});\n`;
      }
    });

    // 3. Insert rows for farm items inventory (skip if using Supabase, as it's nested inside accounts JSONB)
    if (dialect !== 'supabase') {
      sql += `\n-- ==================================================\n`;
      sql += `-- SEED ROWS: farm_inventory\n`;
      sql += `-- ==================================================\n`;
      accounts.forEach(acc => {
        if (acc.inventory && Array.isArray(acc.inventory)) {
          acc.inventory.forEach(item => {
            sql += `INSERT INTO farm_inventory (account_username, item_name, quantity, category, rarity) VALUES (${escapeVal(acc.username)}, ${escapeVal(item.name)}, ${item.quantity ?? 0}, ${escapeVal(item.category)}, ${escapeVal(item.rarity)});\n`;
          });
        }
      });
    }

    // 4. Insert rows for custom portfolios
    if (dialect === 'supabase') {
      sql += `\n-- ==================================================\n`;
      sql += `-- SEED ROWS: gtd_custom_portfolios\n`;
      sql += `-- ==================================================\n`;
      tradingAccounts.forEach(acc => {
        const jsonStr = JSON.stringify(acc.items || []);
        sql += `INSERT INTO gtd_custom_portfolios (id, name, portfolio_type, items, updated_at) VALUES (${escapeVal(acc.id)}, ${escapeVal(acc.name)}, ${escapeVal(acc.type)}, ${escapeVal(jsonStr)}::jsonb, timezone('utc'::text, now())) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, portfolio_type=EXCLUDED.portfolio_type, items=EXCLUDED.items, updated_at=EXCLUDED.updated_at;\n`;
      });

      sql += `\n-- ==================================================\n`;
      sql += `-- SEED ROWS: gtd_imported_accounts\n`;
      sql += `-- ==================================================\n`;
      importedAccounts.forEach(acc => {
        sql += `INSERT INTO gtd_imported_accounts (username, pass, cookie, pc_category_by_client, game, status, created_at) VALUES (${escapeVal(acc.username)}, ${escapeVal(acc.pass || '')}, ${escapeVal(acc.cookie || '')}, ${escapeVal(acc.pcCategoryByClient || 'PC-UNKNOWN')}, ${escapeVal(acc.game || 'None')}, ${escapeVal(acc.status || 'unused')}, ${escapeVal(acc.createdAt || new Date().toISOString())}::timestamptz) ON CONFLICT (username) DO UPDATE SET pass=EXCLUDED.pass, cookie=EXCLUDED.cookie, pc_category_by_client=EXCLUDED.pc_category_by_client, game=EXCLUDED.game, status=EXCLUDED.status;\n`;
      });
    } else {
      sql += `\n-- ==================================================\n`;
      sql += `-- SEED ROWS: custom_portfolios\n`;
      sql += `-- ==================================================\n`;
      tradingAccounts.forEach(acc => {
        if (dialect === 'mysql') {
          sql += `INSERT INTO custom_portfolios (id, name, portfolio_type) VALUES (${escapeVal(acc.id)}, ${escapeVal(acc.name)}, ${escapeVal(acc.type)}) ON DUPLICATE KEY UPDATE name=${escapeVal(acc.name)}, portfolio_type=${escapeVal(acc.type)};\n`;
        } else if (dialect === 'postgres') {
          sql += `INSERT INTO custom_portfolios (id, name, portfolio_type) VALUES (${escapeVal(acc.id)}, ${escapeVal(acc.name)}, ${escapeVal(acc.type)}) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, portfolio_type=EXCLUDED.portfolio_type;\n`;
        } else {
          sql += `INSERT OR REPLACE INTO custom_portfolios (id, name, portfolio_type) VALUES (${escapeVal(acc.id)}, ${escapeVal(acc.name)}, ${escapeVal(acc.type)});\n`;
        }
      });

      // 5. Insert rows for portfolio manual item quantities
      sql += `\n-- ==================================================\n`;
      sql += `-- SEED ROWS: portfolio_items\n`;
      sql += `-- ==================================================\n`;
      tradingAccounts.forEach(acc => {
        if (acc.items && Array.isArray(acc.items)) {
          acc.items.forEach(item => {
            if (dialect === 'mysql') {
              sql += `INSERT INTO portfolio_items (id, portfolio_id, item_name, item_id_code, quantity, category) VALUES (${escapeVal(item.id)}, ${escapeVal(acc.id)}, ${escapeVal(item.unitName)}, ${escapeVal(item.unitId)}, ${item.quantity ?? 0}, ${escapeVal(item.category)}) ON DUPLICATE KEY UPDATE quantity=${item.quantity ?? 0};\n`;
            } else if (dialect === 'postgres') {
              sql += `INSERT INTO portfolio_items (id, portfolio_id, item_name, item_id_code, quantity, category) VALUES (${escapeVal(item.id)}, ${escapeVal(acc.id)}, ${escapeVal(item.unitName)}, ${escapeVal(item.unitId)}, ${item.quantity ?? 0}, ${escapeVal(item.category)}) ON CONFLICT (id) DO UPDATE SET quantity=EXCLUDED.quantity;\n`;
            } else {
              sql += `INSERT OR REPLACE INTO portfolio_items (id, portfolio_id, item_name, item_id_code, quantity, category) VALUES (${escapeVal(item.id)}, ${escapeVal(acc.id)}, ${escapeVal(item.unitName)}, ${escapeVal(item.unitId)}, ${item.quantity ?? 0}, ${escapeVal(item.category)});\n`;
            }
          });
        }
      });
    }

    return sql;
  };

  // Generate a beautiful copy-paste single file portable HTML app containing their live snapshot data
  const generateOfflineHtmlBackup = () => {
    const backupJsonStr = JSON.stringify({
      generatedAt: new Date().toISOString(),
      accounts: accounts,
      tradingAccounts: tradingAccounts
    }, null, 2);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GTD Storage & Farm - Standalone Multi-PC Dashboard</title>
  <!-- Tailwind CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Google fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet" />
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0c0c0e;
      color: #e4e4e7;
    }
    .custom-scroll::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .custom-scroll::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    .custom-scroll::-webkit-scrollbar-thumb {
      background: #27272a;
      border-radius: 4px;
    }
    .custom-scroll::-webkit-scrollbar-thumb:hover {
      background: #3f3f46;
    }
  </style>
</head>
<body class="min-h-screen flex flex-col pb-16 selection:bg-indigo-500/30 selection:text-white">
  
  <div class="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 mt-8">
    
    <!-- Top Brand Header Banner -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-805/85 pb-6">
      <div class="text-left">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-indigo-600/20">
            🚜
          </div>
          <div>
            <h1 class="text-xl font-black text-white tracking-tight flex items-center gap-2">
              GTD Live Storage Database <span class="text-[9px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-black">Offline Finder</span>
            </h1>
            <p class="text-xs text-zinc-400 mt-1 font-mono">
              Database Sync Snapshot: <span id="sync-time" class="text-indigo-400 font-bold"></span>
            </p>
          </div>
        </div>
      </div>

      <!-- Quick snapshot stats -->
      <div class="flex items-center gap-3 bg-zinc-900/30 border border-zinc-850 p-3 rounded-2xl">
        <div class="text-center px-4 border-r border-zinc-850">
          <span class="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Accounts Tracked</span>
          <span id="stat-accs" class="text-base font-black text-indigo-400 font-mono">0</span>
        </div>
        <div class="text-center px-4 border-r border-zinc-850">
          <span class="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Portfolio Ledgers</span>
          <span id="stat-ledgers" class="text-base font-black text-emerald-400 font-mono">0</span>
        </div>
        <div class="text-center px-4">
          <span class="text-[9px] text-zinc-500 uppercase tracking-widest font-black block">Total Unique items</span>
          <span id="stat-items" class="text-base font-black text-amber-500 font-mono">0</span>
        </div>
      </div>
    </div>

    <!-- Active interactive filters -->
    <div class="bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-5 mt-6 grid grid-cols-1 md:grid-cols-12 gap-4">
      <div class="md:col-span-5 flex flex-col gap-1.5 text-left">
        <label class="text-[9.5px] uppercase tracking-widest font-bold text-zinc-400 font-mono">🔍 Name Search Filter</label>
        <input 
          type="text" 
          id="searchBox" 
          placeholder="Filter by unit name (e.g. Gem, Seeds, Ruby)..." 
          class="w-full bg-zinc-950/80 border border-zinc-800 hover:border-zinc-750 focus:border-indigo-650 rounded-xl px-3.5 py-1.8 text-xs text-white placeholder-zinc-650 tracking-wide focus:outline-none transition font-semibold"
        />
      </div>

      <div class="md:col-span-4 flex flex-col gap-1.5 text-left">
        <label class="text-[9.5px] uppercase tracking-widest font-bold text-zinc-400 font-mono">🌾 Origin Categorization</label>
        <select 
          id="filterSource"
          class="w-full bg-zinc-950/80 border border-zinc-800 focus:border-indigo-650 rounded-xl px-3 py-1.8 text-xs text-white focus:outline-none transition font-bold cursor-pointer"
        >
          <option value="all">Combined All Stock (Farm + Private Inventories)</option>
          <option value="farm">🚜 Farm Accounts Storage Only</option>
          <option value="trade">🤝 Trade Ledgers Only</option>
          <option value="selling">💰 Selling Logs Only</option>
        </select>
      </div>

      <div class="md:col-span-3 flex items-end">
        <button 
          id="btnClear"
          class="w-full bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
        >
          Reset Filters
        </button>
      </div>
    </div>

    <!-- Two columns lookup layout -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start">
      
      <!-- List index (Left 5 columns) -->
      <div class="lg:col-span-5 bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-5 flex flex-col gap-4 text-left">
        <div class="flex items-center justify-between border-b border-zinc-850 pb-3">
          <h2 class="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
            <span>🗃️</span> Storage Catalog Registry
          </h2>
          <span id="filtered-items-indicator" class="text-[10px] font-mono font-black text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 rounded">
            0 items
          </span>
        </div>

        <div id="catalog-list" class="space-y-2 max-h-[550px] overflow-y-auto pr-1 custom-scroll">
          <!-- Unique aggregated items output here -->
        </div>
      </div>

      <!-- Live split detail viewer (Right 7 columns) -->
      <div class="lg:col-span-7 bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-5 min-h-[480px] flex flex-col">
        <div class="flex items-center justify-between border-b border-zinc-850 pb-3 mb-4 text-left">
          <h2 id="detail-header" class="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
            <span>🛡️</span> Ownership Map
          </h2>
          <span id="detail-total" class="text-[10.5px] font-mono text-zinc-400">Select an item to view locations</span>
        </div>

        <div id="detail-body" class="flex-1 flex flex-col justify-center">
          <div class="text-center py-16 text-zinc-550">
            <span class="text-4xl block mb-3 opacity-60">🔎</span>
            <p class="text-xs font-extrabold uppercase tracking-widest font-mono text-zinc-400">Inventory Index Explorer</p>
            <p class="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto leading-relaxed">
              Click any item in the left catalog box! It will instantly list every single bot account or storage container that holds it on any PC.
            </p>
          </div>
        </div>
      </div>

    </div>

  </div>

  <script>
    // Injected client data
    const DATA = ${backupJsonStr};

    // Build overall summary counts
    document.getElementById('sync-time').textContent = new Date(DATA.generatedAt).toLocaleString();
    document.getElementById('stat-accs').textContent = DATA.accounts.length;
    document.getElementById('stat-ledgers').textContent = DATA.tradingAccounts.length;

    // Track state
    let activeItemName = null;

    // Calculate total unique item names
    const getOverallUniqueCount = () => {
      const s = new Set();
      DATA.accounts.forEach(a => {
        if(a.inventory) a.inventory.forEach(i => s.add(i.name));
      });
      DATA.tradingAccounts.forEach(ta => {
        if(ta.items) ta.items.forEach(i => s.add(i.unitName));
      });
      return s.size;
    };
    document.getElementById('stat-items').textContent = getOverallUniqueCount();

    // Dom elements
    const searchBox = document.getElementById('searchBox');
    const filterSource = document.getElementById('filterSource');
    const btnClear = document.getElementById('btnClear');
    const catalogList = document.getElementById('catalog-list');
    const detailHeader = document.getElementById('detail-header');
    const detailTotal = document.getElementById('detail-total');
    const detailBody = document.getElementById('detail-body');

    // Aggregate, search, render
    function renderCatalog() {
      const q = searchBox.value.toLowerCase().trim();
      const source = filterSource.value;

      // itemsMap structure: { [itemName]: { name, totalQty, rarity, holders: [ { holderName, type, details, qty } ] } }
      const itemsMap = {};

      // Parse farm accounts stock
      if (source === 'all' || source === 'farm') {
        DATA.accounts.forEach(acc => {
          if (acc.inventory && Array.isArray(acc.inventory)) {
            acc.inventory.forEach(i => {
              if (q && !i.name.toLowerCase().includes(q)) return;

              if (!itemsMap[i.name]) {
                itemsMap[i.name] = { name: i.name, totalQty: 0, rarity: i.rarity || 'common', holders: [] };
              }
              itemsMap[i.name].totalQty += (i.quantity || 0);
              itemsMap[i.name].holders.push({
                holderName: acc.username,
                type: 'farm',
                details: 'No PC',
                qty: i.quantity
              });
            });
          }
        });
      }

      // Parse custom ledgers
      if (source === 'all' || source === 'trade' || source === 'selling') {
        DATA.tradingAccounts.forEach(acc => {
          if (acc.items && Array.isArray(acc.items)) {
            acc.items.forEach(i => {
              const matchedType = 
                (source === 'all') ||
                (source === 'trade' && i.category === 'Trading') ||
                (source === 'selling' && i.category === 'Selling');
              
              if (!matchedType) return;
              if (q && !i.unitName.toLowerCase().includes(q)) return;

              if (!itemsMap[i.unitName]) {
                itemsMap[i.unitName] = { name: i.unitName, totalQty: 0, rarity: 'common', holders: [] };
              }
              itemsMap[i.unitName].totalQty += (i.quantity || 0);
              itemsMap[i.unitName].holders.push({
                holderName: acc.name,
                type: i.category === 'Trading' ? 'trade' : 'selling',
                details: acc.type,
                qty: i.quantity
              });
            });
          }
        });
      }

      const sortedItems = Object.values(itemsMap).sort((a, b) => b.totalQty - a.totalQty);
      document.getElementById('filtered-items-indicator').textContent = sortedItems.length + ' item types';

      catalogList.innerHTML = '';
      if (sortedItems.length === 0) {
        catalogList.innerHTML = \`
          <div class="py-12 text-center text-zinc-555 border border-dashed border-zinc-800 rounded-xl font-bold text-xs">
            No matching inventory logs found
          </div>
        \`;
        return;
      }

      const rarityColors = {
        common: 'border-zinc-900 text-zinc-400 bg-zinc-955/30',
        uncommon: 'border-emerald-950/40 text-emerald-400 bg-emerald-955/5',
        rare: 'border-blue-955/40 text-blue-400 bg-blue-955/5',
        epic: 'border-purple-955/40 text-purple-400 bg-purple-955/5',
        legendary: 'border-amber-955/40 text-amber-400 bg-amber-955/5'
      };

      sortedItems.forEach(item => {
        const isSelected = activeItemName === item.name;
        const colorClass = rarityColors[item.rarity] || rarityColors.common;

        const el = document.createElement('div');
        el.className = \`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all duration-150 \${
          isSelected 
            ? 'border-indigo-500 bg-indigo-950/25 font-extrabold text-white scale-[1.01]' 
            : colorClass + ' hover:border-zinc-700 hover:text-white'
        }\`;

        el.onclick = () => {
          activeItemName = item.name;
          renderCatalog(); // re-highlight
          renderDetail(item);
        };

        el.innerHTML = \`
          <div class="text-left min-w-0 pr-1">
            <span class="text-xs font-bold block truncate">\${item.name}</span>
            <span class="text-[8px] tracking-wider uppercase font-mono font-black opacity-60">\${item.rarity}</span>
          </div>
          <div class="text-right font-mono font-black shrink-0 text-xs">
            x\${item.totalQty.toLocaleString()}
          </div>
        \`;
        catalogList.appendChild(el);
      });
    }

    function renderDetail(item) {
      detailHeader.innerHTML = \`<span>🛡️</span> Ownership Locations: <span class="text-indigo-400">\${item.name}</span>\`;
      detailTotal.innerHTML = \`Total quantity: <span class="text-white font-extrabold font-mono text-xs">x\${item.totalQty.toLocaleString()}</span>\`;

      const sortedHolders = item.holders.sort((a, b) => b.qty - a.qty);
      let listHtml = '<div class="space-y-2 max-h-[480px] overflow-y-auto pr-1 custom-scroll">';

      sortedHolders.forEach((holder, index) => {
        const badge = 
          holder.type === 'farm' ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-mono font-black uppercase bg-indigo-950/50 text-indigo-400 border border-indigo-900/30">Farm Account</span>' :
          holder.type === 'trade' ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-mono font-black uppercase bg-violet-950/50 text-violet-400 border border-violet-900/30">Trade Registry</span>' :
          '<span class="px-1.5 py-0.5 rounded text-[8px] font-mono font-black uppercase bg-emerald-950/50 text-emerald-400 border border-emerald-900/30">Selling Ledger</span>';

        // PC machine or purpose
        const platformLabel = holder.type === 'farm' ? 'PC Machine: ' + holder.details.toUpperCase() : 'Custom logbook: ' + holder.details;

        listHtml += \`
          <div class="p-3.5 bg-zinc-950 border border-zinc-900 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-left hover:border-zinc-800 transition">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 bg-zinc-900 border border-zinc-850 rounded-lg text-zinc-550 font-mono text-[10px] font-bold flex items-center justify-center">
                #\${index + 1}
              </div>
              <div>
                <span class="text-xs font-bold text-white block">\${holder.holderName}</span>
                <span class="text-[9px] uppercase tracking-wide text-zinc-550 font-mono block mt-0.5">\${platformLabel}</span>
              </div>
            </div>

            <div class="flex items-center gap-3 shrink-0 justify-between sm:justify-end border-t sm:border-0 border-zinc-900 pt-2 sm:pt-0">
              \${badge}
              <span class="text-xs font-mono font-black text-indigo-400 shrink-0">
                x\${holder.qty.toLocaleString()} units
              </span>
            </div>
          </div>
        \`;
      });

      listHtml += '</div>';
      detailBody.innerHTML = listHtml;
    }

    // Attach listeners
    searchBox.oninput = renderCatalog;
    filterSource.onchange = renderCatalog;
    btnClear.onclick = () => {
      searchBox.value = '';
      filterSource.value = 'all';
      activeItemName = null;
      renderCatalog();
      detailHeader.innerHTML = \`<span>🛡️</span> Ownership Map\`;
      detailTotal.textContent = 'Select an item to view locations';
      detailBody.innerHTML = \`
        <div class="text-center py-16 text-zinc-550">
          <span class="text-4xl block mb-3 opacity-60">🔎</span>
          <p class="text-xs font-extrabold uppercase tracking-widest font-mono text-zinc-400">Inventory Index Explorer</p>
          <p class="text-[11px] text-zinc-555 mt-1 max-w-sm mx-auto leading-relaxed">
            Click any item in the left catalog box! It will instantly list every single bot account or storage container that holds it on any PC.
          </p>
        </div>
      \`;
    };

    // Run first rendering
    renderCatalog();
  </script>
</body>
</html>`;
  };

  // Filter units database based on search input for addition
  const searchedGTDUnits = useMemo(() => {
    const q = manualUnitSearch.trim().toLowerCase();
    const byRarity = depositRarityFilter.length > 0
      ? gtdUnitsList.filter(u => depositRarityFilter.includes(u.Rarity || 'ra_common'))
      : gtdUnitsList;
    if (!q) return depositRarityFilter.length > 0 ? byRarity.slice(0, 60) : [];
    return byRarity.filter(u =>
      u.Name.toLowerCase().includes(q) || u.ID.toLowerCase().includes(q)
    ).slice(0, 40);
  }, [manualUnitSearch, depositRarityFilter]);

  // Storage holder multi-select and right-click context menu states
  const [selectedHolderIndexes, setSelectedHolderIndexes] = useState<number[]>([]);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ show: boolean; x: number; y: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Credentials mapping state & modal state
  const [credentialsMap, setCredentialsMap] = useState<Record<string, { pass: string; cookie: string }>>({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // -- NEW ACCOUNTS TAB MANAGEMENT STATES --
  const [importedAccounts, setImportedAccounts] = useState<ImportedAccount[]>([]);
  const [statusCategories, setStatusCategories] = useState<string[]>(['unused', 'banned']);

  // -- FARMSYNC API SYNC --
  const [farmsyncToken, setFarmsyncToken] = useState<string>(() => {
    try { return localStorage.getItem('gtd_farmsync_token') || '5af9cbb1e6f19bd52d720ceba7c3549d4193c13e96ac476bd2c4c49ef214ec0c'; } catch { return ''; }
  });
  const [farmsyncSyncing, setFarmsyncSyncing] = useState(false);
  const [farmsyncStatus, setFarmsyncStatus] = useState<string | null>(null);

  const [accountsImportText, setAccountsImportText] = useState('');
  const [importAssignPc, setImportAssignPc] = useState('');
  const [importAssignGame, setImportAssignGame] = useState('');
  const [importAssignStatus, setImportAssignStatus] = useState('unused');

  const [editingPcForUser, setEditingPcForUser] = useState<string | null>(null);
  const [editPcValue, setEditPcValue] = useState('');
  const [editingGameForUser, setEditingGameForUser] = useState<string | null>(null);
  const [editGameValue, setEditGameValue] = useState('');

  const [newCustomCategoryInput, setNewCustomCategoryInput] = useState('');
  const [selectedAccountUsernames, setSelectedAccountUsernames] = useState<string[]>([]);
  const [lastClickedAccountUser, setLastClickedAccountUser] = useState<string | null>(null);

  const [accountStatusFilter, setAccountStatusFilter] = useState<string>('all');
  const [accountPcFilter, setAccountPcFilter] = useState<string>('all');
  const [accountGameFilter, setAccountGameFilter] = useState<string>('all');
  const [accountSearch, setAccountSearch] = useState<string>('');

   // Load imported accounts & list categories from local storage on mount
  useEffect(() => {
    try {
      const savedGames = localStorage.getItem('dashboard_configured_games');
      if (savedGames) {
        setGames(JSON.parse(savedGames));
      } else {
        const defaultGamesList: GameConfig[] = [
          {
            name: 'PETS GO',
            isActive: true,
            trackedColumns: {
              account: true,
              game: true,
              map: true,
              seeds: true,
              storage: true,
              lobby: false,
              updated: true
            },
            createdAt: new Date().toISOString()
          },
          {
            name: 'Adopt Me',
            isActive: true,
            trackedColumns: {
              account: true,
              game: true,
              map: true,
              seeds: false,
              storage: true,
              lobby: false,
              updated: true
            },
            createdAt: new Date().toISOString()
          },
          {
            name: 'Blox Fruits',
            isActive: true,
            trackedColumns: {
              account: true,
              game: true,
              map: true,
              seeds: false,
              storage: false,
              lobby: false,
              updated: true
            },
            createdAt: new Date().toISOString()
          }
        ];
        setGames(defaultGamesList);
        localStorage.setItem('dashboard_configured_games', JSON.stringify(defaultGamesList));
      }
    } catch (e) {
      console.error('Failed to parse configured games list', e);
    }

    try {
      const savedAccs = localStorage.getItem('accounts_imported_collection');
      if (savedAccs) {
        setImportedAccounts(JSON.parse(savedAccs));
      } else {
        // Fallback: migrate from the old credentialsMap if present
        const savedCreds = localStorage.getItem('accounts_credentials_map');
        if (savedCreds) {
          const creds = JSON.parse(savedCreds);
          const legacyList: ImportedAccount[] = Object.entries(creds).map(([user, data]: [string, any]) => ({
            username: user,
            pass: data.pass || '',
            cookie: data.cookie || '',
            pcCategoryByClient: 'PC-UNKNOWN',
            game: 'None',
            status: 'unused',
            createdAt: new Date().toISOString()
          }));
          setImportedAccounts(legacyList);
          localStorage.setItem('accounts_imported_collection', JSON.stringify(legacyList));
        }
      }
    } catch (e) {
      console.error('Failed to parse imported accounts', e);
    }

    try {
      const savedCategories = localStorage.getItem('custom_status_categories');
      if (savedCategories) {
        setStatusCategories(JSON.parse(savedCategories));
      }
    } catch (e) {
      console.error('Failed to parse custom categories', e);
    }
  }, []);

  const saveGamesList = (updatedGames: GameConfig[]) => {
    setGames(updatedGames);
    try {
      localStorage.setItem('dashboard_configured_games', JSON.stringify(updatedGames));
    } catch (e) {
      console.error('Failed to save configured games list', e);
    }
  };

  const visibleColumns = useMemo(() => {
    if (selectedGameFilter !== 'all') {
      const matchedGame = games.find(g => g.name.toLowerCase() === selectedGameFilter.toLowerCase());
      if (matchedGame) {
        return matchedGame.trackedColumns;
      }
    }
    // Default columns
    return {
      account: true,
      game: true,
      map: true,
      seeds: true,
      storage: true,
      lobby: false,
      updated: true
    };
  }, [selectedGameFilter, games]);

  const syncImportedAccountsToSupabase = async (accountsList: ImportedAccount[]) => {
    try {
      for (const acc of accountsList) {
        await supabase
          .from('gtd_imported_accounts')
          .upsert({
            username: acc.username,
            pass: acc.pass || '',
            cookie: acc.cookie || '',
            pc_category_by_client: acc.pcCategoryByClient || 'PC-UNKNOWN',
            game: acc.game || 'None',
            status: acc.status || 'unused',
            created_at: acc.createdAt || new Date().toISOString()
          });
      }
    } catch (err) {
      // Fail silently to local storage fallback
    }
  };

  const saveImportedAccounts = (updated: ImportedAccount[]) => {
    // Detect deleted imported metadata accounts
    const deletedUsernames = importedAccounts
      .filter(oldAcc => !updated.some(newAcc => newAcc.username === oldAcc.username))
      .map(oldAcc => oldAcc.username);

    setImportedAccounts(updated);
    try {
      localStorage.setItem('accounts_imported_collection', JSON.stringify(updated));
      
      // Keep credentialsMap automatically synchronized!
      const newCredsMap: Record<string, { pass: string; cookie: string }> = {};
      updated.forEach(acc => {
        newCredsMap[acc.username.toLowerCase()] = {
          pass: acc.pass || '',
          cookie: acc.cookie || ''
        };
      });
      setCredentialsMap(newCredsMap);
      localStorage.setItem('accounts_credentials_map', JSON.stringify(newCredsMap));
    } catch (e) {
      console.error('Failed to save imported accounts', e);
    }

    // Remote deletes
    if (deletedUsernames.length > 0) {
      try {
        supabase
          .from('gtd_imported_accounts')
          .delete()
          .in('username', deletedUsernames)
          .then(() => {});
      } catch (err) {}
    }

    // Remote updates sync
    syncImportedAccountsToSupabase(updated);
  };

  const saveStatusCategories = (updatedCategories: string[]) => {
    setStatusCategories(updatedCategories);
    try {
      localStorage.setItem('custom_status_categories', JSON.stringify(updatedCategories));
    } catch (e) {
      console.error('Failed to save categories', e);
    }
  };

  // Memoized filter calculation for the Accounts Tab list
  const filteredImportedAccounts = useMemo(() => {
    return importedAccounts.filter(ia => {
      // 1. Status Filter
      if (accountStatusFilter !== 'all') {
        const itemStatus = ia.status || 'unused';
        if (itemStatus.toLowerCase() !== accountStatusFilter.toLowerCase()) {
          return false;
        }
      }

      // 2. PC Filter
      if (accountPcFilter !== 'all') {
        const itemPc = ia.pcCategoryByClient || 'PC-UNKNOWN';
        if (itemPc.toLowerCase() !== accountPcFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Game Filter
      if (accountGameFilter !== 'all') {
        const itemGame = ia.game || 'None';
        if (itemGame.toLowerCase() !== accountGameFilter.toLowerCase()) {
          return false;
        }
      }

      // 4. Search Query Filter
      if (accountSearch.trim()) {
        const term = accountSearch.toLowerCase().trim();
        const match = 
          ia.username.toLowerCase().includes(term) ||
          (ia.pcCategoryByClient || '').toLowerCase().includes(term) ||
          (ia.game || '').toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });
  }, [importedAccounts, accountStatusFilter, accountPcFilter, accountGameFilter, accountSearch]);

  // Keep old credentialsMap sync on load also for safety
  useEffect(() => {
    try {
      const saved = localStorage.getItem('accounts_credentials_map');
      if (saved) {
        setCredentialsMap(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load credentials', e);
    }
  }, []);

  // Utility to format accounts credentials mapping on request
  const getFormattedCredentials = (username: string): string => {
    if (!username) return '';
    const cred = credentialsMap[username.toLowerCase()];
    if (cred) {
      return `${username}:${cred.pass}:${cred.cookie}`;
    }
    return `${username}::`;
  };

  // Analytics of matched credentials with current database trackers
  const matchedAccountsCount = useMemo(() => {
    return accounts.filter(acc => acc.username && credentialsMap[acc.username.toLowerCase()]).length;
  }, [accounts, credentialsMap]);

  // Save imported user:pass:cookie entries
  const handleSaveCredentials = () => {
    if (!importText.trim()) return;
    const lines = importText.split('\n');
    const newMap = { ...credentialsMap };
    let importCount = 0;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const parts = trimmed.split(':');
      if (parts.length >= 1) {
        const user = parts[0].trim();
        if (!user) return;
        
        const pass = parts[1] ? parts[1].trim() : '';
        const cookie = parts.slice(2).join(':').trim();

        newMap[user.toLowerCase()] = { pass, cookie };
        importCount++;
      }
    });

    setCredentialsMap(newMap);
    try {
      localStorage.setItem('accounts_credentials_map', JSON.stringify(newMap));
    } catch (e) {
      console.error('Failed to save to local storage', e);
    }

    setToastMessage(`Loaded ${importCount} account credential rows successfully!`);
    setTimeout(() => setToastMessage(null), 3000);
    setIsImportModalOpen(false);
    setImportText('');
  };

  const handleClearCredentials = () => {
    setCredentialsMap({});
    try {
      localStorage.removeItem('accounts_credentials_map');
    } catch (e) {
      console.error('Failed to clear credentials', e);
    }
    setToastMessage('Cleared all stored credentials mappings.');
    setTimeout(() => setToastMessage(null), 2500);
    setShowConfirmClear(false);
  };

  // Clear holder selection when storage item changes or when tab changes
  useEffect(() => {
    setSelectedHolderIndexes([]);
    setLastClickedIndex(null);
    setContextMenu(null);
  }, [selectedStorageItemName, activeTab]);

  // Global click & contextmenu handler to close custom context menu on any outside click
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, []);

  // Save custom Supabase connection configurations and refresh client reference
  const handleConnectSupabase = (url: string, key: string) => {
    const trimmedUrl = url.trim();
    const trimmedKey = key.trim();
    if (!trimmedUrl || !trimmedKey) {
      setToastMessage("⚠️ Supabase URL and Anon Key cannot be empty!");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    try {
      localStorage.setItem('GTD_SUPABASE_URL', trimmedUrl);
      localStorage.setItem('GTD_SUPABASE_KEY', trimmedKey);
      
      // Update the active global instance dynamically
      supabase = createClient(trimmedUrl, trimmedKey);
      setSupabaseToken(prev => prev + 1);
      
      setToastMessage("⚡ Successfully reconfigured and connected to Supabase!");
      setTimeout(() => setToastMessage(null), 3000);
      
      // Load from newly reconfigured database forcing portfolios/metadata cloud sync
      loadData(true);
    } catch (e: any) {
      console.error(e);
      setToastMessage(`⚠️ Setup error: ${e.message || e}`);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleResetSupabase = () => {
    try {
      localStorage.removeItem('GTD_SUPABASE_URL');
      localStorage.removeItem('GTD_SUPABASE_KEY');
      setSupabaseSetupUrl(DEFAULT_SUPABASE_URL);
      setSupabaseSetupKey(DEFAULT_SUPABASE_KEY);
      
      supabase = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY);
      setSupabaseToken(prev => prev + 1);
      
      setToastMessage("🔄 Restored connection back to original default Supabase database!");
      setTimeout(() => setToastMessage(null), 3000);
      loadData(true);
    } catch (e: any) {
      setToastMessage(`⚠️ Reset error: ${e.message || e}`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Sync accounts from FarmSync API
  const syncFromFarmsync = async (token: string) => {
    if (!token.trim()) {
      setFarmsyncStatus('No token provided.');
      return;
    }
    setFarmsyncSyncing(true);
    setFarmsyncStatus(null);
    try {
      const authHeaders = { 'Authorization': `Bearer ${token.trim()}`, 'Content-Type': 'application/json' };

      const [devRes, accRes] = await Promise.all([
        fetch('/farmsync/api/devices', { headers: authHeaders }),
        fetch('/farmsync/api/self/accounts', { headers: authHeaders }),
      ]);

      if (!devRes.ok || !accRes.ok) {
        setFarmsyncStatus(`API error: devices ${devRes.status}, accounts ${accRes.status}`);
        return;
      }

      const devBody = await devRes.json();
      // Devices response is { value: [...], Count: N }
      const devices: any[] = Array.isArray(devBody) ? devBody : (devBody.value || []);
      const fsAccounts: any[] = await accRes.json();

      // Build device_id → label map; prefer device_note if set, else device_name
      const deviceMap = new Map<string, string>(
        devices.map((d: any) => [d.id, (d.device_note && d.device_note.trim()) ? d.device_note.trim() : (d.device_name || d.id)])
      );

      // Map FarmSync accounts → ImportedAccount
      const mapped: ImportedAccount[] = fsAccounts.map((a: any) => ({
        username: a.username,
        pass: a.password || '',
        cookie: a.cookie || '',
        pcCategoryByClient: a.device_id ? (deviceMap.get(a.device_id) || a.device_id) : '',
        game: a.tag || '',
        status: a.enabled ? 'active' : 'unused',
        createdAt: a.last_updated || new Date().toISOString(),
      }));

      // Merge with existing — FarmSync data wins on matching usernames
      setImportedAccounts(prev => {
        const merged = [...prev];
        mapped.forEach(incoming => {
          const idx = merged.findIndex(e => e.username.toLowerCase() === incoming.username.toLowerCase());
          if (idx > -1) merged[idx] = { ...merged[idx], ...incoming };
          else merged.push(incoming);
        });
        try { localStorage.setItem('accounts_imported_collection', JSON.stringify(merged)); } catch {}

        // Rebuild credentials map
        const newCredsMap: Record<string, { pass: string; cookie: string }> = {};
        merged.forEach(acc => {
          newCredsMap[acc.username.toLowerCase()] = { pass: acc.pass || '', cookie: acc.cookie || '' };
        });
        setCredentialsMap(newCredsMap);
        try { localStorage.setItem('accounts_credentials_map', JSON.stringify(newCredsMap)); } catch {}

        return merged;
      });

      setFarmsyncStatus(`Synced ${mapped.length} accounts across ${devices.length} devices.`);
    } catch (err: any) {
      setFarmsyncStatus(`Sync failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setFarmsyncSyncing(false);
    }
  };

  // Fetch accounts from Supabase database
  async function loadData(forceSyncConfig: boolean = false) {
    setIsRefreshing(true);
    let tablesMissing = false;
    let missingTableNames: string[] = [];

    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*');

      if (!error && data) {
        setAccounts(data as AccountData[]);
      } else if (error) {
        console.error('Supabase query error (accounts):', error);
        if (error.code === '42P01' || error.message?.includes('relation "accounts" does not exist')) {
          tablesMissing = true;
          missingTableNames.push('accounts');
        }
      }

      // Fetch and sync Custom Portfolios on every sync check to keep multiple PCs updated in real-time
      const { data: portData, error: portError } = await supabase
        .from('gtd_custom_portfolios')
        .select('id, name, portfolio_type, items');
      if (!portError && portData && portData.length > 0) {
        const formattedPortfolios = portData.map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.portfolio_type,
          items: d.items || []
        }));
        setTradingAccounts(formattedPortfolios);
        localStorage.setItem('gtd_trading_accounts_ledger', JSON.stringify(formattedPortfolios));
      } else if (portError) {
        if (portError.code === '42P01' || portError.message?.includes('relation "gtd_custom_portfolios" does not exist')) {
          tablesMissing = true;
          missingTableNames.push('gtd_custom_portfolios');
        }
      }

      // Fetch and sync Imported Accounts metadata on every sync check
      const { data: impData, error: impError } = await supabase
        .from('gtd_imported_accounts')
        .select('username, pass, cookie, pc_category_by_client, game, status, created_at');
      if (!impError && impData && impData.length > 0) {
        const formattedImported = impData.map((d: any) => ({
          username: d.username,
          pass: d.pass,
          cookie: d.cookie,
          pcCategoryByClient: d.pc_category_by_client,
          game: d.game,
          status: d.status,
          createdAt: d.created_at
        }));
        setImportedAccounts(formattedImported);
        localStorage.setItem('accounts_imported_collection', JSON.stringify(formattedImported));
        
        // Also sync credentials map
        const newCredsMap: Record<string, { pass: string; cookie: string }> = {};
        formattedImported.forEach((acc: any) => {
          newCredsMap[acc.username.toLowerCase()] = {
            pass: acc.pass || '',
            cookie: acc.cookie || ''
          };
        });
        setCredentialsMap(newCredsMap);
        localStorage.setItem('accounts_credentials_map', JSON.stringify(newCredsMap));
      } else if (impError) {
        if (impError.code === '42P01' || impError.message?.includes('relation "gtd_imported_accounts" does not exist')) {
          tablesMissing = true;
          missingTableNames.push('gtd_imported_accounts');
        }
      }

      if (tablesMissing) {
        setSchemaTablesMissing(true);
        setSchemaTablesStatusText(missingTableNames.join(', '));
      } else {
        setSchemaTablesMissing(false);
        setSchemaTablesStatusText(null);
      }
    } catch (err) {
      console.error('Connection error:', err);
    } finally {
      setIsRefreshing(false);
      setIsFirstLoad(false);
      setLastRefreshedAt(new Date());
    }
  }

  // Fallback poll every 30s — realtime handles live updates, this is just a safety net
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [supabaseToken]);

  // Real-time subscriptions — apply event payload directly to state (no full refetch)
  useEffect(() => {
    const fmtPortfolio = (d: any) => ({ id: d.id, name: d.name, type: d.portfolio_type, items: d.items || [] });
    const fmtImported = (d: any) => ({
      username: d.username, pass: d.pass, cookie: d.cookie,
      pcCategoryByClient: d.pc_category_by_client, game: d.game,
      status: d.status, createdAt: d.created_at
    });
    const syncCredentials = (list: any[]) => {
      const map: Record<string, { pass: string; cookie: string }> = {};
      list.forEach((a: any) => { map[a.username.toLowerCase()] = { pass: a.pass || '', cookie: a.cookie || '' }; });
      setCredentialsMap(map);
      localStorage.setItem('accounts_credentials_map', JSON.stringify(map));
    };

    const channel = supabase
      .channel('schema-db-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, ({ eventType, new: n, old: o }: any) => {
        setAccounts(prev => {
          if (eventType === 'INSERT') return [...prev, n as AccountData];
          if (eventType === 'UPDATE') return prev.map(a => a.username === n.username ? n as AccountData : a);
          if (eventType === 'DELETE') return prev.filter(a => a.username !== o.username);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gtd_custom_portfolios' }, ({ eventType, new: n, old: o }: any) => {
        setTradingAccounts(prev => {
          let updated: typeof prev;
          if (eventType === 'INSERT') updated = [...prev, fmtPortfolio(n)];
          else if (eventType === 'UPDATE') updated = prev.map(p => p.id === n.id ? fmtPortfolio(n) : p);
          else if (eventType === 'DELETE') updated = prev.filter(p => p.id !== o.id);
          else return prev;
          localStorage.setItem('gtd_trading_accounts_ledger', JSON.stringify(updated));
          return updated;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gtd_imported_accounts' }, ({ eventType, new: n, old: o }: any) => {
        setImportedAccounts(prev => {
          let updated: typeof prev;
          if (eventType === 'INSERT') updated = [...prev, fmtImported(n)];
          else if (eventType === 'UPDATE') updated = prev.map(a => a.username === n.username ? fmtImported(n) : a);
          else if (eventType === 'DELETE') updated = prev.filter(a => a.username !== o.username);
          else return prev;
          localStorage.setItem('accounts_imported_collection', JSON.stringify(updated));
          syncCredentials(updated);
          return updated;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabaseToken]);

  // Send UI active heartbeat state to public database to signal that UI is open
  useEffect(() => {
    async function sendHeartbeat() {
      try {
        const nowIso = new Date().toISOString();
        // Upsert standard heart-beat row inside public accounts table
        const { error } = await supabase
          .from('accounts')
          .upsert({
            username: '__UI_PRESENCE_HEARTBEAT__',
            seeds: 0,
            units: '0',
            updated_at: nowIso
          }, { onConflict: 'username' });

        if (error) {
          // Fallback to update if table doesn't support target onConflict upsert properly
          await supabase
            .from('accounts')
            .update({ updated_at: nowIso })
            .eq('username', '__UI_PRESENCE_HEARTBEAT__');
        }
      } catch (err) {
        console.warn('Silent presence update skipped:', err);
      }
    }

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000); // Pulse every 30s to show UI is active
    return () => clearInterval(interval);
  }, []);

  // Filter accounts based on Search Query & Online Status Toggle & Game Filter
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (acc.username === '__UI_PRESENCE_HEARTBEAT__') return false;

      // 1. Dashboard Game Filter Profile
      if (selectedGameFilter !== 'all') {
        const localMeta = importedAccounts.find(
          (ia) => ia.username.toLowerCase() === acc.username.toLowerCase()
        );
        const gameName = localMeta?.game || 'None';
        if (gameName.toLowerCase() !== selectedGameFilter.toLowerCase()) {
          return false;
        }
      }

      // 2. Search Query Filter
      const term = search.toLowerCase().trim();
      const matchSearch = !term ||
        (acc.username || '').toLowerCase().includes(term) ||
        (acc.units || '').toString().toLowerCase().includes(term);

      if (!matchSearch) return false;

      // Calculate if account was updated less than or equal to 60s ago (1 min)
      const diffSeconds = Math.floor((new Date().getTime() - new Date(acc.updated_at).getTime()) / 1000);
      const isOnline = diffSeconds <= 300;

      // 3. Status Filter
      if (statusFilter === 'online') return isOnline;
      if (statusFilter === 'offline') return !isOnline;
      return true;
    });
  }, [accounts, search, statusFilter, selectedGameFilter, importedAccounts]);

  // Group accounts automatically by PC Identifier
  const pcGroups = useMemo(() => {
    const groups: { [pcName: string]: AccountData[] } = {};
    filteredAccounts.forEach((acc) => {
      const local = importedAccounts.find(
        (ia) => ia.username.toLowerCase() === acc.username.toLowerCase()
      );
      const pcName = (local?.pcCategoryByClient || 'PC-UNKNOWN').toUpperCase().trim();
      if (!groups[pcName]) {
        groups[pcName] = [];
      }
      groups[pcName].push(acc);
    });
    return groups;
  }, [filteredAccounts, importedAccounts]);

  // Aggregate high level statistics for system summary
  const statistics = useMemo(() => {
    let onlineCount = 0;
    let totalSeeds = 0;
    const uniquePcs = new Set<string>();

    accounts.forEach((acc) => {
      const local = importedAccounts.find(
        (ia) => ia.username.toLowerCase() === acc.username.toLowerCase()
      );
      const pcName = (local?.pcCategoryByClient || 'PC-UNKNOWN').toUpperCase().trim();
      uniquePcs.add(pcName);

      const diffSeconds = Math.floor((new Date().getTime() - new Date(acc.updated_at).getTime()) / 1000);
      if (diffSeconds <= 300) {
        onlineCount++;
      }
      totalSeeds += Number(acc.seeds || 0);
    });

    return {
      totalAccounts: accounts.length,
      totalPcs: uniquePcs.size,
      onlineCount,
      offlineCount: accounts.length - onlineCount,
      totalSeeds,
    };
  }, [accounts, importedAccounts]);

  // Noon-reset seeds baseline: per-account snapshot taken at the start of each noon period
  useEffect(() => {
    if (accounts.length === 0) return;

    const now = new Date();
    const lastMidnight = new Date(now);
    lastMidnight.setHours(0, 0, 0, 0);

    try {
      const saved = localStorage.getItem('gtd_seeds_noon_snapshot');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.timestamp === 'number' && parsed.timestamp >= lastMidnight.getTime()) {
          // Snapshot is from the current noon period — merge in any new accounts
          const updated = { ...parsed.accounts } as Record<string, number>;
          let added = false;
          accounts.forEach((acc) => {
            if (!(acc.username in updated)) {
              updated[acc.username] = Number(acc.seeds || 0);
              added = true;
            }
          });
          if (added) {
            const newSnapshot = { accounts: updated, timestamp: parsed.timestamp };
            localStorage.setItem('gtd_seeds_noon_snapshot', JSON.stringify(newSnapshot));
          }
          setSeedsNoonBaseline(updated);
          setSeedsSnapshotTimestamp(parsed.timestamp);
          return;
        }
      }
      // No snapshot or snapshot is from a previous period — reset baseline
      const accountsMap: Record<string, number> = {};
      accounts.forEach((acc) => { accountsMap[acc.username] = Number(acc.seeds || 0); });
      const ts = Date.now();
      const newSnapshot = { accounts: accountsMap, timestamp: ts };
      localStorage.setItem('gtd_seeds_noon_snapshot', JSON.stringify(newSnapshot));
      setSeedsNoonBaseline(accountsMap);
      setSeedsSnapshotTimestamp(ts);
    } catch {}
  }, [accounts]);

  // Object with all aggregated items across accounts with custom rarity-weight calculation
  const aggregateStorage = useMemo(() => {
    const items: { 
      [itemName: string]: { 
        name: string;
        rawName?: string;
        rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
        icon?: string;
        accounts: { username: string; pc: string; quantity: number; updated_at: string }[];
        totalQuantity: number;
      } 
    } = {};

    accounts.forEach((acc) => {
      if (acc.inventory && Array.isArray(acc.inventory)) {
        acc.inventory.forEach((item) => {
          if (!item || !item.name) return;
          const nameTrimmed = formatItemName(item.name, item.displayName);
          
          if (!items[nameTrimmed]) {
            let rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' = item.rarity || 'common';
            const nameLower = nameTrimmed.toLowerCase();
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

            let icon = '📦';
            if (nameLower.includes('seed') || nameLower.includes('sprout') || nameLower.includes('flower') || nameLower.includes('plant')) {
              icon = '🌱';
            } else if (nameLower.includes('gem') || nameLower.includes('diamond') || nameLower.includes('ruby') || nameLower.includes('crystal') || nameLower.includes('emerald')) {
              icon = '💎';
            } else if (nameLower.includes('sword') || nameLower.includes('bow') || nameLower.includes('armor') || nameLower.includes('shield') || nameLower.includes('ring') || nameLower.includes('helmet') || nameLower.includes('boots')) {
              icon = '⚔️';
            } else if (nameLower.includes('potion') || nameLower.includes('elixir') || nameLower.includes('scroll') || nameLower.includes('book') || nameLower.includes('food')) {
              icon = '🧪';
            }

            items[nameTrimmed] = {
              name: nameTrimmed,
              rawName: item.name,
              rarity,
              icon,
              accounts: [],
              totalQuantity: 0,
            };
          }

          const localIa = importedAccounts.find(ia => ia.username.toLowerCase() === acc.username.toLowerCase());
          items[nameTrimmed].accounts.push({
            username: acc.username,
            pc: localIa?.pcCategoryByClient || 'PC-UNKNOWN',
            quantity: Number(item.quantity) || 0,
            updated_at: acc.updated_at,
          });

          items[nameTrimmed].totalQuantity += (Number(item.quantity) || 0);
        });
      }
    });

    return items;
  }, [accounts, importedAccounts]);

  const filteredStorageItems = useMemo(() => {
    const list = Object.values(aggregateStorage) as {
      name: string;
      rawName?: string;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      icon?: string;
      accounts: { username: string; pc: string; quantity: number; updated_at: string }[];
      totalQuantity: number;
    }[];
    if (!search) return list;
    const term = search.toLowerCase();
    return list.filter((item) => item.name.toLowerCase().includes(term));
  }, [aggregateStorage, search]);

  const tradeStorage = useMemo(() => {
    const items: { 
      [itemName: string]: { 
        name: string;
        rawName?: string;
        rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
        icon?: string;
        accounts: { username: string; pc: string; quantity: number; updated_at: string }[];
        totalQuantity: number;
      } 
    } = {};

    tradingAccounts.forEach((acc) => {
      const itemsList = acc.items || [];
      itemsList.forEach((item: any) => {
        if (item.category === 'Trading') {
          const matchingGTD = gtdUnitsList.find(u => u.ID === item.unitId || u.Name === item.unitName);
          const rarityCode = matchingGTD?.Rarity || 'ra_common';
          let rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' = 'common';
          if (rarityCode === 'ra_godly' || rarityCode === 'ra_exclusive') rarity = 'legendary';
          else if (rarityCode === 'ra_epic') rarity = 'epic';
          else if (rarityCode === 'ra_rare') rarity = 'rare';
          else if (rarityCode === 'ra_uncommon') rarity = 'uncommon';

          const nameTrimmed = item.unitName;
          if (!items[nameTrimmed]) {
            items[nameTrimmed] = {
              name: nameTrimmed,
              rawName: matchingGTD?.ID || item.unitId || item.unitName,
              rarity,
              icon: matchingGTD?.Icon || '📦',
              accounts: [],
              totalQuantity: 0,
            };
          }
          items[nameTrimmed].accounts.push({
            username: acc.name,
            pc: 'Portfolio',
            quantity: Number(item.quantity) || 0,
            updated_at: new Date().toISOString(),
          });
          items[nameTrimmed].totalQuantity += (Number(item.quantity) || 0);
        }
      });
    });

    return items;
  }, [tradingAccounts]);

  const filteredTradeStorageItems = useMemo(() => {
    const list = Object.values(tradeStorage) as {
      name: string;
      rawName?: string;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      icon?: string;
      accounts: { username: string; pc: string; quantity: number; updated_at: string }[];
      totalQuantity: number;
    }[];
    if (!search) return list;
    const term = search.toLowerCase();
    return list.filter((item) => item.name.toLowerCase().includes(term));
  }, [tradeStorage, search]);

  const sellingStorage = useMemo(() => {
    const items: { 
      [itemName: string]: { 
        name: string;
        rawName?: string;
        rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
        icon?: string;
        accounts: { username: string; pc: string; quantity: number; updated_at: string }[];
        totalQuantity: number;
      } 
    } = {};

    tradingAccounts.forEach((acc) => {
      const itemsList = acc.items || [];
      itemsList.forEach((item: any) => {
        if (item.category === 'Selling') {
          const matchingGTD = gtdUnitsList.find(u => u.ID === item.unitId || u.Name === item.unitName);
          const rarityCode = matchingGTD?.Rarity || 'ra_common';
          let rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' = 'common';
          if (rarityCode === 'ra_godly' || rarityCode === 'ra_exclusive') rarity = 'legendary';
          else if (rarityCode === 'ra_epic') rarity = 'epic';
          else if (rarityCode === 'ra_rare') rarity = 'rare';
          else if (rarityCode === 'ra_uncommon') rarity = 'uncommon';

          const nameTrimmed = item.unitName;
          if (!items[nameTrimmed]) {
            items[nameTrimmed] = {
              name: nameTrimmed,
              rawName: matchingGTD?.ID || item.unitId || item.unitName,
              rarity,
              icon: matchingGTD?.Icon || '📦',
              accounts: [],
              totalQuantity: 0,
            };
          }
          items[nameTrimmed].accounts.push({
            username: acc.name,
            pc: 'Portfolio',
            quantity: Number(item.quantity) || 0,
            updated_at: new Date().toISOString(),
          });
          items[nameTrimmed].totalQuantity += (Number(item.quantity) || 0);
        }
      });
    });

    return items;
  }, [tradingAccounts]);

  const filteredSellingStorageItems = useMemo(() => {
    const list = Object.values(sellingStorage) as {
      name: string;
      rawName?: string;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      icon?: string;
      accounts: { username: string; pc: string; quantity: number; updated_at: string }[];
      totalQuantity: number;
    }[];
    if (!search) return list;
    const term = search.toLowerCase();
    return list.filter((item) => item.name.toLowerCase().includes(term));
  }, [sellingStorage, search]);

  const selectedStorageItem = useMemo(() => {
    if (!selectedStorageItemName) return null;
    if (selectedStorageSource === 'farm') {
      return aggregateStorage[selectedStorageItemName] || null;
    } else if (selectedStorageSource === 'trade') {
      return tradeStorage[selectedStorageItemName] || null;
    } else if (selectedStorageSource === 'selling') {
      return sellingStorage[selectedStorageItemName] || null;
    }
    return null;
  }, [aggregateStorage, tradeStorage, sellingStorage, selectedStorageItemName, selectedStorageSource]);

  // Helper to handle holder clicking (with Ctrl/Cmd and Shift multiselection keys support)
  const handleHolderClick = (e: React.MouseEvent, index: number) => {
    if (!selectedStorageItem) return;
    
    let newSelected = [...selectedHolderIndexes];

    if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const range = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      
      if (e.ctrlKey || e.metaKey) {
        newSelected = Array.from(new Set([...newSelected, ...range]));
      } else {
        newSelected = range;
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (newSelected.includes(index)) {
        newSelected = newSelected.filter(i => i !== index);
      } else {
        newSelected.push(index);
      }
      setLastClickedIndex(index);
    } else {
      // For right click / contextmenu: if already selected, don't clear the other selections!
      const isRightClick = e.button === 2 || e.type === 'contextmenu';
      if (isRightClick && newSelected.includes(index)) {
        // keep current selection intact
      } else {
        newSelected = [index];
        setLastClickedIndex(index);
      }
    }

    setSelectedHolderIndexes(newSelected);
  };

  const handleCopySelectedUsernames = () => {
    if (!selectedStorageItem || selectedHolderIndexes.length === 0) return;
    const itemsList = selectedHolderIndexes
      .map(i => {
        const username = selectedStorageItem.accounts[i]?.username;
        return username ? getFormattedCredentials(username) : '';
      })
      .filter(Boolean);

    if (itemsList.length > 0) {
      navigator.clipboard.writeText(itemsList.join('\n'));
      setToastMessage(`Copied ${itemsList.length} account${itemsList.length > 1 ? 's' : ''} in user:pass:cookie format!`);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const handleCopyAllUsernames = () => {
    if (!selectedStorageItem) return;
    const itemsList = selectedStorageItem.accounts
      .map(a => getFormattedCredentials(a.username))
      .filter(Boolean);

    if (itemsList.length > 0) {
      navigator.clipboard.writeText(itemsList.join('\n'));
      setToastMessage(`Copied all ${itemsList.length} accounts in user:pass:cookie format!`);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-[#030304] text-zinc-100 font-sans selection:bg-indigo-500/30 selection:text-white pb-20 relative overflow-x-hidden">
      {/* Ambient background glass effects */}
      <div className="absolute top-[-5%] left-[-10%] w-[550px] h-[550px] bg-indigo-600/10 rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="absolute bottom-[20%] right-[-10%] w-[500px] h-[500px] bg-emerald-600/5 rounded-full blur-[130px] pointer-events-none z-0" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 z-10 relative">
        
        {/* Dynamic Simplified Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-zinc-800/40 pb-6">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu Toggle Button */}
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="w-10 h-10 rounded-xl border border-zinc-800 bg-zinc-900/45 hover:bg-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
              title="Toggle Navigation Menu"
              id="hamburger-menu-toggle"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-sm font-black text-black">K</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black font-display tracking-tight text-white">KIRAYU</h1>
                <span className="text-[10px] uppercase font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">
                  Live Tracker
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Simple instant client monitoring grouped per PC</p>
            </div>
          </div>

          {/* Controls with Search & Filter */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Search inputs */}
            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-550 w-4 h-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search accounts or PCs..."
                className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-xl py-2 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-200 transition placeholder-zinc-500"
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-white text-zinc-500 text-xs cursor-pointer font-bold"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Bulk Credentials Importer Toggle */}
            <button
              onClick={() => {
                setIsImportModalOpen(true);
                setImportText('');
              }}
              className="px-4 py-2.5 rounded-xl border border-zinc-850 bg-zinc-900/40 text-zinc-300 hover:text-white hover:border-zinc-750 transition duration-150 flex items-center gap-2 text-xs font-bold cursor-pointer active:scale-95 shadow-md h-10 shrink-0"
              title="Import user:pass:cookie in bulk"
              id="btn-open-credentials-import"
            >
              <span className="text-amber-400 text-sm">🔑</span>
              <span>Credentials</span>
              {Object.keys(credentialsMap).length > 0 && (
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono text-[9px] px-1.5 py-0.5 rounded font-bold">
                  {Object.keys(credentialsMap).length} loaded
                </span>
              )}
            </button>

            {/* Manual Stream Refresh Button */}
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className={`p-2.5 rounded-xl border border-zinc-800 bg-zinc-90 w-10 h-10 flex items-center justify-center transition cursor-pointer hover:border-zinc-700 active:scale-95 text-zinc-300 hover:text-white relative ${
                isRefreshing ? 'animate-spin text-indigo-400' : ''
              }`}
              title="Refresh tracking system"
            >
              <RefreshCw className="w-4 h-4" />
              {!isRefreshing && (
                <span className="absolute bottom-0 right-0 bg-emerald-400 w-2 h-2 rounded-full ring-2 ring-[#030304]" />
              )}
            </button>
          </div>
        </header>

        {/* Main Workspace featuring Collapsible Flow Sidebar on the Left */}
        <div className="flex flex-col lg:flex-row gap-8 items-start mb-10">
          
          {/* Collapsible Sidebar Navigation Panel */}
          {isSidebarOpen && (
            <aside className="w-full lg:w-72 shrink-0 bg-zinc-950/40 border border-zinc-900 rounded-3xl p-5 flex flex-col gap-6 sticky top-6">
              {/* Sidebar Header with Close Toggle */}
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <span className="text-[10px] text-zinc-550 uppercase tracking-widest font-mono font-bold">
                  Navigation
                </span>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
                  title="Close Menu"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Navigation Items */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`w-full flex items-center gap-3 py-3 px-4 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                    activeTab === 'dashboard'
                      ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md'
                      : 'text-zinc-500 hover:text-zinc-350 hover:bg-zinc-900/40 border border-transparent'
                  }`}
                >
                  <span className="text-base">🖥️</span> Dashboard
                </button>
                <button
                  onClick={() => setActiveTab('accounts')}
                  className={`w-full flex items-center gap-3 py-3 px-4 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                    activeTab === 'accounts'
                      ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md'
                      : 'text-zinc-550 hover:text-zinc-350 hover:bg-zinc-900/40 border border-transparent'
                  }`}
                >
                  <span className="text-base">👤</span> Accounts Tab
                </button>
                <button
                  onClick={() => setActiveTab('storage')}
                  className={`w-full flex items-center gap-3 py-3 px-4 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                    activeTab === 'storage'
                      ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md'
                      : 'text-zinc-550 hover:text-zinc-350 hover:bg-zinc-900/40 border border-transparent'
                  }`}
                >
                  <span className="text-base">📦</span> Storage Tab
                </button>
                <button
                  onClick={() => setActiveTab('games')}
                  className={`w-full flex items-center gap-3 py-3 px-4 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                    activeTab === 'games'
                      ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md'
                      : 'text-zinc-550 hover:text-zinc-350 hover:bg-zinc-900/40 border border-transparent'
                  }`}
                >
                  <span className="text-base">🎮</span> Games Tab
                </button>
                <button
                  onClick={() => setActiveTab('units')}
                  className={`w-full flex items-center gap-3 py-3 px-4 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                    activeTab === 'units'
                      ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md'
                      : 'text-zinc-550 hover:text-zinc-350 hover:bg-zinc-900/40 border border-transparent'
                  }`}
                  id="nav-units-tab"
                >
                  <span className="text-base">🏆</span> Units Database
                </button>
                <button
                  onClick={() => setActiveTab('listings')}
                  className={`w-full flex items-center gap-3 py-3 px-4 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                    activeTab === 'listings'
                      ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md'
                      : 'text-zinc-550 hover:text-zinc-350 hover:bg-zinc-900/40 border border-transparent'
                  }`}
                  id="nav-listings-tab"
                >
                  <span className="text-base">🏪</span> Shop Listings
                </button>
              </div>

              {/* Platform Stats Metrics Panel */}
              <div className="flex flex-col gap-3 pt-2 border-t border-zinc-900">
                <span className="text-[10px] text-zinc-550 uppercase tracking-widest font-mono font-bold block">
                  Platform Stats
                </span>
                
                <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-semibold">Total PCs Grouped</span>
                    <span className="block text-xl font-bold font-display text-zinc-100 mt-1">{statistics.totalPcs}</span>
                  </div>
                  <Cpu className="text-zinc-700 w-4 h-4 shrink-0" />
                </div>

                <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-semibold">Total Accounts</span>
                    <span className="block text-xl font-bold font-display text-zinc-100 mt-1">{statistics.totalAccounts}</span>
                  </div>
                  <Users className="text-zinc-700 w-4 h-4 shrink-0" />
                </div>

                <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono font-semibold">Live Streams</span>
                    <span className="block text-xl font-bold font-display text-emerald-400 mt-1">{statistics.onlineCount}</span>
                  </div>
                  <Wifi className="text-emerald-500/60 w-4 h-4 shrink-0" />
                </div>

                <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-[9px] text-emerald-700 uppercase tracking-widest font-mono font-semibold block">Seeds Today</span>
                    <span className="block text-xl font-bold font-display text-emerald-400 mt-1">
                      +{Math.max(0, statistics.totalSeeds - Object.values(seedsNoonBaseline).reduce((s, v) => s + v, 0)).toLocaleString()}
                    </span>
                    <span className="text-[9px] text-zinc-600 font-mono block mt-0.5">Resets 12:00 AM</span>
                  </div>
                  <span className="text-lg shrink-0">🌱</span>
                </div>
              </div>
            </aside>
          )}

          {/* Main workspace container (Right Side) */}
          <div className="flex-1 w-full min-w-0 transition-all duration-300">

        {/* Conditionally Render Active Tab Content */}
        {activeTab === 'dashboard' ? (
          <div>
            {isFirstLoad ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-5 h-44 animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* GAME TRACKING VIEW PROFILE BAR */}
                <div className="bg-zinc-900/25 border border-zinc-850/60 rounded-3xl p-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest font-mono flex items-center gap-2">
                      <span className="text-base">🎯</span> Game Tracking Profile
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-medium">
                      {selectedGameFilter === 'all' 
                        ? 'Showing all accounts under default tracker template view.'
                        : `Showing "${selectedGameFilter}" active accounts with customized dynamic table tracking.`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-zinc-550 uppercase font-mono font-bold mr-1">View Template:</span>
                    <button
                      onClick={() => setSelectedGameFilter('all')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer ${
                        selectedGameFilter === 'all'
                          ? 'bg-zinc-850 border-zinc-750 text-white'
                          : 'bg-zinc-900/40 text-zinc-500 hover:text-zinc-350 border-transparent hover:bg-zinc-900'
                      }`}
                    >
                      All Games
                    </button>
                    {games.map(game => (
                      <button
                        key={game.name}
                        onClick={() => setSelectedGameFilter(game.name)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                          selectedGameFilter === game.name
                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.05)]'
                            : 'bg-zinc-900/40 text-zinc-500 hover:text-zinc-350 border-transparent hover:bg-zinc-900'
                        }`}
                      >
                        <span className="text-xs">🎮</span>
                        <span>{game.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {Object.keys(pcGroups).length > 0 ? (
                  <div className="flex flex-col gap-6">
                {(Object.entries(pcGroups) as [string, AccountData[]][]).map(([pcName, accountsInPc]) => {
                  const onlineCount = accountsInPc.filter(acc => {
                    const diff = Math.floor((new Date().getTime() - new Date(acc.updated_at).getTime()) / 1000);
                    return diff <= 300;
                  }).length;
                  const allOnline = onlineCount === accountsInPc.length;
                  const noneOnline = onlineCount === 0;
                  const isCollapsed = collapsedPcs[pcName] || false;
                  const toggleCollapse = () => {
                    setCollapsedPcs(prev => ({
                      ...prev,
                      [pcName]: !prev[pcName]
                    }));
                  };

                  return (
                    <motion.div
                      key={pcName}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="bg-zinc-900/20 border border-zinc-850/70 backdrop-blur-md rounded-2xl p-5 hover:border-zinc-800 transition duration-150 flex flex-col gap-4"
                    >
                      {/* PC Card Header */}
                      <div 
                        onClick={toggleCollapse}
                        className="flex items-center justify-between select-none cursor-pointer group/header"
                      >
                        <div className="flex items-center gap-2.5">
                          {isCollapsed ? (
                            <ChevronRight className="text-zinc-500 group-hover/header:text-zinc-300 w-4 h-4 transition-transform animate-pulse" />
                          ) : (
                            <ChevronDown className="text-zinc-500 group-hover/header:text-zinc-350 w-4 h-4 transition-transform" />
                          )}
                          <Cpu className="text-indigo-400 w-4 h-4 shrink-0" />
                          <h3 className="text-base font-bold font-display text-white capitalize group-hover/header:text-indigo-350 transition">{pcName}</h3>
                        </div>
                        {/* PC health status badge */}
                        <div className="flex items-center gap-2.5">
                          <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                            allOnline 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : noneOnline
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {onlineCount} / {accountsInPc.length} Alive
                          </span>
                        </div>
                      </div>

                      {/* Accounts table on this PC */}
                      {!isCollapsed && (
                        <div className="overflow-x-auto pt-2 border-t border-zinc-850/50">
                          <table className="w-full text-left border-collapse min-w-[650px]">
                            <thead>
                              <tr className="border-b border-zinc-800/60 text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
                                <th className="py-2.5 px-3 font-semibold text-left">Account</th>
                                {visibleColumns.game && <th className="py-2.5 px-3 font-semibold text-center">Game</th>}
                                {visibleColumns.map && <th className="py-2.5 px-3 font-semibold text-center">Map</th>}
                                {visibleColumns.seeds && <th className="py-2.5 px-3 font-semibold text-center">Seeds</th>}
                                {visibleColumns.seeds && <th className="py-2.5 px-3 font-semibold text-center text-emerald-600">+Today</th>}
                                {visibleColumns.storage && <th className="py-2.5 px-3 font-semibold text-center">Storage</th>}
                                {visibleColumns.lobby && <th className="py-2.5 px-3 font-semibold text-center">Lobby</th>}
                                <th className="py-2.5 px-3 font-semibold text-center">Key Items</th>
                                <th className="py-2.5 px-3 font-semibold text-center">Updated</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/40">
                              {accountsInPc.map((acc) => {
                                const age = Math.floor((new Date().getTime() - new Date(acc.updated_at).getTime()) / 1000);
                                const isOnline = age <= 300;
                                const seedsGained = Number(acc.seeds || 0) - (seedsNoonBaseline[acc.username] ?? Number(acc.seeds || 0));
                                const snapshotAge = (Date.now() - seedsSnapshotTimestamp) / 1000;
                                const isNoSeeds = isOnline && seedsGained <= 0 && snapshotAge > 1200;

                                return (
                                  <tr
                                    key={acc.id}
                                    className={`group hover:bg-zinc-900/40 transition-colors duration-100 ${
                                      !isOnline ? 'opacity-50 saturate-50' : ''
                                    }`}
                                  >
                                    {/* Account Info Column */}
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-2.5 font-display">
                                        {/* Live status ping indicator */}
                                        <span className="relative flex h-2 w-2 shrink-0">
                                          {isOnline && (
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                          )}
                                          <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                            isOnline ? 'bg-emerald-500' : 'bg-rose-650'
                                          }`}></span>
                                        </span>

                                        <div className="min-w-0 flex items-center gap-1.5">
                                          <span className="text-xs font-bold text-zinc-150 block truncate group-hover:text-white transition">
                                            {acc.username}
                                          </span>
                                          {credentialsMap[acc.username.toLowerCase()] && (
                                            <span
                                              className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded font-mono font-bold shrink-0 cursor-help"
                                              title="Matched: user:pass:cookie imported"
                                            >
                                              🔑
                                            </span>
                                          )}
                                          {isNoSeeds && (
                                            <span
                                              className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded font-mono font-bold shrink-0"
                                              title="Online but no seeds gained since last noon reset"
                                            >
                                              NO SEEDS
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>

                                    {/* Game Column */}
                                    {visibleColumns.game && (
                                      <td className="py-3 px-3 text-center">
                                        {(() => {
                                          const localMeta = importedAccounts.find(
                                            (ia) => ia.username.toLowerCase() === acc.username.toLowerCase()
                                          );
                                          const gameName = localMeta?.game || 'None';
                                          
                                          return (
                                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded-full border font-mono font-bold uppercase ${
                                              gameName !== 'None'
                                                ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20'
                                                : 'bg-zinc-900/40 text-zinc-500 border-zinc-850'
                                            }`}>
                                              🎮 {gameName}
                                            </span>
                                          );
                                        })()}
                                      </td>
                                    )}

                                    {/* Map Column */}
                                    {visibleColumns.map && (
                                      <td className="py-3 px-3 text-center">
                                        {(() => {
                                          // Read directly from the `lobby` column ("lobby" | "farming" | "unknown")
                                          const lobbyVal = (acc.lobby || 'unknown').toLowerCase();
                                          const isLobby = lobbyVal === 'lobby';
                                          const isFarming = lobbyVal === 'farming';

                                          let mapText = 'Unknown';
                                          let badgeStyle = 'bg-zinc-900/30 text-zinc-400 border-zinc-800/50';

                                          if (!isOnline) {
                                            mapText = 'Offline';
                                            badgeStyle = 'bg-rose-950/20 text-rose-400 border-rose-900/50';
                                          } else if (isLobby) {
                                            mapText = 'In Lobby';
                                            badgeStyle = 'bg-amber-950/30 text-amber-400 border-amber-900/40';
                                          } else if (isFarming) {
                                            mapText = 'Farming';
                                            badgeStyle = 'bg-emerald-950/20 text-emerald-400 border-emerald-900/40';
                                          }

                                          return (
                                            <span className={`inline-flex items-center px-2 py-1 text-xs rounded border ${badgeStyle}`}>
                                              {mapText}
                                            </span>
                                          );
                                        })()}
                                      </td>
                                    )}

                                    {/* Seeds Column */}
                                    {visibleColumns.seeds && (
                                      <td className="py-3 px-3 text-center font-mono text-zinc-350">
                                        <span className="text-xs font-semibold">
                                          {Number(acc.seeds || 0).toLocaleString()} 🌱
                                        </span>
                                      </td>
                                    )}

                                    {/* Seeds Today Column */}
                                    {visibleColumns.seeds && (
                                      <td className="py-3 px-3 text-center font-mono">
                                        {seedsGained > 0 ? (
                                          <span className="text-xs font-bold text-emerald-400">
                                            +{seedsGained.toLocaleString()}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-zinc-700">—</span>
                                        )}
                                      </td>
                                    )}

                                    {/* Storage Column with Popup activation button */}
                                    {visibleColumns.storage && (
                                      <td className="py-3 px-3 text-center">
                                        <div className="flex items-center justify-center">
                                          {(() => {
                                            const count = acc.inventory?.length || 0;
                                            return (
                                              <button
                                                onClick={() => setSelectedInventoryUser({ username: acc.username, inventory: acc.inventory })}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono text-xs font-bold transition duration-150 cursor-pointer ${
                                                  count > 0 
                                                    ? 'bg-indigo-600/10 border-indigo-500/35 hover:border-indigo-550 text-indigo-450 hover:bg-indigo-650/15 active:scale-95' 
                                                    : 'bg-zinc-900/40 border-zinc-850 hover:border-zinc-700 text-zinc-550 hover:text-zinc-350 active:scale-95'
                                                }`}
                                                title="View vault storage items"
                                              >
                                                <span>📦</span>
                                                <span>{count}</span>
                                              </button>
                                            );
                                          })()}
                                        </div>
                                      </td>
                                    )}

                                    {/* Lobby/Status details */}
                                    {visibleColumns.lobby && (
                                      <td className="py-3 px-3 text-center font-mono text-zinc-400">
                                        <span className="text-xs font-semibold bg-zinc-950 px-2 py-0.5 border border-zinc-850 rounded">
                                          {acc.lobby || 'unknown'}
                                        </span>
                                      </td>
                                    )}

                                    {/* Key Items: Rafflesia & Trident */}
                                    <td className="py-3 px-3 text-center">
                                      {(() => {
                                        const inv = acc.inventory || [];
                                        const hasRafflesia = inv.some(i => i.name?.toLowerCase().includes('rafflesia'));
                                        const hasTrident = inv.some(i => i.name?.toLowerCase().includes('trident'));
                                        return (
                                          <div className="flex items-center justify-center gap-1">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${hasRafflesia ? 'text-pink-400 bg-pink-500/10 border-pink-500/20' : 'text-zinc-600 bg-zinc-800/50 border-zinc-700/30'}`} title="Rafflesia">
                                              RAF
                                            </span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${hasTrident ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' : 'text-zinc-600 bg-zinc-800/50 border-zinc-700/30'}`} title="Trident">
                                              TRI
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    </td>

                                    {/* Last Updated Column */}
                                    <td className="py-3 px-3 text-center">
                                      <span className={`text-[11px] font-mono font-bold ${isOnline ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                        {age <= 0 ? 'now' : age <= 300 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="py-20 text-center bg-zinc-900/10 border border-zinc-900 border-dashed rounded-3xl flex flex-col items-center justify-center">
                <Inbox className="w-12 h-12 text-zinc-600 mb-3" />
                <p className="text-zinc-300 font-bold block">No Accounts Tracking</p>
                <p className="text-zinc-500 text-xs mt-1 max-w-sm">
                  We couldn't detect any virtual accounts matching the search query. Try typing another name query.
                </p>
              </div>
            )}
            </>
            )}
          </div>
        ) : activeTab === 'accounts' ? (
          /* Accounts management tab, listing imported accounts */
          <div className="flex flex-col gap-6">
            
            {/* Top Info & Action row */}
            <div className="bg-zinc-900/20 border border-zinc-850/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>👤</span> Accounts Manager
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Import, view, and assign category (PC) and game for each account with local persistence.
                </p>
              </div>

              {/* Counts indicator */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest font-semibold">
                  Summary:
                </span>
                <span className="text-[11px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded font-mono font-bold">
                  {importedAccounts.length} Total
                </span>
                <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-mono font-bold">
                  {importedAccounts.filter(ia => accounts.some(a => a.username.toLowerCase() === ia.username.toLowerCase() && Math.floor((new Date().getTime() - new Date(a.updated_at).getTime()) / 1000) <= 300)).length} Live
                </span>
                <span className="text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded font-mono font-bold">
                  {importedAccounts.filter(ia => (ia.status || 'unused') === 'unused').length} Unused
                </span>
              </div>
            </div>

            {/* FarmSync API Sync Section */}
            <div className="bg-zinc-900/25 border border-indigo-900/30 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-900">
                <div>
                  <h4 className="text-xs font-bold font-display text-zinc-150 flex items-center gap-2">
                    <span>⚡</span> FarmSync Auto-Import
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Pulls all devices + accounts from FarmSync — username, password, cookie, and PC assignment included.
                  </p>
                </div>
                {farmsyncStatus && (
                  <span className={`text-[10px] font-mono px-2 py-1 rounded border shrink-0 ${
                    farmsyncStatus.startsWith('Synced')
                      ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/40'
                      : 'text-rose-400 bg-rose-950/30 border-rose-900/40'
                  }`}>
                    {farmsyncStatus}
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="password"
                  placeholder="Paste your FarmSync Bearer token..."
                  value={farmsyncToken}
                  onChange={e => {
                    setFarmsyncToken(e.target.value);
                    try { localStorage.setItem('gtd_farmsync_token', e.target.value); } catch {}
                  }}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={() => syncFromFarmsync(farmsyncToken)}
                  disabled={farmsyncSyncing || !farmsyncToken.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition shrink-0 cursor-pointer"
                >
                  {farmsyncSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            </div>

            {/* Quick Import Section */}
            <div className="bg-zinc-900/25 border border-zinc-850/70 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-zinc-900">
                <div>
                  <h4 className="text-xs font-bold font-display text-zinc-150 flex items-center gap-2">
                    <span>📥</span> Import Accounts in List
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Paste lines of accounts to import or update.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-550 font-mono">
                    Detect formats: <code className="text-indigo-400 font-mono bg-zinc-900 px-1 py-0.5 rounded font-black">user:pass:cookie</code>, <code className="text-indigo-400 font-mono bg-zinc-900 px-1 py-0.5 rounded font-black">user:pass</code>, or <code className="text-indigo-400 font-mono bg-zinc-900 px-1 py-0.5 rounded font-black">username</code>
                  </span>
                </div>
              </div>

              <textarea
                value={accountsImportText}
                onChange={(e) => setAccountsImportText(e.target.value)}
                placeholder="user1:pass1:cookieValueHere...&#10;user2:pass2:cookieValueHere...&#10;user3"
                rows={4}
                className="w-full bg-zinc-900/50 border border-zinc-850 rounded-xl p-3.5 text-xs font-mono text-zinc-250 placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-4 resize-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/30 border border-zinc-900 p-3.5 rounded-xl">
                {/* Auto Assign during Import Options */}
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 font-bold block shrink-0">
                    Auto-Assign on Import:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-semibold font-mono">PC:</span>
                    <input 
                      type="text" 
                      placeholder="e.g. PC-1" 
                      value={importAssignPc} 
                      onChange={e => setImportAssignPc(e.target.value)}
                      className="bg-zinc-950 border border-zinc-850 rounded-lg px-2.5 py-1 text-xs text-zinc-150 placeholder-zinc-705 w-24 focus:outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-semibold font-mono">Game:</span>
                    <input 
                      type="text" 
                      placeholder="e.g. PETS GO" 
                      value={importAssignGame} 
                      onChange={e => setImportAssignGame(e.target.value)}
                      className="bg-zinc-950 border border-zinc-850 rounded-lg px-2.5 py-1 text-xs text-zinc-150 placeholder-zinc-705 w-24 focus:outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-semibold font-mono">Status:</span>
                    <select 
                      value={importAssignStatus} 
                      onChange={e => setImportAssignStatus(e.target.value)}
                      className="bg-zinc-950 border border-zinc-850 rounded-lg px-2.5 py-1 text-xs text-zinc-150 focus:outline-none cursor-pointer"
                    >
                      <option value="unused">Unused</option>
                      <option value="banned">Banned</option>
                      {statusCategories.filter(cat => cat !== 'unused' && cat !== 'banned').map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!accountsImportText.trim()) return;
                    const lines = accountsImportText.split('\n');
                    let importedCount = 0;
                    const newList = [...importedAccounts];

                    lines.forEach(line => {
                      const trimmed = line.trim();
                      if (!trimmed) return;
                      const parts = trimmed.split(':');
                      if (parts.length >= 1) {
                        const user = parts[0].trim();
                        if (!user) return;
                        const pass = parts[1] ? parts[1].trim() : '';
                        const cookie = parts.slice(2).join(':').trim();

                        const existingIndex = newList.findIndex(a => a.username.toLowerCase() === user.toLowerCase());
                        if (existingIndex !== -1) {
                          newList[existingIndex] = {
                            ...newList[existingIndex],
                            pass: pass || newList[existingIndex].pass,
                            cookie: cookie || newList[existingIndex].cookie,
                            pcCategoryByClient: importAssignPc.trim() || newList[existingIndex].pcCategoryByClient || 'PC-UNKNOWN',
                            game: importAssignGame.trim() || newList[existingIndex].game || 'None',
                            status: importAssignStatus || newList[existingIndex].status || 'unused',
                          };
                        } else {
                          newList.push({
                            username: user,
                            pass,
                            cookie,
                            pcCategoryByClient: importAssignPc.trim() || 'PC-UNKNOWN',
                            game: importAssignGame.trim() || 'None',
                            status: importAssignStatus || 'unused',
                            createdAt: new Date().toISOString()
                          });
                        }
                        importedCount++;
                      }
                    });

                    saveImportedAccounts(newList);
                    setAccountsImportText('');
                    setToastMessage(`Processed the list and successfully imported/merged ${importedCount} records!`);
                    setTimeout(() => setToastMessage(null), 3000);
                  }}
                  className="px-4 py-2 font-black text-xs bg-indigo-500 hover:bg-indigo-400 text-black rounded-lg transition duration-150 active:scale-95 shadow-lg shadow-indigo-650/15 cursor-pointer flex items-center gap-1.5"
                >
                  📥 Import accounts ({accountsImportText.split('\n').filter(Boolean).length})
                </button>
              </div>
            </div>

            {/* Filter Bar with category list and creation widget */}
            <div className="bg-zinc-900/15 border border-zinc-850 rounded-2xl p-5 flex flex-col gap-4">
              
              {/* Filter Row 1: Status Categories & Custom Creation */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-900/60 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase font-bold mr-2">Status Group:</span>
                  <button
                    onClick={() => setAccountStatusFilter('all')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer ${
                      accountStatusFilter === 'all'
                        ? 'bg-zinc-850 border-zinc-700 text-white'
                        : 'bg-zinc-900/40 text-zinc-500 hover:text-zinc-350 border-transparent'
                    }`}
                  >
                    All Accounts ({importedAccounts.length})
                  </button>
                  <button
                    onClick={() => setAccountStatusFilter('unused')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer ${
                      accountStatusFilter === 'unused'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-zinc-900/40 text-zinc-500 hover:text-zinc-350 border-transparent'
                    }`}
                  >
                    Unused ({importedAccounts.filter(a => (a.status || 'unused') === 'unused').length})
                  </button>
                  <button
                    onClick={() => setAccountStatusFilter('banned')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer ${
                      accountStatusFilter === 'banned'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : 'bg-zinc-900/40 text-zinc-500 hover:text-zinc-350 border-transparent'
                    }`}
                  >
                    Banned ({importedAccounts.filter(a => a.status === 'banned').length})
                  </button>
                  {statusCategories.filter(cat => cat !== 'unused' && cat !== 'banned').map(cat => (
                    <button
                      key={cat}
                      onClick={() => setAccountStatusFilter(cat)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer capitalize ${
                        accountStatusFilter === cat
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          : 'bg-zinc-900/40 text-zinc-500 hover:text-zinc-350 border-transparent'
                      }`}
                    >
                      {cat} ({importedAccounts.filter(a => a.status === cat).length})
                    </button>
                  ))}
                </div>

                {/* Create Custom Category */}
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    value={newCustomCategoryInput}
                    onChange={(e) => setNewCustomCategoryInput(e.target.value)}
                    placeholder="e.g. Active, Flagged"
                    className="bg-zinc-950 border border-zinc-850 rounded-lg px-2.5 py-1.5 text-xs text-zinc-350 placeholder-zinc-700 w-36 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const trimmed = newCustomCategoryInput.trim().toLowerCase();
                        if (trimmed && !statusCategories.includes(trimmed) && trimmed !== 'all') {
                          const updated = [...statusCategories, trimmed];
                          saveStatusCategories(updated);
                          setToastMessage(`Created custom category: "${trimmed}"`);
                          setTimeout(() => setToastMessage(null), 2500);
                          setNewCustomCategoryInput('');
                          setAccountStatusFilter(trimmed);
                        }
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const trimmed = newCustomCategoryInput.trim().toLowerCase();
                      if (trimmed && !statusCategories.includes(trimmed) && trimmed !== 'all') {
                        const updated = [...statusCategories, trimmed];
                        saveStatusCategories(updated);
                        setToastMessage(`Created custom category: "${trimmed}"`);
                        setTimeout(() => setToastMessage(null), 2500);
                        setNewCustomCategoryInput('');
                        setAccountStatusFilter(trimmed);
                      }
                    }}
                    className="px-3 py-1.5 text-xs bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg font-bold cursor-pointer transition"
                  >
                    ➕ Create Category
                  </button>
                </div>
              </div>

              {/* Filter Row 2: Search, PC filter, Game filter */}
              <div className="flex flex-wrap items-center gap-4">
                
                {/* Search */}
                <div className="relative min-w-[200px] flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-550 text-xs">🔍</span>
                  <input
                    type="text"
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    placeholder="Search accounts name or properties..."
                    className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-1.5 pl-9 pr-8 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-300 placeholder-zinc-550"
                  />
                  {accountSearch && (
                    <button 
                      onClick={() => setAccountSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-550 hover:text-white text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* PC Category Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-550 uppercase tracking-widest font-mono font-semibold shrink-0">Filter Category:</span>
                  <select
                    value={accountPcFilter}
                    onChange={(e) => setAccountPcFilter(e.target.value)}
                    className="bg-zinc-950 border border-zinc-850 rounded-xl py-1.5 px-3 text-xs text-zinc-300 focus:outline-none cursor-pointer max-w-[140px]"
                  >
                    <option value="all">All PCs / Categories</option>
                    <option value="PC-UNKNOWN">PC-UNKNOWN</option>
                    {Array.from(new Set([
                      ...importedAccounts.map(a => a.pcCategoryByClient).filter(Boolean)
                    ])).filter(pc => pc && pc !== 'PC-UNKNOWN').map(pc => (
                      <option key={pc} value={pc}>{pc}</option>
                    ))}
                  </select>
                </div>

                {/* Game Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-550 uppercase tracking-widest font-mono font-semibold shrink-0">Filter Game:</span>
                  <select
                    value={accountGameFilter}
                    onChange={(e) => setAccountGameFilter(e.target.value)}
                    className="bg-zinc-950 border border-zinc-850 rounded-xl py-1.5 px-3 text-xs text-zinc-300 focus:outline-none cursor-pointer max-w-[140px]"
                  >
                    <option value="all">All Games</option>
                    <option value="None">None (Unassigned)</option>
                    {Array.from(new Set([
                      ...games.map(g => g.name),
                      ...importedAccounts.map(a => a.game).filter(Boolean)
                    ])).filter(g => g && g !== 'None' && g !== 'all').map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Bulk Actions sticky toolbar (visible when any checked) */}
            {selectedAccountUsernames.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#0e0f14] border border-indigo-500/35 shadow-2xl rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 sticky top-4 z-40"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-505 bg-indigo-500 animate-pulse" />
                  <span className="text-xs font-bold text-white">
                    {selectedAccountUsernames.length} accounts selected
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Copy credentials */}
                  <button
                    onClick={() => {
                      const list = importedAccounts
                        .filter(a => selectedAccountUsernames.includes(a.username))
                        .map(a => `${a.username}:${a.pass || ''}:${a.cookie || ''}`)
                        .join('\n');
                      navigator.clipboard.writeText(list);
                      setToastMessage(`Copied ${selectedAccountUsernames.length} credentials (user:pass:cookie)!`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    className="px-3 py-1.5 text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded-lg font-bold border border-zinc-800 transition duration-155 active:scale-95 cursor-pointer flex items-center gap-1"
                    title="Copy selected as user:pass:cookie list"
                  >
                    📋 Copy credentials
                  </button>

                  <button
                    onClick={() => {
                      const list = selectedAccountUsernames.join('\n');
                      navigator.clipboard.writeText(list);
                      setToastMessage(`Copied ${selectedAccountUsernames.length} usernames!`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    className="px-3 py-1.5 text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-250 rounded-lg font-semibold border border-zinc-800 transition duration-155 active:scale-95 cursor-pointer"
                  >
                    👤 Copy names
                  </button>

                  {/* PC Category set indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-500 font-mono">Set PC:</span>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const updated = importedAccounts.map(ia => 
                          selectedAccountUsernames.includes(ia.username)
                            ? { ...ia, pcCategoryByClient: val }
                            : ia
                        );
                        saveImportedAccounts(updated);
                        setToastMessage(`Bulk updated PC for checked accounts to "${val}"`);
                        setTimeout(() => setToastMessage(null), 2500);
                        e.target.value = "";
                      }}
                      className="bg-zinc-950 border border-zinc-850 rounded-lg text-xs py-1 px-2.5 text-zinc-300 focus:outline-none cursor-pointer max-w-[110px]"
                    >
                      <option value="" disabled>--- select ---</option>
                      <option value="PC-UNKNOWN">PC-UNKNOWN</option>
                      {Array.from(new Set([
                        ...importedAccounts.map(a => a.pcCategoryByClient).filter(Boolean)
                      ])).filter(pc => pc && pc !== 'PC-UNKNOWN').map(pc => (
                        <option key={pc} value={pc}>{pc}</option>
                      ))}
                    </select>
                  </div>

                  {/* Game set indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-500 font-mono">Set Game:</span>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const updated = importedAccounts.map(ia => 
                          selectedAccountUsernames.includes(ia.username)
                            ? { ...ia, game: val }
                            : ia
                        );
                        saveImportedAccounts(updated);
                        setToastMessage(`Bulk updated Game for checked accounts to "${val}"`);
                        setTimeout(() => setToastMessage(null), 2500);
                        e.target.value = "";
                      }}
                      className="bg-zinc-950 border border-zinc-850 rounded-lg text-xs py-1 px-2.5 text-zinc-300 focus:outline-none cursor-pointer max-w-[110px]"
                    >
                      <option value="" disabled>--- select ---</option>
                      <option value="None">None</option>
                      {Array.from(new Set([
                        ...games.map(g => g.name),
                        ...importedAccounts.map(a => a.game).filter(Boolean)
                      ])).filter(g => g && g !== 'None' && g !== 'all').map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status set indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-500 font-mono">Set Status:</span>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const updated = importedAccounts.map(ia => 
                          selectedAccountUsernames.includes(ia.username)
                            ? { ...ia, status: val }
                            : ia
                        );
                        saveImportedAccounts(updated);
                        setToastMessage(`Bulk updated status for checked accounts to "${val}"`);
                        setTimeout(() => setToastMessage(null), 2500);
                        e.target.value = "";
                      }}
                      className="bg-zinc-950 border border-zinc-850 rounded-lg text-xs py-1 px-2.5 text-zinc-300 focus:outline-none cursor-pointer max-w-[110px]"
                    >
                      <option value="" disabled>--- select ---</option>
                      <option value="unused">Unused</option>
                      <option value="banned">Banned</option>
                      {statusCategories.filter(cat => cat !== 'unused' && cat !== 'banned').map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => {
                      const updated = importedAccounts.filter(ia => !selectedAccountUsernames.includes(ia.username));
                      saveImportedAccounts(updated);
                      setSelectedAccountUsernames([]);
                      setToastMessage(`Bulk deleted ${selectedAccountUsernames.length} account memory records.`);
                      setTimeout(() => setToastMessage(null), 2500);
                    }}
                    className="px-3 py-1.5 text-xs bg-rose-950/20 hover:bg-rose-900/30 text-rose-400 border border-rose-950 rounded-lg font-bold transition duration-155 active:scale-95 cursor-pointer"
                  >
                    🗑️ Delete Selected
                  </button>

                  {/* Cancel */}
                  <button
                    onClick={() => setSelectedAccountUsernames([])}
                    className="text-zinc-500 hover:text-white text-xs font-semibold px-2 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            {/* Accounts list table */}
            <div className="bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-5 overflow-hidden">
              <div className="overflow-x-auto">
                {filteredImportedAccounts.length > 0 ? (
                  <table className="w-full text-left border-collapse min-w-[750px]">
                    <thead>
                      <tr className="border-b border-zinc-800/60 text-[10px] text-zinc-550 uppercase tracking-widest font-mono">
                        <th className="py-3 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filteredImportedAccounts.length > 0 && filteredImportedAccounts.every(ia => selectedAccountUsernames.includes(ia.username))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAccountUsernames(Array.from(new Set([
                                  ...selectedAccountUsernames,
                                  ...filteredImportedAccounts.map(ia => ia.username)
                                ])));
                              } else {
                                const namesToExclude = new Set(filteredImportedAccounts.map(ia => ia.username));
                                setSelectedAccountUsernames(selectedAccountUsernames.filter(u => !namesToExclude.has(u)));
                              }
                            }}
                            className="rounded bg-zinc-900 w-3.5 h-3.5 border-zinc-800 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-3 font-semibold text-left">Account User name</th>
                        <th className="py-3 px-3 font-semibold text-center">Rig/Category (PC)</th>
                        <th className="py-3 px-3 font-semibold text-center">Assigned Game</th>
                        <th className="py-3 px-3 font-semibold text-center">Status Category</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/40">
                      {filteredImportedAccounts.map((ia, index) => {
                        const isChecked = selectedAccountUsernames.includes(ia.username);
                        const liveAcc = accounts.find(a => a.username.toLowerCase() === ia.username.toLowerCase());
                        const isLiveOnline = liveAcc ? (Math.floor((new Date().getTime() - new Date(liveAcc.updated_at).getTime()) / 1000) <= 300) : false;

                        return (
                          <tr
                            key={ia.username}
                            onClick={(e) => {
                              const tag = (e.target as HTMLElement).tagName.toLowerCase();
                              if (tag === 'select' || tag === 'input' || tag === 'button' || tag === 'option') return;
                              
                              let newSelected = [...selectedAccountUsernames];
                              if (e.shiftKey && lastClickedAccountUser !== null) {
                                const lastIndex = filteredImportedAccounts.findIndex(x => x.username === lastClickedAccountUser);
                                if (lastIndex !== -1) {
                                  const start = Math.min(lastIndex, index);
                                  const end = Math.max(lastIndex, index);
                                  const range = filteredImportedAccounts.slice(start, end + 1).map(x => x.username);
                                  
                                  if (e.ctrlKey || e.metaKey) {
                                    newSelected = Array.from(new Set([...newSelected, ...range]));
                                  } else {
                                    newSelected = range;
                                  }
                                }
                              } else if (e.ctrlKey || e.metaKey) {
                                if (newSelected.includes(ia.username)) {
                                  newSelected = newSelected.filter(u => u !== ia.username);
                                } else {
                                  newSelected.push(ia.username);
                                }
                                setLastClickedAccountUser(ia.username);
                              } else {
                                if (newSelected.includes(ia.username)) {
                                  newSelected = newSelected.filter(u => u !== ia.username);
                                } else {
                                  newSelected.push(ia.username);
                                }
                                setLastClickedAccountUser(ia.username);
                              }
                              setSelectedAccountUsernames(newSelected);
                            }}
                            className={`group transition-all duration-100 cursor-pointer ${
                              isChecked ? 'bg-indigo-600/5' : 'hover:bg-zinc-900/25'
                            }`}
                          >
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedAccountUsernames(selectedAccountUsernames.filter(u => u !== ia.username));
                                  } else {
                                    setSelectedAccountUsernames([...selectedAccountUsernames, ia.username]);
                                  }
                                }}
                                className="rounded bg-zinc-900 w-3.5 h-3.5 border-zinc-800 text-indigo-500 focus:ring-0 cursor-pointer"
                              />
                            </td>

                            {/* Account & Online indicator */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2.5 font-display min-w-0">
                                <span className="relative flex h-2 w-2 shrink-0">
                                  {isLiveOnline && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  )}
                                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                    isLiveOnline ? 'bg-emerald-500' : 'bg-zinc-650'
                                  }`}></span>
                                </span>
                                <div>
                                  <span className="text-xs font-bold text-zinc-150 block truncate group-hover:text-white transition">
                                    {ia.username}
                                  </span>
                                  <span className="text-[9px] text-zinc-550 block font-mono">
                                    {ia.pass ? `pass: ${ia.pass.slice(0, 4)}...` : 'no password'} • {ia.cookie ? 'cookie set' : 'no cookie'}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* PC Category Column */}
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center">
                                {editingPcForUser === ia.username ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editPcValue}
                                      onChange={(e) => setEditPcValue(e.target.value)}
                                      className="bg-zinc-900 border border-indigo-500 text-[11px] rounded-lg px-2 py-1 text-zinc-150 focus:outline-none w-24 font-mono select-text"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const updated = importedAccounts.map(a => 
                                            a.username === ia.username ? { ...a, pcCategoryByClient: editPcValue.trim() || 'PC-UNKNOWN' } : a
                                          );
                                          saveImportedAccounts(updated);
                                          setEditingPcForUser(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingPcForUser(null);
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = importedAccounts.map(a => 
                                          a.username === ia.username ? { ...a, pcCategoryByClient: editPcValue.trim() || 'PC-UNKNOWN' } : a
                                        );
                                        saveImportedAccounts(updated);
                                        setEditingPcForUser(null);
                                      }}
                                      className="text-emerald-400 hover:text-emerald-300 text-xs px-1 font-bold"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingPcForUser(null)}
                                      className="text-rose-450 hover:text-rose-400 text-xs px-1 font-bold"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <select
                                    value={ia.pcCategoryByClient || 'PC-UNKNOWN'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '__custom__') {
                                        setEditingPcForUser(ia.username);
                                        setEditPcValue(ia.pcCategoryByClient || '');
                                      } else {
                                        const updated = importedAccounts.map(a => 
                                          a.username === ia.username ? { ...a, pcCategoryByClient: val } : a
                                        );
                                        saveImportedAccounts(updated);
                                      }
                                    }}
                                    className="bg-zinc-950 border border-zinc-850 text-[11px] rounded-lg px-2.5 py-1 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer max-w-[125px]"
                                  >
                                    <option value="PC-UNKNOWN">PC-UNKNOWN</option>
                                    {Array.from(new Set([
                                      ...accounts.map(a => a.pc).filter(Boolean),
                                      ...importedAccounts.map(a => a.pcCategoryByClient).filter(Boolean)
                                    ])).filter(pc => pc && pc !== 'PC-UNKNOWN').map(pc => (
                                      <option key={pc} value={pc}>{pc}</option>
                                    ))}
                                    <option value="__custom__" className="text-indigo-400 font-bold bg-zinc-950">✏️ Type custom...</option>
                                  </select>
                                )}
                              </div>
                            </td>

                            {/* Game Column */}
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center">
                                {editingGameForUser === ia.username ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editGameValue}
                                      onChange={(e) => setEditGameValue(e.target.value)}
                                      className="bg-zinc-900 border border-indigo-500 text-[11px] rounded-lg px-2 py-1 text-zinc-150 focus:outline-none w-24 font-mono select-text"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const updated = importedAccounts.map(a => 
                                            a.username === ia.username ? { ...a, game: editGameValue.trim() || 'None' } : a
                                          );
                                          saveImportedAccounts(updated);
                                          setEditingGameForUser(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingGameForUser(null);
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = importedAccounts.map(a => 
                                          a.username === ia.username ? { ...a, game: editGameValue.trim() || 'None' } : a
                                        );
                                        saveImportedAccounts(updated);
                                        setEditingGameForUser(null);
                                      }}
                                      className="text-emerald-400 hover:text-emerald-300 text-xs px-1 font-bold"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingGameForUser(null)}
                                      className="text-rose-450 hover:text-rose-400 text-xs px-1 font-bold"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <select
                                    value={ia.game || 'None'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '__custom__') {
                                        setEditingGameForUser(ia.username);
                                        setEditGameValue(ia.game || '');
                                      } else {
                                        const updated = importedAccounts.map(a => 
                                          a.username === ia.username ? { ...a, game: val } : a
                                        );
                                        saveImportedAccounts(updated);
                                      }
                                    }}
                                    className="bg-zinc-950 border border-zinc-850 text-[11px] rounded-lg px-2.5 py-1 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer max-w-[125px]"
                                  >
                                    <option value="None">None</option>
                                    {Array.from(new Set([
                                      ...games.map(g => g.name),
                                      ...importedAccounts.map(a => a.game).filter(Boolean)
                                    ])).filter(g => g && g !== 'None' && g !== 'all').map(g => (
                                      <option key={g} value={g}>{g}</option>
                                    ))}
                                    <option value="__custom__" className="text-indigo-400 font-bold bg-zinc-950">✏️ Type custom...</option>
                                  </select>
                                )}
                              </div>
                            </td>

                            {/* Status Column */}
                            <td className="py-3 px-3 text-center">
                              <select
                                value={ia.status || 'unused'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = importedAccounts.map(a => 
                                    a.username === ia.username ? { ...a, status: val } : a
                                  );
                                  saveImportedAccounts(updated);
                                }}
                                className="bg-zinc-950 border border-zinc-855 text-[11px] rounded-lg px-2.5 py-1 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer"
                              >
                                <option value="unused">Unused</option>
                                <option value="banned">Banned</option>
                                {statusCategories.filter(cat => cat !== 'unused' && cat !== 'banned').map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </td>

                            {/* Row Action Copy / Trashes */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${ia.username}:${ia.pass || ''}:${ia.cookie || ''}`);
                                    setToastMessage(`Copied: ${ia.username}`);
                                    setTimeout(() => setToastMessage(null), 2500);
                                  }}
                                  className="p-1.5 bg-zinc-90 w-8 h-8 rounded-lg border border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
                                  title="Copy in user:pass:cookie format"
                                >
                                  🔑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = importedAccounts.filter(a => a.username !== ia.username);
                                    saveImportedAccounts(updated);
                                    setToastMessage(`Removed "${ia.username}" from account memory`);
                                    setTimeout(() => setToastMessage(null), 2500);
                                  }}
                                  className="p-1.5 bg-zinc-90 w-8 h-8 rounded-lg border border-zinc-850 hover:border-rose-900 text-zinc-500 hover:text-rose-450 transition cursor-pointer active:scale-95 flex items-center justify-center shrink-0"
                                  title="Delete account record"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-16 text-center flex flex-col items-center justify-center">
                    <span className="text-3xl block mb-2">📋</span>
                    <p className="text-zinc-305 font-bold text-xs">No records matched active filters</p>
                    <p className="text-zinc-500 text-[10px] mt-1 pr-1 max-w-sm">
                      Try resetting your search query or import more account rows above!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'storage' ? (
          /* Global Storage Tab Selector Panel */
          <div className="flex flex-col gap-6" id="storage-container">
            {/* Horizontal sub-tabs for Farm Storage vs Private/Custom Portfolios */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
              <div className="flex bg-zinc-950/40 p-1 rounded-xl border border-zinc-850/60 self-start">
                <button
                  onClick={() => setStorageSubTab('farm')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    storageSubTab === 'farm' ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md font-extrabold' : 'text-zinc-550 hover:text-zinc-350 bg-transparent border-transparent'
                  }`}
                  id="farm-storage-tab"
                >
                  <span>🚜</span> Farm, Sellers & Storages
                </button>
                <button
                  onClick={() => setStorageSubTab('portfolios')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    storageSubTab === 'portfolios' ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md font-extrabold' : 'text-zinc-550 hover:text-zinc-350 bg-transparent border-transparent'
                  }`}
                  id="portfolios-ledger-tab"
                >
                  <span>💼</span> Seller & Storage Logs
                </button>
                <button
                  onClick={() => setStorageSubTab('sql')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    storageSubTab === 'sql' ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md font-extrabold' : 'text-zinc-550 hover:text-zinc-350 bg-transparent border-transparent'
                  }`}
                  id="sql-backup-tab"
                >
                  <span>💾</span> SQL Export & Offline Searcher
                </button>
              </div>
            </div>

            {storageSubTab === 'farm' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
                {/* Left Panel: Unified Storage Registry Card with switcher tabs */}
                <div className="lg:col-span-6 flex flex-col gap-6">
                  
                  <div className="bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-5 flex flex-col gap-4">
                    {/* Switcher & Search Header in Card */}
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-zinc-850 pb-3 flex-wrap">
                      <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-900">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStorageSource('farm');
                            setSelectedHolderIndexes([]);
                            setLastClickedIndex(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            selectedStorageSource === 'farm'
                              ? 'bg-zinc-900 border border-zinc-800 text-white shadow font-black'
                              : 'text-zinc-500 hover:text-zinc-300 bg-transparent'
                          }`}
                        >
                          <span>🚜</span> Farm Storage
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStorageSource('trade');
                            setSelectedHolderIndexes([]);
                            setLastClickedIndex(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            selectedStorageSource === 'trade'
                              ? 'bg-zinc-900 border border-zinc-800 text-white shadow font-black'
                              : 'text-zinc-500 hover:text-zinc-300 bg-transparent'
                          }`}
                        >
                          <span>🤝</span> Trade Storage
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStorageSource('selling');
                            setSelectedHolderIndexes([]);
                            setLastClickedIndex(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            selectedStorageSource === 'selling'
                              ? 'bg-zinc-900 border border-zinc-800 text-white shadow font-black'
                              : 'text-zinc-500 hover:text-zinc-300 bg-transparent'
                          }`}
                        >
                          <span>💰</span> Selling Storage
                        </button>
                      </div>

                      {/* Integrated Quick Filter Search input */}
                      <div className="relative w-full xl:max-w-[190px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-650 w-3 h-3" />
                        <input
                          type="text"
                          placeholder="Filter units..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-850 hover:border-zinc-800 focus:border-indigo-650 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-650 focus:outline-none transition"
                        />
                        {search && (
                          <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-550 hover:text-white text-[10px] font-bold bg-zinc-900 px-1 rounded transition"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Active Registry Grid Content */}
                    <div>
                      {selectedStorageSource === 'farm' ? (
                        filteredStorageItems.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[580px] overflow-y-auto pr-1">
                            {filteredStorageItems.map((item) => {
                              const isSelected = selectedStorageItemName === item.name && selectedStorageSource === 'farm';
                              const rarityColorsMap = {
                                common: 'bg-zinc-950/30 border-zinc-900 hover:border-zinc-800',
                                uncommon: 'bg-emerald-950/10 border-emerald-950/20 text-emerald-300 hover:border-emerald-800/40',
                                rare: 'bg-blue-950/10 border-blue-950/20 text-blue-300 hover:border-blue-800/40',
                                epic: 'bg-purple-950/10 border-purple-950/20 text-purple-300 hover:border-purple-800/40',
                                legendary: 'bg-amber-950/10 border-amber-950/20 text-amber-300 hover:border-amber-800/40'
                              };
                              const colorClass = rarityColorsMap[item.rarity] || 'bg-zinc-950/30 border-zinc-900 hover:border-zinc-800';

                              return (
                                <div
                                  key={item.name}
                                  onClick={() => {
                                    setSelectedStorageItemName(item.name);
                                    setSelectedStorageSource('farm');
                                    setSelectedHolderIndexes([]);
                                    setLastClickedIndex(null);
                                  }}
                                  className={`aspect-square rounded-2xl border flex flex-col items-center justify-between p-3 cursor-pointer transition-all duration-150 ${
                                    isSelected
                                      ? 'bg-indigo-650/25 border-indigo-500 shadow-lg shadow-indigo-600/10 scale-102 font-extrabold text-white bg-indigo-950/20'
                                      : colorClass
                                  } group`}
                                >
                                  <div className="my-auto flex flex-col items-center justify-center p-1 min-h-[44px] w-full">
                                    <AssetImage
                                      rawName={item.rawName}
                                      fallbackEmoji={item.icon || '📦'}
                                      name={item.name}
                                      className="w-10 h-10 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                                    />
                                  </div>
                                  <div className="w-full text-center mt-auto">
                                    <span className="text-[10px] font-bold text-zinc-150 block truncate leading-tight px-0.5 group-hover:text-white font-sans text-xs">
                                      {item.name}
                                    </span>
                                    <span className="text-[9px] font-mono font-black text-indigo-400 block mt-0.5">
                                      x{item.totalQuantity.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-16 text-center border border-dashed border-zinc-850 rounded-xl">
                            <Inbox className="w-6 h-6 text-zinc-650 mx-auto mb-1.5" />
                            <p className="text-[11px] text-zinc-400 font-bold">No farming items logged</p>
                          </div>
                        )
                      ) : selectedStorageSource === 'trade' ? (
                        filteredTradeStorageItems.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[580px] overflow-y-auto pr-1">
                            {filteredTradeStorageItems.map((item) => {
                              const isSelected = selectedStorageItemName === item.name && selectedStorageSource === 'trade';
                              const rarityColorsMap = {
                                common: 'bg-zinc-950/30 border-zinc-900 hover:border-zinc-800',
                                uncommon: 'bg-emerald-950/10 border-emerald-950/20 text-emerald-300 hover:border-emerald-800/40',
                                rare: 'bg-blue-950/10 border-blue-950/20 text-blue-300 hover:border-blue-800/40',
                                epic: 'bg-purple-950/10 border-purple-950/20 text-purple-300 hover:border-purple-800/40',
                                legendary: 'bg-amber-950/10 border-amber-950/20 text-amber-300 hover:border-amber-800/40'
                              };
                              const colorClass = rarityColorsMap[item.rarity] || 'bg-zinc-950/30 border-zinc-900 hover:border-zinc-800';

                              return (
                                <div
                                  key={item.name}
                                  onClick={() => {
                                    setSelectedStorageItemName(item.name);
                                    setSelectedStorageSource('trade');
                                    setSelectedHolderIndexes([]);
                                    setLastClickedIndex(null);
                                  }}
                                  className={`aspect-square rounded-2xl border flex flex-col items-center justify-between p-3 cursor-pointer transition-all duration-150 ${
                                    isSelected
                                      ? 'bg-indigo-650/25 border-indigo-500 shadow-lg shadow-indigo-600/10 scale-102 font-extrabold text-white bg-indigo-950/20'
                                      : colorClass
                                  } group`}
                                >
                                  <div className="my-auto flex flex-col items-center justify-center p-1 min-h-[44px] w-full">
                                    <AssetImage
                                      rawName={item.rawName}
                                      fallbackEmoji={item.icon || '📦'}
                                      name={item.name}
                                      className="w-10 h-10 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                                    />
                                  </div>
                                  <div className="w-full text-center mt-auto">
                                    <span className="text-[10px] font-bold text-zinc-150 block truncate leading-tight px-0.5 group-hover:text-white font-sans text-xs">
                                      {item.name}
                                    </span>
                                    <span className="text-[9px] font-mono font-black text-indigo-400 block mt-0.5">
                                      x{item.totalQuantity.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-16 text-center border border-dashed border-zinc-850 rounded-xl">
                            <Inbox className="w-6 h-6 text-zinc-650 mx-auto mb-1.5" />
                            <p className="text-[11px] text-zinc-400 font-bold">No trading items logged</p>
                          </div>
                        )
                      ) : (
                        filteredSellingStorageItems.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[580px] overflow-y-auto pr-1">
                            {filteredSellingStorageItems.map((item) => {
                              const isSelected = selectedStorageItemName === item.name && selectedStorageSource === 'selling';
                              const rarityColorsMap = {
                                common: 'bg-zinc-950/30 border-zinc-900 hover:border-zinc-800',
                                uncommon: 'bg-emerald-950/10 border-emerald-950/20 text-emerald-300 hover:border-emerald-800/40',
                                rare: 'bg-blue-950/10 border-blue-950/20 text-blue-300 hover:border-blue-800/40',
                                epic: 'bg-purple-950/10 border-purple-950/20 text-purple-300 hover:border-purple-800/40',
                                legendary: 'bg-amber-950/10 border-amber-950/20 text-amber-300 hover:border-amber-800/40'
                              };
                              const colorClass = rarityColorsMap[item.rarity] || 'bg-zinc-950/30 border-zinc-900 hover:border-zinc-800';

                              return (
                                <div
                                  key={item.name}
                                  onClick={() => {
                                    setSelectedStorageItemName(item.name);
                                    setSelectedStorageSource('selling');
                                    setSelectedHolderIndexes([]);
                                    setLastClickedIndex(null);
                                  }}
                                  className={`aspect-square rounded-2xl border flex flex-col items-center justify-between p-3 cursor-pointer transition-all duration-150 ${
                                    isSelected
                                      ? 'bg-indigo-650/25 border-indigo-500 shadow-lg shadow-indigo-600/10 scale-102 font-extrabold text-white bg-indigo-950/20'
                                      : colorClass
                                  } group`}
                                >
                                  <div className="my-auto flex flex-col items-center justify-center p-1 min-h-[44px] w-full">
                                    <AssetImage
                                      rawName={item.rawName}
                                      fallbackEmoji={item.icon || '📦'}
                                      name={item.name}
                                      className="w-10 h-10 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                                    />
                                  </div>
                                  <div className="w-full text-center mt-auto">
                                    <span className="text-[10px] font-bold text-zinc-150 block truncate leading-tight px-0.5 group-hover:text-white font-sans text-xs">
                                      {item.name}
                                    </span>
                                    <span className="text-[9px] font-mono font-black text-indigo-400 block mt-0.5">
                                      x{item.totalQuantity.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-16 text-center border border-dashed border-zinc-850 rounded-xl">
                            <Inbox className="w-6 h-6 text-zinc-650 mx-auto mb-1.5" />
                            <p className="text-[11px] text-zinc-400 font-bold">No selling items logged</p>
                          </div>
                        )
                      )}
                    </div>

                  </div>
                </div>
            
                {/* Storage Ownership account split details view */}
                <div className="lg:col-span-6 bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-5 min-h-[400px] flex flex-col justify-between">
                  {selectedStorageItem ? (
                    <div className="flex flex-col h-full gap-5">
                      {/* Selected Item header info */}
                      <div className="border-b border-zinc-850 pb-4">
                        <div className="flex items-center gap-3.5 text-left">
                          <div className="w-14 h-14 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-2xl shrink-0 p-1">
                            <AssetImage
                              rawName={selectedStorageItem.rawName}
                              fallbackEmoji={selectedStorageItem.icon || '📦'}
                              name={selectedStorageItem.name}
                              className="w-12 h-12 object-contain filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-white capitalize leading-tight">
                                {selectedStorageItem.name}
                              </h4>
                              {selectedStorageItem.rarity !== 'common' && (
                                <span className={`text-[8px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded border bg-zinc-900/10 ${
                                  selectedStorageItem.rarity === 'legendary' ? 'text-amber-400 border-amber-900/30' :
                                  selectedStorageItem.rarity === 'epic' ? 'text-purple-400 border-purple-900/30' :
                                  selectedStorageItem.rarity === 'rare' ? 'text-blue-400 border-blue-900/30' :
                                  selectedStorageItem.rarity === 'uncommon' ? 'text-emerald-400 border-emerald-900/30' :
                                  'text-zinc-400 border-zinc-800'
                                }`}>
                                  {selectedStorageItem.rarity}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">
                              Aggregate Pooled Units: <span className="text-indigo-400 font-bold">{selectedStorageItem.totalQuantity.toLocaleString()}</span>
                            </p>
                          </div>
                        </div>
                      </div>
 
                      {/* List of holders with multi-select support */}
                      <div className="flex-1 space-y-2 max-h-[380px] overflow-y-auto pr-1">
                        <div className="flex items-center justify-between border-b border-zinc-850 pb-2 mb-3 flex-wrap gap-2 text-left">
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono font-semibold block">
                              {selectedStorageSource === 'farm' ? `Held By ${selectedStorageItem.accounts.length} Farm Accounts` :
                               selectedStorageSource === 'trade' ? `Held By ${selectedStorageItem.accounts.length} Trade Portfolios` :
                               `Held By ${selectedStorageItem.accounts.length} Selling Portfolios`}
                            </span>
                            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">
                              Left-click or right-click with <kbd className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-300 font-bold">Shift</kbd> / <kbd className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-300 font-bold">Ctrl</kbd> to multi-select. Right-click to copy.
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {selectedHolderIndexes.length > 0 && (
                              <>
                                <span className="text-[10px] text-indigo-400 font-mono font-bold animate-pulse mr-0.5">
                                  {selectedHolderIndexes.length} selected
                                </span>
                                <button
                                  onClick={handleCopySelectedUsernames}
                                  className="px-2 py-1 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded border border-indigo-500/30 font-mono transition active:scale-95 cursor-pointer"
                                  title="Copy selected usernames to clipboard"
                                >
                                  Copy Selected ({selectedHolderIndexes.length})
                                </button>
                              </>
                            )}
                            <button
                              onClick={handleCopyAllUsernames}
                              className="px-2 py-1 text-[10px] font-semibold bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-white text-zinc-400 rounded font-mono transition active:scale-95 cursor-pointer"
                            >
                              Copy All ({selectedStorageItem.accounts.length})
                            </button>
                          </div>
                        </div>

                        {selectedStorageItem.accounts.map((holder, index) => {
                          const age = Math.floor((new Date().getTime() - new Date(holder.updated_at).getTime()) / 1000);
                          const isOnline = selectedStorageSource === 'farm' ? age <= 300 : false;
                          const isSelected = selectedHolderIndexes.includes(index);

                          const farmAccountsList = [...accounts]
                            .filter(acc => acc.username !== '__UI_PRESENCE_HEARTBEAT__')
                            .sort((a, b) => a.username.localeCompare(b.username));

                          const isTransferringThis = transferringHolderIndex === index;

                          return (
                            <div key={index} className="flex flex-col gap-2 w-full">
                              <div 
                                onClick={(e) => handleHolderClick(e, index)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleHolderClick(e, index);
                                  setContextMenu({
                                    show: true,
                                    x: e.clientX,
                                    y: e.clientY
                                  });
                                }}
                                className={`flex flex-col md:flex-row md:items-center justify-between p-3.5 rounded-xl border transition select-none cursor-pointer text-left gap-3.5 ${
                                  isSelected 
                                    ? 'bg-indigo-600/15 border-indigo-500 shadow-md text-white shadow-indigo-600/5' 
                                    : 'bg-zinc-950/40 border-zinc-900 hover:border-zinc-800'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {selectedStorageSource === 'farm' && (
                                    <span className="relative flex h-2 w-2 shrink-0">
                                      {isOnline && (
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      )}
                                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                        isOnline ? 'bg-emerald-500' : 'bg-rose-655'
                                      }`}></span>
                                    </span>
                                  )}
      
                                  <div className="min-w-0 text-left flex-1">
                                    <span className="text-xs font-bold text-zinc-150 flex items-center gap-1.5 truncate">
                                      <span>{holder.username}</span>
                                      {selectedStorageSource === 'farm' && credentialsMap[holder.username.toLowerCase()] && (
                                        <span 
                                          className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded font-mono font-bold shrink-0 cursor-help"
                                          title="Matched credentials loaded"
                                        >
                                          🔑
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 font-mono block lowercase mt-0.5">
                                      {selectedStorageSource === 'farm' ? (
                                        (() => {
                                          const raw = holder.pc || 'any';
                                          let cleaned = raw.toLowerCase().replace(/pc\s*rig/gi, 'pc').replace(/pc-/gi, 'pc').replace(/\s+/g, '').replace(/_/g, '');
                                          if (!cleaned.startsWith('pc') && cleaned !== 'any') {
                                            cleaned = 'pc' + cleaned;
                                          }
                                          return cleaned;
                                        })()
                                      ) : (
                                        (() => {
                                          const isSelling = selectedStorageSource === 'selling';
                                          const tabCategory = isSelling ? 'Selling' : 'Trading';
                                          const categoryAccs = tradingAccounts.filter(acc => acc.type === tabCategory || acc.type === 'Both');
                                          const idx = categoryAccs.findIndex(acc => acc.name === holder.username);
                                          return idx > -1 
                                            ? `${isSelling ? 'seller' : 'storage'} ${idx + 1}`
                                            : (isSelling ? 'seller' : 'storage');
                                        })()
                                      )}
                                    </span>
                                  </div>
                                </div>
      
                                <div className="flex items-center gap-4 text-right justify-between md:justify-end shrink-0 w-full md:w-auto mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-900/60 font-mono">
                                  <div className="text-right ml-auto shrink-0" onClick={e => e.stopPropagation()}>
                                    {selectedStorageSource !== 'farm' ? (() => {
                                      const portfolio = tradingAccounts.find(acc => acc.name === holder.username);
                                      const category = selectedStorageSource === 'trade' ? 'Trading' : 'Selling';
                                      const itemInPortfolio = portfolio?.items?.find((i: any) => i.unitName === selectedStorageItemName && i.category === category);
                                      if (!portfolio || !itemInPortfolio) {
                                        return <span className="text-xs font-mono font-black text-indigo-400">x{holder.quantity.toLocaleString()} units</span>;
                                      }
                                      return (
                                        <div className="flex items-center gap-1 justify-end">
                                          <div className="flex items-center border border-zinc-800 rounded overflow-hidden">
                                            <button
                                              onClick={e => { e.stopPropagation(); handleUpdateManualUnitQty(portfolio.id, itemInPortfolio.id, Math.max(0, holder.quantity - 1)); }}
                                              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-sm font-bold transition leading-none select-none"
                                            >−</button>
                                            <input
                                              key={`${portfolio.id}-${itemInPortfolio.id}-${holder.quantity}`}
                                              type="number"
                                              defaultValue={holder.quantity}
                                              min={0}
                                              onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                  const n = parseInt((e.target as HTMLInputElement).value);
                                                  if (!isNaN(n) && n >= 0) handleUpdateManualUnitQty(portfolio.id, itemInPortfolio.id, n);
                                                  (e.target as HTMLInputElement).blur();
                                                }
                                              }}
                                              onBlur={e => {
                                                const n = parseInt(e.target.value);
                                                if (!isNaN(n) && n >= 0 && n !== holder.quantity) handleUpdateManualUnitQty(portfolio.id, itemInPortfolio.id, n);
                                              }}
                                              style={{ textAlign: 'center' }}
                                              className="w-12 bg-zinc-900 text-xs font-mono font-black text-indigo-400 focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                            />
                                            <button
                                              onClick={e => { e.stopPropagation(); handleUpdateManualUnitQty(portfolio.id, itemInPortfolio.id, holder.quantity + 1); }}
                                              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-sm font-bold transition leading-none select-none"
                                            >+</button>
                                          </div>
                                          <span className="text-[10px] text-zinc-500 font-mono">units</span>
                                        </div>
                                      );
                                    })() : (
                                      <span className="text-xs font-mono font-black text-indigo-400">x{holder.quantity.toLocaleString()} units</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center my-auto py-12">
                      <span className="text-3xl block mb-2.5">🔍</span>
                      <p className="text-zinc-305 font-bold text-xs">Select a stored item type</p>
                      <p className="text-zinc-500 text-[10px] mt-1 max-w-xs mx-auto">
                        Choose one of the unique item types listed in the registries on the left to see which client accounts or custom portfolios have them.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : storageSubTab === 'portfolios' ? (
              /* Custom Themed Portfolio Ledger Panel */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in" id="trading-selling-ledger-grid">
                
                {/* Left Panel: Accounts list & registration */}
                <div className="lg:col-span-4 bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-5 flex flex-col gap-4 text-left">
                  
                  {/* Category switcher tab maker */}
                  <div className="bg-zinc-950 p-1 rounded-xl border border-zinc-900 flex items-center justify-between gap-1 w-full shrink-0">
                    <button
                      onClick={() => setPortfolioActiveTab('trade')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                        portfolioActiveTab === 'trade' ? 'bg-zinc-900 text-white shadow font-extrabold' : 'text-zinc-500 hover:text-zinc-350 bg-transparent'
                      }`}
                    >
                      🤝 Storage Portfolio
                    </button>
                    <button
                      onClick={() => setPortfolioActiveTab('selling')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                        portfolioActiveTab === 'selling' ? 'bg-zinc-900 text-white shadow font-extrabold' : 'text-zinc-500 hover:text-zinc-350 bg-transparent'
                      }`}
                    >
                      💰 Seller Portfolio
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold font-display text-zinc-100 flex items-center gap-1.5 justify-start">
                      <span>{portfolioActiveTab === 'selling' ? '💰' : '🤝'}</span> {portfolioActiveTab === 'selling' ? 'Seller Accounts' : 'Storage Accounts'}
                    </h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {portfolioActiveTab === 'selling' 
                        ? `Seller profiles registered for selling stock (${tradingAccounts.filter(acc => acc.type === 'Selling' || acc.type === 'Both').length})` 
                        : `Storage profiles registered for storage stock (${tradingAccounts.filter(acc => acc.type === 'Trading' || acc.type === 'Both').length})`}
                    </p>
                  </div>

                  {/* Add Trading Account Form */}
                  <div className="bg-zinc-950/30 border border-zinc-90 w-full bg-zinc-950 border border-zinc-900 p-3.5 rounded-xl flex flex-col gap-3">
                    <span className="text-[9.5px] uppercase tracking-wider font-extrabold font-mono text-zinc-400 block mb-0.5 text-left">
                      {portfolioActiveTab === 'selling' ? 'Register Seller Profile' : 'Register Storage Profile'}
                    </span>
                    <input
                      type="text"
                      placeholder={portfolioActiveTab === 'selling' ? "e.g. Seller 1..." : "e.g. Storage 1..."}
                      value={newTradingAccountName}
                      onChange={(e) => setNewTradingAccountName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTradingAccount(); }}
                      className="w-full bg-zinc-950 border border-zinc-855 focus:border-indigo-650 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-650 focus:outline-none transition font-semibold"
                    />
                    
                    <button
                      onClick={handleCreateTradingAccount}
                      className={`w-full text-white font-black text-[10px] uppercase tracking-widest py-2 rounded-lg transition active:scale-95 cursor-pointer mt-1 ${
                        portfolioActiveTab === 'selling' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'
                      }`}
                    >
                      + Create {portfolioActiveTab === 'selling' ? 'Seller Profile' : 'Storage Profile'}
                    </button>
                  </div>

                  {/* Registered accounts list */}
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {(() => {
                      const tabCategory = portfolioActiveTab === 'selling' ? 'Selling' : 'Trading';
                      const filteredTradingAccounts = tradingAccounts.filter(
                        (acc) => acc.type === tabCategory || acc.type === 'Both'
                      );

                      return filteredTradingAccounts.length > 0 ? (
                        filteredTradingAccounts.map((acc) => {
                          const isSelected = selectedTradingAccountId === acc.id;
                          const itemsForTab = (acc.items || []).filter((item: any) => item.category === tabCategory);
                          const uniqueUnitsCount = itemsForTab.length;
                          const totalUnitsQty = itemsForTab.reduce((sum: number, i: any) => sum + i.quantity, 0);

                          return (
                            <div
                              key={acc.id}
                              onClick={() => setSelectedTradingAccountId(acc.id)}
                              className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer group ${
                                isSelected
                                  ? portfolioActiveTab === 'selling'
                                    ? 'bg-emerald-650/15 border-emerald-500 text-white shadow-md'
                                    : 'bg-indigo-650/15 border-indigo-500 text-white shadow-md'
                                  : 'bg-zinc-950/40 border-zinc-900 hover:border-zinc-850 text-zinc-350 hover:text-white'
                              }`}
                            >
                              <div className="flex flex-col gap-1 min-w-0 pr-2 text-left">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[11.5px] font-bold leading-tight truncate ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                                    {acc.name}
                                  </span>
                                  <span className={`text-[7px] font-black uppercase tracking-wider font-mono px-1 py-0.2 rounded border ${
                                    acc.type === 'Trading' ? 'bg-indigo-950/30 text-indigo-400 border border-indigo-900/30' :
                                    acc.type === 'Selling' ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30' :
                                    'bg-amber-955/20 text-amber-500 border border-amber-900/20'
                                  }`}>
                                    {acc.type}
                                  </span>
                                </div>
                                <span className="text-[9px] text-zinc-500 font-mono">
                                  {uniqueUnitsCount} items logged ({totalUnitsQty} units)
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTradingAccount(acc.id);
                                }}
                                className="text-zinc-650 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/5 transition cursor-pointer shrink-0 opacity-40 group-hover:opacity-100"
                                title="Delete Account Record"
                              >
                                🗑️
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-12 border border-dashed border-zinc-850 rounded-xl">
                          <span className="text-xl block mb-1">🏦</span>
                          <p className="text-[10px] text-zinc-400 font-bold">No Custom {portfolioActiveTab === 'selling' ? 'Selling' : 'Trading'} Portfolios</p>
                          <p className="text-[9px] text-zinc-650 mt-0.5 font-sans leading-relaxed">Add a portfolio nickname above to start registering catalog registry!</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Panel: Manually logged units inside selected account */}
                <div className="lg:col-span-8 bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-5 min-h-[450px] flex flex-col justify-between">
                  {(() => {
                    const currentAcc = tradingAccounts.find(acc => acc.id === selectedTradingAccountId);
                    if (!currentAcc) {
                      return (
                        <div className="flex flex-col items-center justify-center text-center my-auto py-12">
                          <span className="text-3xl block mb-2.5">🤝</span>
                          <p className="text-zinc-350 font-bold text-xs">Select or Create a Trading Account</p>
                          <p className="text-zinc-550 text-[10px] mt-1 max-w-sm mx-auto">
                            Choose an account from the left registry panel, or log a brand new custom trade account profile to start depositing manual unit catalogs!
                          </p>
                        </div>
                      );
                    }

                    // Filter items on this account by Search and Category
                    const localFilteredItems = (currentAcc.items || []).filter((item: any) => {
                      if (ledgerCategoryFilter !== 'all' && item.category !== ledgerCategoryFilter) return false;
                      if (ledgerUnitSearch.trim()) {
                        return item.unitName.toLowerCase().includes(ledgerUnitSearch.toLowerCase().trim());
                      }
                      return true;
                    });

                    return (
                      <div className="flex flex-col gap-5 h-full">
                        {/* Selected Trading Account Header */}
                        <div className="border-b border-zinc-900 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-left">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white capitalize leading-tight">
                                {currentAcc.name}
                              </h4>
                              {currentAcc.type && (
                                <span className="text-[8px] font-extrabold uppercase tracking-widest font-mono text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded bg-zinc-950/20">
                                  {currentAcc.type} Ledger
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-1">
                              Catalog Size: <span className="text-indigo-455 text-indigo-400 font-bold">{localFilteredItems.length} types</span> logged • Unit Total: <span className="text-emerald-455 text-emerald-400 font-bold font-mono">{(localFilteredItems).reduce((sum, i) => sum + i.quantity, 0)} units</span>
                            </p>
                          </div>

                          <button
                            onClick={() => handleDeleteTradingAccount(currentAcc.id)}
                            className="text-[9px] font-bold text-zinc-400 hover:text-rose-400 border border-zinc-850 rounded-lg px-2.5 py-1.5 hover:border-rose-900/40 transition cursor-pointer self-start"
                          >
                            ⚠️ Delete Account Profile
                          </button>
                        </div>

                        {/* Storing terminal form to search and append new items */}
                        <div className="bg-zinc-950/45 border border-zinc-900 rounded-xl p-4 flex flex-col gap-4 relative text-left overflow-hidden">
                          <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5 flex-wrap gap-2">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold font-mono text-zinc-300 block">
                              📥 Deposit Unit Manually
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] uppercase font-mono text-zinc-550">Target Account:</span>
                              <span className="text-[10px] font-bold text-indigo-400 font-mono">
                                {currentAcc ? currentAcc.name : 'None Selected'}
                              </span>
                              <span className="text-[9px] bg-zinc-900 border border-zinc-850 px-1.5 py-0.5 rounded font-mono font-bold text-zinc-400">
                                {portfolioActiveTab === 'selling' ? 'Seller 💰' : 'Storage 🤝'}
                              </span>
                            </div>
                          </div>

                          {/* Search bar input to filter the units database */}
                          <div className="relative font-sans">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-650 w-3.5 h-3.5" />
                            <input
                              type="text"
                              placeholder="Search unit to deposit (e.g. Tomato, Sunflower, Cactus)..."
                              value={manualUnitSearch}
                              onChange={(e) => setManualUnitSearch(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-850 hover:border-zinc-800 focus:border-indigo-650 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none transition font-semibold"
                            />
                            {manualUnitSearch && (
                              <button
                                onClick={() => setManualUnitSearch('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-[10px] font-bold bg-zinc-900 hover:bg-zinc-800 px-1.5 py-0.5 rounded transition cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          {/* Rarity filter buttons */}
                          <div className="flex flex-wrap gap-1">
                            {([
                              { code: 'ra_common',    label: 'Common',    cls: 'text-zinc-400 border-zinc-700 data-[on]:bg-zinc-700 data-[on]:text-white' },
                              { code: 'ra_uncommon',  label: 'Uncommon',  cls: 'text-green-400 border-green-800/50 data-[on]:bg-green-900/60 data-[on]:text-green-200' },
                              { code: 'ra_rare',      label: 'Rare',      cls: 'text-blue-400 border-blue-800/50 data-[on]:bg-blue-900/60 data-[on]:text-blue-200' },
                              { code: 'ra_epic',      label: 'Epic',      cls: 'text-purple-400 border-purple-800/50 data-[on]:bg-purple-900/60 data-[on]:text-purple-200' },
                              { code: 'ra_legendary', label: 'Legendary', cls: 'text-yellow-400 border-yellow-800/50 data-[on]:bg-yellow-900/60 data-[on]:text-yellow-200' },
                              { code: 'ra_exclusive', label: 'Exclusive', cls: 'text-fuchsia-400 border-fuchsia-800/50 data-[on]:bg-fuchsia-900/60 data-[on]:text-fuchsia-200' },
                              { code: 'ra_godly',     label: 'Godly',     cls: 'text-rose-400 border-rose-800/50 data-[on]:bg-rose-900/60 data-[on]:text-rose-200' },
                            ] as const).map(r => {
                              const on = depositRarityFilter.includes(r.code);
                              return (
                                <button
                                  key={r.code}
                                  data-on={on ? '' : undefined}
                                  onClick={() => setDepositRarityFilter(prev =>
                                    prev.includes(r.code) ? prev.filter(x => x !== r.code) : [...prev, r.code]
                                  )}
                                  className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border rounded-md transition cursor-pointer select-none ${r.cls} ${on ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
                                >
                                  {r.label}
                                </button>
                              );
                            })}
                            {depositRarityFilter.length > 0 && (
                              <button
                                onClick={() => setDepositRarityFilter([])}
                                className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border border-zinc-700 rounded-md text-zinc-500 hover:text-white transition cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          {/* Matching search unit cards - Grid layout! */}
                          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[300px] overflow-y-auto pr-0.5">
                            {searchedGTDUnits.length > 0 ? (
                              searchedGTDUnits.map((unit) => {
                                const rarityInfo = getRarityDetails(unit.Rarity || 'ra_common');
                                return (
                                  <div
                                    key={unit.ID}
                                    onClick={() => { setDepositPopupUnit(unit); setDepositQtyStr(''); }}
                                    className="aspect-square bg-zinc-950/70 border border-zinc-900 hover:border-zinc-700 rounded-xl p-2 flex flex-col items-center justify-center cursor-pointer hover:scale-[1.04] active:scale-[0.97] transition gap-1"
                                  >
                                    <AssetImage rawName={unit.ID} fallbackEmoji="📦" className="w-7 h-7 object-contain drop-shadow" />
                                    <div className="min-w-0 w-full text-center">
                                      <p className="text-[9px] text-zinc-200 font-black truncate leading-tight" title={unit.Name}>{unit.Name}</p>
                                      <span className="text-[7px] uppercase tracking-wider font-extrabold font-mono block" style={{ color: rarityInfo.text }}>{rarityInfo.label}</span>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="col-span-full py-8 text-center text-zinc-650 text-[10px] font-mono italic">
                                No units found. Try searching something else!
                              </div>
                            )}
                          </div>

                          {/* Deposit popup — absolute within this container */}
                          {depositPopupUnit && (() => {
                            const parsedQty = Math.max(1, parseInt(depositQtyStr) || 1);
                            const dec = () => setDepositQtyStr(String(Math.max(1, parsedQty - 1)));
                            const inc = () => setDepositQtyStr(String(parsedQty + 1));
                            const submit = () => { handleAddManualUnitDirect(depositPopupUnit, parsedQty); setDepositPopupUnit(null); };
                            return (
                              <div
                                className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/92 rounded-xl"
                                onClick={() => setDepositPopupUnit(null)}
                              >
                                <div
                                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-44 shadow-2xl flex flex-col gap-3"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <p className="text-xs font-black text-white text-center leading-snug">{depositPopupUnit.Name}</p>
                                  <div className="flex items-center border border-zinc-800 rounded-lg overflow-hidden">
                                    <button onClick={dec} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold transition select-none leading-none">−</button>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={depositQtyStr}
                                      autoFocus
                                      onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setDepositQtyStr(v); }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') submit();
                                        else if (e.key === 'ArrowUp') { e.preventDefault(); inc(); }
                                        else if (e.key === 'ArrowDown') { e.preventDefault(); dec(); }
                                      }}
                                      style={{ textAlign: 'center' }}
                                      className="flex-1 bg-zinc-900 text-sm font-black text-white focus:outline-none py-2"
                                    />
                                    <button onClick={inc} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold transition select-none leading-none">+</button>
                                  </div>
                                  <button
                                    onClick={submit}
                                    className={`w-full text-xs font-black uppercase py-2 rounded-lg transition cursor-pointer active:scale-[0.97] text-white ${portfolioActiveTab === 'selling' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                                  >Add</button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Stored ledger units search/display container */}
                        <div className="flex-1 flex flex-col gap-3 min-h-[220px]">
                          <div className="flex items-center justify-between border-b border-zinc-900 pb-2 flex-wrap gap-2 text-left">
                            <span className="text-[10px] text-zinc-450 uppercase tracking-wider font-mono font-bold block">
                              Associated Unit Catalog ({localFilteredItems.length} types)
                            </span>
                            
                            {/* Inner catalogue search */}
                            <div className="relative w-full max-w-[200px]">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-650 w-2.5 h-2.5" />
                              <input
                                type="text"
                                placeholder="Search logged stock..."
                                value={ledgerUnitSearch}
                                onChange={(e) => setLedgerUnitSearch(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-900 rounded-lg pl-7.5 pr-2 py-1 text-[10.5px] text-zinc-300 placeholder-zinc-650 focus:outline-none"
                              />
                            </div>
                          </div>

                          {localFilteredItems.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-2.5 max-h-[300px] overflow-y-auto pr-1 text-left">
                              {localFilteredItems.map((item: any) => {
                                const matchingGTD = gtdUnitsList.find(u => u.ID === item.unitId || u.Name === item.unitName);
                                const rarityCode = matchingGTD?.Rarity || 'ra_common';
                                
                                const categoryColorClass = 
                                  item.category === 'Trading' 
                                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' 
                                    : 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20';

                                const cardBorder = 
                                  rarityCode === 'ra_common' ? 'border-zinc-900' :
                                  rarityCode === 'ra_uncommon' ? 'border-emerald-950/20' :
                                  rarityCode === 'ra_rare' ? 'border-blue-950/20' :
                                  rarityCode === 'ra_epic' ? 'border-purple-950/20' :
                                  rarityCode === 'ra_exclusive' ? 'border-fuchsia-500/20' :
                                  rarityCode === 'ra_godly' ? 'border-rose-500/20' :
                                  'border-amber-955/20';

                                return (
                                  <div
                                    key={item.id}
                                    className={`aspect-square rounded-2xl border bg-zinc-950/30 ${cardBorder} flex flex-col items-center justify-between p-3.5 relative group hover:border-zinc-700 hover:scale-102 transition duration-150`}
                                  >
                                    {/* Action quick click trash */}
                                    <button
                                      onClick={() => handleDeleteManualUnit(currentAcc.id, item.id)}
                                      className="absolute top-2 right-2 text-zinc-500 hover:text-rose-455 text-rose-450 text-[11px] p-1 hover:bg-rose-500/10 rounded transition cursor-pointer opacity-0 group-hover:opacity-100"
                                      title="Remove entry"
                                    >
                                      ✕
                                    </button>

                                    {/* Item Symbol */}
                                    <div className="my-auto flex flex-col items-center justify-center p-1 min-h-[44px]">
                                      <AssetImage
                                        rawName={item.unitId}
                                        fallbackEmoji="📦"
                                        className="w-10 h-10 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                                      />
                                    </div>

                                    {/* Item Info catalog */}
                                    <div className="w-full text-center mt-auto flex flex-col gap-1">
                                      <span className="text-[10px] font-extrabold text-zinc-150 block truncate leading-tight mt-1" title={item.unitName}>
                                        {item.unitName}
                                      </span>
                                      
                                      {/* Transaction purpose badge & quick count changer */}
                                      <div className="flex items-center justify-between gap-1 border-t border-zinc-900/60 pt-1.5 mt-0.5 w-full">
                                        <span className={`text-[7px] font-black uppercase tracking-wider font-mono px-1 py-0.2 rounded border ${categoryColorClass}`}>
                                          {item.category === 'Trading' ? 'Trade' : 'Sell'}
                                        </span>
                                        
                                        <div className="flex items-center gap-1 select-none shrink-0 font-mono">
                                          <button
                                            onClick={() => handleUpdateManualUnitQty(currentAcc.id, item.id, item.quantity - 1)}
                                            className="w-3.5 h-3.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-705 text-[8px] flex items-center justify-center rounded select-none cursor-pointer text-zinc-500 hover:text-white"
                                          >
                                            -
                                          </button>
                                          <span className="text-[9px] font-mono font-black text-indigo-400 px-0.5 min-w-[14px]">
                                            x{item.quantity}
                                          </span>
                                          <button
                                            onClick={() => handleUpdateManualUnitQty(currentAcc.id, item.id, item.quantity + 1)}
                                            className="w-3.5 h-3.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-705 text-[8px] flex items-center justify-center rounded select-none cursor-pointer text-zinc-500 hover:text-white"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="py-12 text-center border border-dashed border-zinc-850 rounded-xl my-auto">
                              <Inbox className="w-6 h-6 text-zinc-650 mx-auto mb-2" />
                              <p className="text-[10px] text-zinc-400 font-bold">Catalogue Ledger is empty</p>
                              <p className="text-[9px] text-zinc-650 mt-0.5">Use the "Deposit Unit manually" form above to insert logs!</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>
            ) : (
              /* SQL Export & Interactive Standalone Offline Searcher Generator Panel */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left animate-fade-in" id="sql-export-tab-panel">
                
                {/* Left Panel: SQL Script Generator & preview (7 cols) */}
                <div className="lg:col-span-7 flex flex-col gap-5">
                  
                  {/* Supabase Connection Setup Panel */}
                  <div className="bg-zinc-905 border border-emerald-500/15 rounded-2xl p-5 flex flex-col gap-4 text-left shadow-lg">
                    <div className="flex items-center gap-2.5 border-b border-zinc-900 pb-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 flex items-center justify-center text-base">
                        ☁️
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-zinc-100 uppercase tracking-wide">Multi-PC Sync Connection settings</h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Set up your own Supabase project in any browser to synchronize and view inventories across other PCs.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* URL input */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] uppercase tracking-wider font-extrabold font-mono text-zinc-400">
                            Supabase URL
                          </label>
                          <span className="text-[8px] text-zinc-650 font-mono">Project API Endpoint</span>
                        </div>
                        <input
                          type="text"
                          value={supabaseSetupUrl}
                          onChange={(e) => setSupabaseSetupUrl(e.target.value)}
                          placeholder="https://your-project.supabase.co"
                          className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 text-xs text-zinc-250 font-sans outline-none focus:border-indigo-600 transition"
                        />
                      </div>

                      {/* Anon key input */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] uppercase tracking-wider font-extrabold font-mono text-zinc-400">
                            Supabase Anon/Public Key
                          </label>
                          <span className="text-[8px] text-zinc-650 font-mono">Row Policy Permitted Key</span>
                        </div>
                        <input
                          type="text"
                          value={supabaseSetupKey}
                          onChange={(e) => setSupabaseSetupKey(e.target.value)}
                          placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                          className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 text-[10.5px] text-zinc-250 font-mono outline-none focus:border-indigo-600 transition truncate"
                        />
                      </div>
                    </div>

                    {schemaTablesMissing && (
                      <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3.5 flex flex-col gap-2">
                        <div className="flex items-start gap-2.5">
                          <span className="text-base text-amber-500">⚠️</span>
                          <div>
                            <span className="text-[10.5px] font-extrabold text-amber-400 block uppercase tracking-wide">
                              Relational Schema Tables Missing in Database!
                            </span>
                            <span className="text-[10px] text-zinc-400 block mt-0.5 leading-relaxed">
                              Required sharing tables (<code className="text-zinc-200 font-mono text-[9px] bg-zinc-950 px-1 py-0.5 rounded border border-zinc-850">{schemaTablesStatusText}</code>) do not exist yet on this custom Supabase connection. Copy and run the generated SQL Schema in your Supabase SQL Editor to resolve this error.
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 border-t border-amber-500/10 pt-2.5 mt-0.5 ml-6">
                          <button
                            onClick={() => {
                              setSqlDialect('supabase');
                              const element = document.getElementById('supabase-setup-guide-box');
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth' });
                              } else {
                                setToastMessage("Scroll to the 'Professional SQL Database Exporter' below to copy the tables setup SQL code!");
                                setTimeout(() => setToastMessage(null), 5000);
                              }
                            }}
                            className="bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black border border-amber-500/20 hover:border-transparent font-extrabold px-3 py-1.5 rounded-lg text-[9.5px] uppercase tracking-wide transition active:scale-98 cursor-pointer"
                          >
                            Get Setup SQL Code Below
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => handleConnectSupabase(supabaseSetupUrl, supabaseSetupKey)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold py-2 px-4 rounded-xl text-[11px] uppercase tracking-wider transition active:scale-98 cursor-pointer shadow-md"
                      >
                        ⚡ Reconnect & Save Locally
                      </button>
                      <button
                        onClick={handleResetSupabase}
                        className="bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 text-[10px] text-zinc-400 hover:text-white py-2 px-3.5 rounded-xl font-extrabold uppercase transition cursor-pointer"
                        title="Reset connection to default collective demo database"
                      >
                        Reset Demo DB
                      </button>
                    </div>
                  </div>

                  {/* Schema Exporter Card & preview */}
                  <div id="supabase-setup-guide-box" className="bg-zinc-900/10 border border-zinc-850/80 rounded-2xl p-6 flex flex-col gap-5">
                    <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-zinc-100 flex items-center gap-2">
                          <Database className="w-4 h-4 text-indigo-400" /> Professional SQL Database Exporter
                        </h3>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Convert live client stats and custom farm inventories into highly optimized SQL scripts.
                        </p>
                      </div>
                    </div>

                    {/* SQL Configuration options and Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Dialect Switcher Option */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] uppercase tracking-wider font-extrabold font-mono text-zinc-500">
                          Choose SQL Database Dialect
                        </label>
                        <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-900 gap-1 flex-wrap sm:flex-nowrap">
                          {([ 'supabase', 'sqlite', 'postgres', 'mysql' ] as const).map((d) => (
                            <button
                              key={d}
                              onClick={() => {
                                setSqlDialect(d);
                                setToastMessage(`Switched SQL preview template to ${d.toUpperCase()}`);
                                setTimeout(() => setToastMessage(null), 2000);
                              }}
                              className={`flex-1 py-1 px-1 rounded-lg text-[9px] font-mono font-black uppercase transition-all cursor-pointer ${
                                sqlDialect === d 
                                  ? 'bg-indigo-600 font-extrabold text-white shadow' 
                                  : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Stats summary inside list */}
                      <div className="bg-zinc-950/45 border border-zinc-900 rounded-xl p-3 flex flex-col justify-center gap-1">
                        <span className="text-[8.5px] uppercase tracking-wider font-extrabold font-mono text-zinc-500 block">Backup Content Stats</span>
                        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-zinc-400">
                          <span>Farm Accounts:</span>
                          <span className="text-indigo-400">{accounts.length}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-zinc-400">
                          <span>Portfolio Profiles:</span>
                          <span className="text-emerald-400">{tradingAccounts.length}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick SQL export action buttons triggers */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-1">
                      <button
                        onClick={() => {
                          const sqlText = generateSqlBackup(sqlDialect);
                          navigator.clipboard.writeText(sqlText);
                          setCopiedSql(true);
                          setToastMessage("Successfully copied relational SQL backup to clipboard!");
                          setTimeout(() => {
                            setCopiedSql(false);
                            setToastMessage(null);
                          }, 2500);
                        }}
                        className="flex items-center justify-center gap-2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition active:scale-98 cursor-pointer"
                      >
                        {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedSql ? 'SQL Script Copied!' : 'Copy SQL Script'}
                      </button>

                      <button
                        onClick={() => {
                          const sqlText = generateSqlBackup(sqlDialect);
                          const fileName = `gtd_storage_backup_${sqlDialect}_${new Date().toISOString().split('T')[0]}.sql`;
                          const blob = new Blob([sqlText], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = fileName;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          
                          setToastMessage(`Downloaded SQL script file!`);
                          setTimeout(() => setToastMessage(null), 2500);
                        }}
                        className="flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-100 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition active:scale-98 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white" />
                        Download .SQL file
                      </button>
                    </div>

                    {/* Relational Table setup guide */}
                    <div className="bg-zinc-950/30 border border-zinc-900 p-3.5 rounded-xl text-[10.5px] leading-relaxed text-zinc-400">
                      <span className="font-extrabold text-amber-500 mr-1.5">⚠️ DB Restore & Sync Info:</span>
                      {sqlDialect === 'supabase' ? (
                        <span>This script defines the official <code className="text-zinc-200 font-mono text-[9px] bg-zinc-900 px-1 rounded">accounts</code> table with a JSONB <code className="text-zinc-200 font-mono text-[9px] bg-zinc-900 px-1 rounded">inventory</code> column, configures Row Level Security (RLS) policies, and sets up transaction replicas. run this in your Supabase SQL Editor so other PCs can sync data to it!</span>
                      ) : (
                        <span>This script defines tables named <code className="text-zinc-200 font-mono text-[9px] bg-zinc-900 px-1 rounded">farm_accounts</code>, <code className="text-zinc-200 font-mono text-[9px] bg-zinc-900 px-1 rounded">farm_inventory</code>, <code className="text-zinc-200 font-mono text-[9px] bg-zinc-900 px-1 rounded">custom_portfolios</code>, and <code className="text-zinc-200 font-mono text-[9px] bg-zinc-900 px-1 rounded">portfolio_items</code>. Execute the generated text in any secure standard client to explore and execute direct queries!</span>
                      )}
                    </div>

                    {/* SQL Live syntax previewer container */}
                    <div className="flex flex-col gap-1.5 mt-1">
                      <span className="text-[9px] uppercase tracking-wider font-extrabold font-mono text-zinc-500">Live SQL Code Preview ({sqlDialect.toUpperCase()})</span>
                      <div className="relative group/code border border-zinc-900 hover:border-zinc-800 rounded-xl bg-zinc-950 p-4 font-mono text-[10px] leading-relaxed text-zinc-350 max-h-[290px] overflow-y-auto overflow-x-auto text-left select-text scrollbar-thin">
                        <pre className="whitespace-pre-wrap">{generateSqlBackup(sqlDialect)}</pre>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right Panel: Standalone HTML offline checker file builder (5 cols) */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  {/* Visual High contrast generator card */}
                  <div className="bg-gradient-to-br from-indigo-950/20 to-zinc-950 border border-indigo-500/15 rounded-3xl p-6 flex flex-col gap-5 text-left relative overflow-hidden group shadow-xl">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-600/5 blur-[90px] rounded-full pointer-events-none group-hover:bg-indigo-600/5 transition" />
                    
                    <div className="flex items-start justify-between">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-xl shrink-0">
                        🖥️
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                        Instant Portable App
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                        Standalone Multi-PC Offline Finder
                      </h4>
                      <p className="text-[11.5px] text-zinc-400 font-normal leading-relaxed mt-1.5">
                        Download a <strong>completely self-contained interactive web file (.html)</strong> containing your active inventory data backups embedded in the file.
                      </p>
                    </div>

                    {/* Features checklist visual map */}
                    <div className="space-y-3 border-t border-zinc-900 pt-4 text-xs">
                      <div className="flex items-start gap-2.5">
                        <span className="text-indigo-400 mt-0.5 font-bold font-mono">✦</span>
                        <p className="text-zinc-350 font-medium font-sans">
                          <strong>No installation required:</strong> Just double-click the downloaded file on <strong>any PC or mobile phone</strong> to open it immediately! No internet or backend setup.
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="text-indigo-400 mt-0.5 font-bold font-mono">✦</span>
                        <p className="text-zinc-350 font-medium font-sans">
                          <strong>Built-in responsive layout:</strong> Beautiful modern dark dashboard matching this theme with powerful, rapid Client-side text searching.
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="text-indigo-400 mt-0.5 font-bold font-mono">✦</span>
                        <p className="text-zinc-350 font-medium font-sans">
                          <strong>Local Filter & Highlight Engine:</strong> Easily filter holdings by Farm, custom Trading stocks, or custom Selling stock ledgers instantly.
                        </p>
                      </div>
                    </div>

                    {/* Generate Portable HTML download button trigger */}
                    <button
                      onClick={() => {
                        const htmlContent = generateOfflineHtmlBackup();
                        const fileName = `gtd_offline_finder_${new Date().toISOString().split('T')[0]}.html`;
                        
                        const blob = new Blob([htmlContent], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                        setCopiedHtml(true);
                        setToastMessage("Standalone HTML offline lookup tool downloaded successfully!");
                        setTimeout(() => {
                          setCopiedHtml(false);
                          setToastMessage(null);
                        }, 2550);
                      }}
                      className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-indigo-600 to-violet-650 hover:from-indigo-500 hover:to-violet-550 text-white font-black text-xs uppercase tracking-widest py-3 px-5 rounded-2xl shadow-lg shadow-indigo-600/10 cursor-pointer active:scale-98 transition duration-150 mt-2"
                    >
                      <Download className="w-4 h-4 text-zinc-150" />
                      {copiedHtml ? 'Downloaded Standalone Tool!' : 'Download Standalone .HTML App'}
                    </button>
                  </div>

                  {/* Usage directions guide */}
                  <div className="bg-zinc-950/10 border border-zinc-850 p-4.5 rounded-2xl text-[10.5px] leading-relaxed text-zinc-400 flex gap-3 text-left">
                    <span className="text-base shrink-0 select-none">💡</span>
                    <div>
                      <span className="font-extrabold text-zinc-200 block mb-0.5 font-sans">How do I use this Standalone file?</span>
                      Once downloaded, copy the <code className="text-indigo-400 font-mono bg-zinc-950 px-1 py-0.2 rounded font-bold">.html</code> file onto your phone, email it to yourself, or keep it on a flash drive. Double-clicking it on any PC opens an offline dashboard that shows all your inventories!
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        ) : activeTab === 'games' ? (
          /* Games Tracking Configuration Panel tab */
          <div className="flex flex-col gap-6">
            
            {/* Top Header info row */}
            <div className="bg-zinc-900/20 border border-zinc-850/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🎮</span> Tracking Profiles & Custom Games Manager
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Define games tracked on the dashboard and toggle customized columns like Account, Game, Map, Seeds, Gems, and Storage.
                </p>
              </div>
              <div className="bg-zinc-950/40 border border-zinc-850 px-3.5 py-1.5 rounded-xl text-center shrink-0">
                <span className="text-[10px] text-zinc-550 uppercase tracking-widest font-mono font-bold block">Registered Profiles</span>
                <span className="text-sm font-extrabold text-indigo-400 font-mono">{games.length} Configured</span>
              </div>
            </div>

            {/* Grid Layout: Left form, Right list */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Creator Form (Left 4 cols) */}
              <div className="lg:col-span-4 bg-zinc-900/15 border border-zinc-850/80 rounded-2xl p-5 flex flex-col gap-5 backdrop-blur-sm self-start">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-1.5">
                    <span>✨</span> Create Game Profile
                  </h4>
                  <p className="text-[10px] text-zinc-550 mt-1">Specify custom column visibilities for this game profile on your live dashboard grid.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-zinc-400 font-bold font-mono uppercase">Game Name</label>
                  <input
                    type="text"
                    value={newGameName}
                    onChange={(e) => setNewGameName(e.target.value)}
                    placeholder="e.g. Adopt Me, PETS GO"
                    className="w-full bg-zinc-950 border border-zinc-850 hover:border-zinc-800 focus:border-indigo-650 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none transition font-sans"
                  />
                </div>

                {/* Tracked Column selection checklist */}
                <div className="flex flex-col gap-2.5">
                  <label className="text-[10px] text-zinc-400 font-bold font-mono uppercase">Tracked Columns Checklist</label>
                  
                  <div className="space-y-1.5">
                    {/* Permanent Columns */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/30 border border-dashed border-zinc-850 text-zinc-500 text-[10px] select-none font-mono">
                      <span className="font-semibold">Account Info</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-500">required</span>
                    </div>

                    {/* Checkboxes dressed as gorgeous items list */}
                    {[
                      { key: 'game', label: '🎮 Game' },
                      { key: 'map', label: '🗺️ Map' },
                      { key: 'seeds', label: '🌱 Seeds Status' },
                      { key: 'storage', label: '📦 Vault Storage Count' },
                      { key: 'lobby', label: '🚪 Lobby / Map State' }
                    ].map((col) => {
                      const isChecked = newGameColumns[col.key as keyof typeof newGameColumns];
                      const toggleCol = () => {
                        setNewGameColumns(prev => ({
                          ...prev,
                          [col.key]: !prev[col.key as keyof typeof newGameColumns]
                        }));
                      };

                      return (
                        <div
                          key={col.key}
                          onClick={toggleCol}
                          className={`flex items-center justify-between p-2 rounded-lg border transition cursor-pointer select-none text-[11px] font-medium ${
                            isChecked
                              ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400'
                              : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-850'
                          }`}
                        >
                          <span>{col.label}</span>
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition ${
                            isChecked
                              ? 'bg-indigo-500 border-indigo-500 text-black'
                              : 'border-zinc-800'
                          }`}>
                            {isChecked && <span className="text-[10px] leading-none font-bold">✓</span>}
                          </span>
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/30 border border-dashed border-zinc-850 text-zinc-500 text-[10px] select-none font-mono">
                      <span className="font-semibold">Telemetry Updated At</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-500">required</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const cleanName = newGameName.trim();
                    if (!cleanName) {
                      setToastMessage('Please fill in a Game Name.');
                      setTimeout(() => setToastMessage(null), 2500);
                      return;
                    }
                    if (games.some(g => g.name.toLowerCase() === cleanName.toLowerCase())) {
                      setToastMessage(`Game config "${cleanName}" already exists!`);
                      setTimeout(() => setToastMessage(null), 2500);
                      return;
                    }

                    const added: GameConfig = {
                      name: cleanName,
                      isActive: true,
                      trackedColumns: {
                        account: true,
                        game: newGameColumns.game,
                        map: newGameColumns.map,
                        seeds: newGameColumns.seeds,
                        storage: newGameColumns.storage,
                        lobby: newGameColumns.lobby,
                        updated: true
                      },
                      createdAt: new Date().toISOString()
                    };

                    const updatedGamesList = [...games, added];
                    saveGamesList(updatedGamesList);
                    setNewGameName('');
                    setNewGameColumns({
                      account: true,
                      game: true,
                      map: true,
                      seeds: true,
                      storage: true,
                      lobby: false,
                      updated: true
                    });
                    setToastMessage(`Created game tracking profile for "${cleanName}"!`);
                    setTimeout(() => setToastMessage(null), 2500);
                  }}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-650/15 transition duration-150 active:scale-97 cursor-pointer text-center font-mono uppercase tracking-wider"
                >
                  Create Game Tracker
                </button>
              </div>

              {/* Grid Registered Profiles overview list (Right 8 cols) */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">Registered Tracking Profiles</h4>
                    <p className="text-[10px] text-zinc-550 mt-0.5">Tactile interactive cards. Click column labels on cards to toggle dashboard visibility instantly.</p>
                  </div>
                </div>

                {games.length === 0 ? (
                  <div className="py-20 text-center bg-zinc-900/10 border border-zinc-900 border-dashed rounded-3xl flex flex-col items-center justify-center">
                    <span className="text-3xl block mb-2.5">🎮</span>
                    <p className="text-zinc-300 font-bold text-xs">No Game Profiles Set Up</p>
                    <p className="text-zinc-550 text-[10px] mt-1 max-w-xs mx-auto">
                      Define your favorite games on the left panel. Create custom tracker column combinations to match specific Roblox game metrics automatically.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {games.map((game, index) => {
                      // Count accounts currently assigned to this game
                      const matchingAccounts = importedAccounts.filter(
                        a => a.game && a.game.toLowerCase() === game.name.toLowerCase()
                      );

                      const toggleGameColumn = (columnKey: string) => {
                        const updated = games.map((g, i) => {
                          if (i === index) {
                            return {
                              ...g,
                              trackedColumns: {
                                ...g.trackedColumns,
                                [columnKey]: !g.trackedColumns[columnKey as keyof typeof g.trackedColumns]
                              }
                            };
                          }
                          return g;
                        });
                        saveGamesList(updated);
                      };

                      return (
                        <div
                          key={game.name}
                          className="bg-zinc-900/15 border border-zinc-850 rounded-2xl p-5 hover:bg-zinc-900/25 transition duration-150 flex flex-col justify-between gap-4 group/card relative"
                        >
                          {/* Inner card Header */}
                          <div className="flex items-center justify-between gap-25">
                            <div className="flex items-center gap-2 max-w-[80%]">
                              <span className="text-lg">🎮</span>
                              <span className="text-xs font-extrabold text-white truncate font-sans tracking-wide" title={game.name}>
                                {game.name}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const updated = games.filter((_, i) => i !== index);
                                saveGamesList(updated);
                                setToastMessage(`Removed custom game profile: "${game.name}"`);
                                setTimeout(() => setToastMessage(null), 2500);
                              }}
                              className="p-1 rounded bg-rose-500/10 hover:bg-rose-550/20 text-rose-450 border border-rose-500/15 transition cursor-pointer"
                              title="Delete tracking card"
                            >
                              <span className="text-[11px] block font-mono">🗑️</span>
                            </button>
                          </div>

                          {/* Interactive Columns indicator grid */}
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] text-zinc-550 uppercase tracking-wider font-mono font-bold">Dashboard Column Mapping</span>
                            
                            <div className="flex flex-wrap gap-1">
                              {[
                                { key: 'game', icon: '🎮' },
                                { key: 'map', icon: '🗺️' },
                                { key: 'seeds', icon: '🌱' },
                                { key: 'gems', icon: '💎' },
                                { key: 'storage', icon: '📦' },
                                { key: 'xp', icon: 'XP' },
                                { key: 'gamesWon', icon: '🏆' },
                                { key: 'wave', icon: '🌊' },
                                { key: 'lobby', icon: '🚪' }
                              ].map(({ key, icon }) => {
                                const active = game.trackedColumns[key as keyof typeof game.trackedColumns];
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleGameColumn(key)}
                                    className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded border transition cursor-pointer ${
                                      active 
                                        ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20 shadow-[0_1px_5px_rgba(99,102,241,0.06)]' 
                                        : 'bg-zinc-950/45 text-zinc-600 border-zinc-900/55 hover:border-zinc-800'
                                    }`}
                                    title={`Click to toggle column ${key}`}
                                  >
                                    {icon} {key}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Footer action layer */}
                          <div className="flex items-center justify-between border-t border-zinc-850/50 pt-3 mt-1 text-[10px]">
                            <span className="text-zinc-500 font-medium">
                              {matchingAccounts.length} Account{matchingAccounts.length !== 1 ? 's' : ''} assigned
                            </span>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedGameFilter(game.name);
                                setActiveTab('dashboard');
                              }}
                              className="px-2 py-1 bg-zinc-950 hover:bg-zinc-900 text-indigo-400 border border-zinc-850 hover:border-zinc-750 font-bold font-mono text-[9px] rounded-lg transition shrink-0 active:scale-95 cursor-pointer"
                            >
                              View Layout →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : activeTab === 'listings' ? (
          /* Shop Listings manager tab */
          <ListingsTab aggregateStorage={aggregateStorage} tradingAccounts={tradingAccounts} />
        ) : (
          /* Units Database Tab */
          <UnitsTab aggregateStorage={aggregateStorage} />
        )}

          </div>
        </div>

      </div>

      {/* Floating inventory overlay panel drawer (AnimatePresence) */}
      <AnimatePresence>
        {selectedInventoryUser && (
          <InventoryDrawer
            username={selectedInventoryUser.username}
            inventory={selectedInventoryUser.inventory}
            onClose={() => setSelectedInventoryUser(null)}
          />
        )}
      </AnimatePresence>

      {/* Custom Right-Click Context Menu for Selection Copying */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-55 bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-2xl p-1.5 min-w-[200px] backdrop-blur-md"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                handleCopySelectedUsernames();
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-zinc-100 hover:text-white hover:bg-indigo-600 rounded-xl text-left transition cursor-pointer"
            >
              <span>📋</span> Copy Selected ({selectedHolderIndexes.length || 1})
            </button>
            <button
              onClick={() => {
                handleCopyAllUsernames();
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl text-left transition cursor-pointer"
            >
              <span>👥</span> Copy All ({selectedStorageItem?.accounts?.length || 0})
            </button>
            <div className="h-px bg-zinc-850/80 my-1" />
            <button
              onClick={() => {
                setSelectedHolderIndexes([]);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-xl text-left transition cursor-pointer"
            >
              <span>❌</span> Clear Selection
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Credentials Importer Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsImportModalOpen(false);
                setShowConfirmClear(false);
              }}
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-xl bg-zinc-950 border border-zinc-850/80 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setShowConfirmClear(false);
                }}
                className="absolute top-5 right-5 text-zinc-500 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 p-1.5 rounded-xl transition duration-150 cursor-pointer active:scale-95"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>

              <div>
                <h3 className="text-base font-bold font-display text-white flex items-center gap-2">
                  <span className="text-amber-400">🔑</span> Bulk Import Account Credentials
                </h3>
                <p className="text-zinc-400 text-xs mt-1">
                  Format: <code className="bg-zinc-900 px-1 py-0.5 rounded text-indigo-400 font-mono text-[11px] font-bold">username:password:cookie</code>. One account per line. Extra colons in cookies are parsed securely.
                </p>
              </div>

              {/* Text Area */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-semibold">
                  Paste Account Configuration List
                </label>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="user1:pass1:cookieValueHere...&#10;user2:pass2:cookieValueHere..."
                  rows={8}
                  className="w-full bg-zinc-900/60 border border-zinc-850/80 rounded-2xl p-4 text-xs font-mono text-zinc-200 placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition resize-none"
                />
              </div>

              {/* Status and Actions Panel */}
              <div className="flex flex-col gap-3.5 bg-zinc-900/20 border border-zinc-900 rounded-2xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div>
                    <span className="text-zinc-400 font-medium block">Matching Tracker Database:</span>
                    <span className="text-[11px] text-zinc-305 font-mono mt-0.5 block">
                      Matched <span className="text-amber-400 font-bold">{matchedAccountsCount}</span> of <span className="text-zinc-150 font-bold">{accounts.length}</span> tracker users
                    </span>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-zinc-500 block text-[10px] uppercase font-mono tracking-wider">Storage Memory</span>
                    <span className="text-zinc-200 text-xs font-bold block mt-0.5">
                      {Object.keys(credentialsMap).length} mapped records
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-900 pt-3.5 flex-wrap gap-3">
                  {/* Clear Button / Confirm Clearance Row */}
                  <div>
                    {!showConfirmClear ? (
                      <button
                        type="button"
                        onClick={() => setShowConfirmClear(true)}
                        disabled={Object.keys(credentialsMap).length === 0}
                        className="px-3 py-1.5 text-xs text-rose-450 hover:text-rose-400 hover:bg-rose-950/20 border border-transparent hover:border-rose-950/30 rounded-xl transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none font-bold"
                      >
                        🗑️ Clear Memory
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-rose-400 font-mono font-bold animate-pulse">Are you sure?</span>
                        <button
                          type="button"
                          onClick={handleClearCredentials}
                          className="px-2.5 py-1 text-[10px] bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold cursor-pointer transition"
                        >
                          Yes, Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowConfirmClear(false)}
                          className="px-2.5 py-1 text-[10px] bg-zinc-900 hover:bg-zinc-850 text-zinc-400 rounded-lg font-bold cursor-pointer transition"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cancel / Import Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsImportModalOpen(false);
                        setShowConfirmClear(false);
                      }}
                      className="px-4 py-2 text-xs font-bold font-mono text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-850 hover:border-zinc-800 rounded-xl transition cursor-pointer active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCredentials}
                      disabled={!importText.trim()}
                      className="px-4 py-2 text-xs font-bold font-mono text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:pointer-events-none rounded-xl transition cursor-pointer active:scale-95 shadow-lg shadow-amber-400/10"
                    >
                      Save & Import
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Toast Notifications */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 right-6 z-55 bg-indigo-600/95 border border-indigo-500/30 text-white font-mono text-xs font-bold px-4 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 backdrop-blur-md"
          >
            <span className="text-sm">✨</span>
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
