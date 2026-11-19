"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, signOut, type User } from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getBlob, ref } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { AssetPreview } from "@/components/asset-preview";
import { Icon } from "@/components/icons";
import { auth, db } from "@/lib/firebase/client";
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [accessIssue, setAccessIssue] = useState<"sign-in-required" | "approval-required" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (!authReady) return;
    let current = true;
    async function loadShare() {
      setLoading(true);
      setUnavailable(false);
      setAccessIssue(null);
      try {
        if (user?.emailVerified && user.email?.trim().toLowerCase() !== "tuananhdao.dev.js@gmail.com") {
          const accessRef = doc(db, "accessRequests", user.uid);
          await runTransaction(db, async (transaction) => {
            const currentAccess = await transaction.get(accessRef);
            if (!currentAccess.exists()) transaction.set(accessRef, {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName ?? "",
              avatarUrl: user.photoURL,
              status: "pending",
              createdAt: serverTimestamp(),
            });
          });
        }
        const headers = new Headers();
        if (user) headers.set("authorization", `Bearer ${await user.getIdToken()}`);
        const response = await fetch(`/api/public/${encodeURIComponent(shareId)}`, { headers, cache: "no-store" });
        const value = await response.json() as { error?: string; reason?: string; topic?: Topic; tips?: Tip[] };
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (current) setAccessIssue(value.reason === "sign-in-required" || response.status === 401 ? "sign-in-required" : "approval-required");
            return;
          }
          throw new Error(value.error || t.publicUnavailable);
        }
        if (current) setData(value as { topic: Topic; tips: Tip[] });
      } catch {
        if (current) setUnavailable(true);
      } finally {
        if (current) setLoading(false);
      }
    }
    void loadShare();
    return () => { current = false; };
  }, [shareId, authReady, user, refreshKey, t.publicUnavailable]);

  async function handleSignIn() {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithRedirect(auth, provider);
    } catch {
      setAccessIssue("sign-in-required");
    }
  }

  if (loading) return <main className="public-state"><span className="loading-mark"/><p>{t.loading}</p></main>;
  if (accessIssue || unavailable || !data) return <main className="public-state"><div className="public-state-card"><span className="state-icon"><Icon name="lock" size={23}/></span><h1>{accessIssue ? t.restrictedShareTitle : t.publicUnavailable}</h1><p>{accessIssue ? t.restrictedShareBody : `${t.app} · ${t.viewOnly}`}</p>
    {accessIssue === "sign-in-required" && <button className="primary-button google-button" onClick={() => void handleSignIn()}><Icon name="google" size={17}/>{t.signIn}<Icon name="arrow" size={16}/></button>}
    {accessIssue === "approval-required" && <div className="restricted-actions"><button className="secondary-button" onClick={() => setRefreshKey((value) => value + 1)}>{t.approvalCheck}</button>{user && <button className="text-button" onClick={() => void signOut(auth)}>{t.signOut}</button>}</div>}
    <button className="language-toggle" onClick={() => setLocale(locale === "vi" ? "en" : "vi")}>{locale === "vi" ? "EN" : "VI"}</button></div></main>;

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
