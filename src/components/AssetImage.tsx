import { useState, useEffect } from 'react';

// Module-level cache so resolved URLs survive re-renders and component remounts
const rblxThumbCache = new Map<string, string | null>();

interface AssetImageProps {
  rawName?: string;
  fallbackEmoji: string;
  name?: string;
  className?: string;
  image?: string; // rbxassetid:// URL from inventory
}

export default function AssetImage({
  rawName,
  fallbackEmoji,
  name,
  className = 'w-10 h-10 object-contain',
  image,
}: AssetImageProps) {
  const [hasError, setHasError] = useState(false);
  const [resolvedRblxUrl, setResolvedRblxUrl] = useState<string | null>(null);

  useEffect(() => {
    setHasError(false);
    setResolvedRblxUrl(null);

    if (!image || !image.startsWith('rbxassetid://')) return;

    const assetId = image.replace('rbxassetid://', '');
    if (!/^\d+$/.test(assetId)) return;

    if (rblxThumbCache.has(assetId)) {
      setResolvedRblxUrl(rblxThumbCache.get(assetId) ?? null);
      return;
    }

    fetch(`/api/roblox-thumb?id=${assetId}`)
      .then((r) => r.json())
      .then((data) => {
        const url: string | null = data.imageUrl ?? null;
        rblxThumbCache.set(assetId, url);
        setResolvedRblxUrl(url);
      })
      .catch(() => {
        rblxThumbCache.set(assetId, null);
      });
  }, [image, rawName]);

  const isNumeric = (str: string) => /^\d+$/.test(str);
  const displayEmoji =
    fallbackEmoji && (!isNumeric(fallbackEmoji) || fallbackEmoji.length <= 4)
      ? fallbackEmoji
      : '📦';

  // Priority 1: resolved Roblox thumbnail
  if (resolvedRblxUrl && !hasError) {
    return (
      <div className="flex items-center justify-center pointer-events-none select-none">
        <img
          src={resolvedRblxUrl}
          alt={name || rawName || ''}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className={`${className} transition-transform duration-200 group-hover:scale-110`}
        />
      </div>
    );
  }

  // Priority 2: GitHub CDN using rawName as the item key
  if (rawName && !hasError) {
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
          onError={() => setHasError(true)}
          className={`${className} transition-transform duration-200 group-hover:scale-110`}
        />
      </div>
    );
  }

  // Fallback: emoji
  return <span className="select-none leading-none text-2xl">{displayEmoji}</span>;
}
