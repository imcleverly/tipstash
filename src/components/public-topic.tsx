"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBlob, ref } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { AssetPreview } from "@/components/asset-preview";
import { Icon } from "@/components/icons";
import { messages } from "@/lib/i18n";
import type { Locale, Tip, TipBlock, Topic } from "@/lib/types";

function SharedFile({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function download() {
    setBusy(true);
    setError(false);
    try {
      const blob = await getBlob(ref(storage, path), 25 * 1024 * 1024);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return <button className="file-download" onClick={download} disabled={busy}>
    <Icon name="file" size={17} /> <span>{busy ? "…" : name}{error && <small> · unavailable</small>}</span><Icon name="arrow" size={15} />
  </button>;
}

function SharedBlock({ block, t }: { block: TipBlock; t: ReturnType<typeof messages> }) {
  if (block.type === "text") return <p className="tip-text">{block.text}</p>;
  if (block.type === "steps") return <ol className="tip-steps">{block.items.map((step, index) => <li key={`${block.id}-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol>;
  if (block.type === "image") return <AssetPreview path={block.path} alt={block.alt || "Tip image"} className="tip-image" unavailable={t.imageUnavailable} />;
  if (block.type === "file") return <SharedFile path={block.path} name={block.name} />;
  return <span className={`tip-label tone-${block.tone} label-${block.style}`}>{block.text}</span>;
}

export function PublicTopicPage({ shareId }: { shareId: string }) {
  const [locale, setLocale] = useState<Locale>("vi");
  const t = messages(locale);
  const [data, setData] = useState<{ topic: Topic; tips: Tip[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let current = true;
    fetch(`/api/public/${encodeURIComponent(shareId)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject())
      .then((value) => current && setData(value as { topic: Topic; tips: Tip[] }))
      .catch(() => current && setUnavailable(true))
      .finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [shareId]);

  if (loading) return <main className="public-state"><span className="loading-mark"/><p>{t.loading}</p></main>;
  if (unavailable || !data) return <main className="public-state"><div className="public-state-card"><span className="state-icon"><Icon name="lock" size={23}/></span><h1>{t.publicUnavailable}</h1><p>{t.app} · {t.viewOnly}</p><button className="language-toggle" onClick={() => setLocale(locale === "vi" ? "en" : "vi")}>{locale === "vi" ? "EN" : "VI"}</button></div></main>;

  return <main className="public-page">
    <header className="public-bar">
      <Link className="brand-light" href="/"><span className="brand-mark"><Icon name="library" size={20}/></span><strong>Tipstash</strong></Link>
      <div className="public-view-note"><Icon name="eye" size={15}/>{t.viewOnly}</div>
      <button className="language-toggle" onClick={() => setLocale(locale === "vi" ? "en" : "vi")} aria-label={t.language}>{locale === "vi" ? "EN" : "VI"}</button>
    </header>
    <div className="public-content">
      <div className="public-topic-heading">
        {data.topic.coverImagePath && <AssetPreview path={data.topic.coverImagePath} alt="" className="public-cover"/>}
        <div className="public-line-rule"><span/><span/><span/><span/></div>
        <span className="section-kicker">{t.topic}</span>
        <h1>{data.topic.title}</h1>
        <p>{data.topic.description || t.noDescription}</p>
      </div>
      <div className="public-tips-heading"><h2>{data.tips.length} {t.tips}</h2><span/></div>
      {data.tips.length === 0 ? <div className="public-empty">{t.noTips}</div> : <div className="public-tip-list">{data.tips.map((tip, index) => <article className="public-tip" key={tip.id}>
        <div className="public-tip-index"><span>{String(index + 1).padStart(2, "0")}</span><i/></div>
        <div className="public-tip-body"><h3>{tip.title || t.untitled}</h3>{tip.summary && <p className="public-tip-summary">{tip.summary}</p>}
          <div className="public-tip-blocks">{(tip.blocks ?? []).map((block) => <SharedBlock key={block.id} block={block} t={t}/>)}</div>
        </div>
      </article>)}</div>}
      <footer className="public-footer"><div className="brand-line"/><span>{t.app}</span><span>{t.footerTagline}</span></footer>
    </div>
  </main>;
}
