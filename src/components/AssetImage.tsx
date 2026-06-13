import { useState, useEffect } from 'react';

interface AssetImageProps {
  rawName?: string;
  fallbackEmoji: string;
  name?: string;
  className?: string;
}

export default function AssetImage({
  rawName,
  fallbackEmoji,
  name,
  className = 'w-10 h-10 object-contain'
}: AssetImageProps) {
  const [hasError, setHasError] = useState(false);

  // Reset the error state if rawName changes (e.g. selecting different items)
  useEffect(() => {
    setHasError(false);
  }, [rawName]);

  // Sanitize fallback emoji (if it's a long numeric asset ID/string, replace with default emoji)
  const isNumeric = (str: string) => /^\d+$/.test(str);
  const displayEmoji = fallbackEmoji && (!isNumeric(fallbackEmoji) || fallbackEmoji.length <= 4) ? fallbackEmoji : '📦';

  if (!rawName) {
    return <span className="select-none leading-none text-2xl">{displayEmoji}</span>;
  }

  // Sanitize rawName to match GTDCDN filename conventions
  let cleanId = rawName.toLowerCase().trim().replace(/[-\s]+/g, '_');

  // CDN hosts unit_, dp_*, and gp_* prefixes — use as-is, only add unit_ for bare names
  if (!cleanId.startsWith('unit_') && !cleanId.startsWith('dp_') && !cleanId.startsWith('gp_')) {
    cleanId = 'unit_' + cleanId;
  }

  if (hasError) {
    return <span className="select-none leading-none text-2xl">{displayEmoji}</span>;
  }

  // GitHub Raw CDN URL
  const imageUrl = `https://raw.githubusercontent.com/andero2003/GTDCDN/main/images/${cleanId}.png`;

  return (
    <div className="flex items-center justify-center pointer-events-none select-none">
      <img
        src={imageUrl}
        alt={name || cleanId}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className={`${className} transition-transform duration-200 group-hover:scale-110`}
      />
    </div>
  );
}
