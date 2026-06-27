import { useState, useEffect } from 'react';

const THUMB_CACHE_KEY = 'gtd_rblx_thumb_cache';

function loadCache(): Map<string, string | null> {
  const map = new Map<string, string | null>();
  try {
    const saved = localStorage.getItem(THUMB_CACHE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, string | null>;
      for (const [k, v] of Object.entries(parsed)) map.set(k, v);
    }
  } catch {}
  return map;
}

function persistCache(map: Map<string, string | null>) {
  try {
    const obj: Record<string, string | null> = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

const rblxThumbCache = loadCache();

interface AssetImageProps {
  rawName?: string;
  fallbackEmoji: string;
  name?: string;
  className?: string;
  image?: string;
}

export default function AssetImage({
  rawName,
  fallbackEmoji,
  name,
  className = 'w-10 h-10 object-contain',
  image,
}: AssetImageProps) {
  const [rblxLoading, setRblxLoading] = useState(false);
  const [resolvedRblxUrl, setResolvedRblxUrl] = useState<string | null>(null);
  const [rblxError, setRblxError] = useState(false);
  const [githubError, setGithubError] = useState(false);

  useEffect(() => {
    setResolvedRblxUrl(null);
    setRblxError(false);
    setGithubError(false);
    setRblxLoading(false);

    if (!image || !image.startsWith('rbxassetid://')) return;

    const assetId = image.replace('rbxassetid://', '');
    if (!/^\d+$/.test(assetId)) return;

    if (rblxThumbCache.has(assetId)) {
      setResolvedRblxUrl(rblxThumbCache.get(assetId) ?? null);
      return;
    }

    setRblxLoading(true);
    fetch(`/api/roblox-thumb?id=${assetId}`)
      .then((r) => r.json())
      .then((data) => {
        const url: string | null = data.imageUrl ?? null;
        rblxThumbCache.set(assetId, url);
        persistCache(rblxThumbCache);
        setResolvedRblxUrl(url);
        setRblxLoading(false);
      })
      .catch(() => {
        rblxThumbCache.set(assetId, null);
        persistCache(rblxThumbCache);
        setRblxLoading(false);
      });
  }, [image, rawName]);

  const isNumeric = (str: string) => /^\d+$/.test(str);
  const displayEmoji =
    fallbackEmoji && (!isNumeric(fallbackEmoji) || fallbackEmoji.length <= 4)
      ? fallbackEmoji
      : '📦';

  // While rbxassetid is resolving — show skeleton so GitHub CDN isn't attempted
  if (rblxLoading) {
    return (
      <div className={`${className} bg-zinc-800/40 rounded-lg animate-pulse shrink-0`} />
    );
  }

  // Priority 1: resolved Roblox thumbnail
  if (resolvedRblxUrl && !rblxError) {
    return (
      <div className="flex items-center justify-center pointer-events-none select-none">
        <img
          src={resolvedRblxUrl}
          alt={name || rawName || ''}
          referrerPolicy="no-referrer"
          onError={() => setRblxError(true)}
          className={`${className} transition-transform duration-200 group-hover:scale-110`}
        />
      </div>
    );
  }

  // Priority 2: GitHub CDN (only when no rbxassetid image or it failed/null)
  if (rawName && !githubError) {
    let cleanId = rawName.toLowerCase().trim().replace(/[-\s]+/g, '_');
    if (
      !cleanId.startsWith('unit_') &&
      !cleanId.startsWith('dp_') &&
      !cleanId.startsWith('gp_')
    ) {
      cleanId = 'unit_' + cleanId;
    }

    const githubUrl = `https://raw.githubusercontent.com/andero2003/GTDCDN/main/images/${cleanId}.png`;
    return (
      <div className="flex items-center justify-center pointer-events-none select-none">
        <img
          src={githubUrl}
          alt={name || cleanId}
          referrerPolicy="no-referrer"
          onError={() => setGithubError(true)}
          className={`${className} transition-transform duration-200 group-hover:scale-110`}
        />
      </div>
    );
  }

  return <span className="select-none leading-none text-2xl">{displayEmoji}</span>;
}
