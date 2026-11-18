"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ref, getBlob } from "firebase/storage";
import { storage } from "@/lib/firebase/client";

export function AssetPreview({ path, alt, className, unavailable = "Image unavailable" }: { path: string; alt: string; className?: string; unavailable?: string }) {
  const [asset, setAsset] = useState<{ path: string; url: string | null; failed: boolean } | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let current = true;
    getBlob(ref(storage, path), 25 * 1024 * 1024)
      .then((blob) => {
        if (!current) return;
        objectUrl = URL.createObjectURL(blob);
        setAsset({ path, url: objectUrl, failed: false });
      })
      .catch(() => current && setAsset({ path, url: null, failed: true }));
    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (asset?.path === path && asset.failed) return <div className={`asset-fallback ${className ?? ""}`} aria-label={alt}>{unavailable}</div>;
  if (asset?.path !== path || !asset.url) return <div className={`asset-loading ${className ?? ""}`} aria-label="Loading image" />;
  return <Image className={className} src={asset.url} alt={alt} width={1600} height={1200} unoptimized />;
}
