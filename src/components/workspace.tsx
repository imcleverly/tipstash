"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { AssetPreview } from "@/components/asset-preview";
import { Icon } from "@/components/icons";
import { auth, db, firebaseConfigured, storage } from "@/lib/firebase/client";
import { messages } from "@/lib/i18n";
import { validateUpload } from "@/lib/file-policy";
import type { LabelTone, Locale, PublicUser, Tip, TipBlock, Topic, TopicInvitation, TopicRole, UserProfile } from "@/lib/types";

const tones: LabelTone[] = ["line-red", "line-blue", "line-amber", "line-green", "ink"];
const routeNames: Record<LabelTone, string> = {
  "line-red": "Scarlet",
  "line-blue": "Cobalt",
  "line-amber": "Amber",
  "line-green": "Verdant",
  ink: "Ink",
};

function timeValue(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadLibrary(user: User, username?: string) {
  const ownSnapshot = await getDocs(query(collection(db, "topics"), where("ownerId", "==", user.uid)));
  const topics = new Map<string, Topic>();
  ownSnapshot.docs.forEach((snapshot) => {
    const value = snapshot.data();
    topics.set(snapshot.id, { id: snapshot.id, ...value, role: "owner" } as Topic);
  });

  const memberSnapshot = await getDocs(query(collectionGroup(db, "members"), where("uid", "==", user.uid)));
  await Promise.all(memberSnapshot.docs.map(async (member) => {
    const topicRef = member.ref.parent.parent;
    if (!topicRef || topics.has(topicRef.id)) return;
    const topicSnapshot = await getDoc(topicRef);
    if (!topicSnapshot.exists()) return;
    topics.set(topicRef.id, {
      id: topicRef.id,
      ...topicSnapshot.data(),
      role: member.data().role as TopicRole,
    } as Topic);
  }));

  const result = [...topics.values()].sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
  const pendingInvitations = new Map<string, TopicInvitation>();
  if (user.email && user.emailVerified) {
    const digest = await hashEmail(user.email);
    const received = await getDocs(query(
      collection(db, "invitations"),
      where("inviteeEmailHash", "==", digest),
      where("status", "==", "pending"),
    ));
    received.docs.forEach((snapshot) => pendingInvitations.set(snapshot.id, { id: snapshot.id, ...snapshot.data() } as TopicInvitation));
  }
  if (username) {
    const received = await getDocs(query(
      collection(db, "invitations"),
      where("inviteeUsername", "==", username),
      where("status", "==", "pending"),
    ));
    received.docs.forEach((snapshot) => pendingInvitations.set(snapshot.id, { id: snapshot.id, ...snapshot.data() } as TopicInvitation));
  }
  return { topics: result, invitations: [...pendingInvitations.values()] };
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal-panel ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></div>
      {children}
    </section>
  </div>;
}

function RouteMarks({ tone = "line-blue" }: { tone?: LabelTone }) {
  return <span className={`route-marks ${tone}`} aria-hidden="true"><i/><i/><i/><i/></span>;
}

function AccountAvatar({ profile, user }: { profile: UserProfile | null; user: User | null }) {
  const photo = profile?.avatarUrl || user?.photoURL;
  const name = profile?.displayName || user?.displayName || "";
  return photo ? <Image className="avatar" src={photo} alt="" width={32} height={32} unoptimized referrerPolicy="no-referrer"/> : <span className="avatar avatar-fallback" aria-label={name}>{name.slice(0, 1).toUpperCase() || "T"}</span>;
}

function FileButton({ block }: { block: Extract<TipBlock, { type: "file" }> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function download() {
    setBusy(true);
    setError(false);
    try {
      const { getBlob } = await import("firebase/storage");
      const blob = await getBlob(ref(storage, block.path), 25 * 1024 * 1024);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = block.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return <button className="file-download" onClick={download} disabled={busy}>
    <Icon name="file" size={17}/><span>{busy ? "…" : block.name}{error && <small> · unavailable</small>}</span><Icon name="arrow" size={15}/>
  </button>;
}

function BlockView({ block }: { block: TipBlock }) {
  if (block.type === "text") return <p className="tip-text">{block.text}</p>;
  if (block.type === "steps") return <ol className="tip-steps">{block.items.map((item, index) => <li key={`${block.id}-${index}`}><span>{index + 1}</span><p>{item}</p></li>)}</ol>;
  if (block.type === "image") return <AssetPreview path={block.path} alt={block.alt || "Tip image"} className="tip-image"/>;
  if (block.type === "file") return <FileButton block={block}/>;
  return <span className={`tip-label tone-${block.tone} label-${block.style}`}>{block.text}</span>;
}

export function Workspace() {
  const [locale, setLocale] = useState<Locale>("vi");
  const t = messages(locale);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [invitations, setInvitations] = useState<TopicInvitation[]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeView, setActiveView] = useState<"all" | "shared">("all");
  const [search, setSearch] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [selectedTipId, setSelectedTipId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string | null; title: string; summary: string; blocks: TipBlock[] } | null>(null);
  const [topicModal, setTopicModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [lookupUsername, setLookupUsername] = useState("");
  const [lookupResult, setLookupResult] = useState<PublicUser | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [shareRole, setShareRole] = useState<TopicRole>("viewer");
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setError("");
      if (!nextUser) {
        setProfile(null);
        setTopics([]);
        setInvitations([]);
        setBusy(false);
        return;
      }
      setBusy(true);
      try {
        const profileSnapshot = await getDoc(doc(db, "users", nextUser.uid));
        let nextUsername: string | undefined;
        if (profileSnapshot.exists()) {
          const data = profileSnapshot.data();
          nextUsername = typeof data.username === "string" ? data.username : undefined;
          setProfile({ uid: nextUser.uid, email: nextUser.email ?? "", ...data } as UserProfile);
        } else {
          setProfile(null);
          setUsername("");
          setDisplayName(nextUser.displayName ?? "");
        }
        const library = await loadLibrary(nextUser, nextUsername);
        setTopics(library.topics);
        setInvitations(library.invitations);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t.error);
      } finally {
        setBusy(false);
      }
    });
  }, [t.error]);

  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const selectedTip = tips.find((tip) => tip.id === selectedTipId) ?? null;
  const canEdit = selectedTopic?.role === "owner" || selectedTopic?.role === "editor";
  const visibleTopics = useMemo(() => topics.filter((topic) => {
    const isShared = topic.role !== "owner";
    const modeMatches = activeView === "all" ? !isShared : isShared;
    return modeMatches && `${topic.title} ${topic.description}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [topics, activeView, search]);

  useEffect(() => {
    const topicId = selectedTopicId;
    if (!topicId) return;
    let current = true;
    getDocs(query(collection(db, "topics", topicId, "tips"), orderBy("position")))
      .then((snapshot) => {
        if (current) setTips(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Tip)));
      })
      .catch((cause) => current && setError(cause instanceof Error ? cause.message : t.error));
    return () => { current = false; };
  }, [selectedTopicId, t.error]);

  function changeLocale(next: Locale) {
    setLocale(next);
  }

  function clearTopicSelection(view: "all" | "shared" = activeView) {
    setActiveView(view);
    setSelectedTopicId(null);
    setSelectedTipId(null);
    setDraft(null);
    setTips([]);
  }

  async function refreshLibrary(nextUser = user, nextUsername = profile?.username) {
    if (!nextUser) return;
    const library = await loadLibrary(nextUser, nextUsername);
    setTopics(library.topics);
    setInvitations(library.invitations);
  }

  async function handleGoogleSignIn() {
    setWorking(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setWorking(false);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !user.email) return;
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(cleanUsername)) {
      setError("Username must be 3–24 characters: letters, numbers, dots, dashes or underscores.");
      return;
    }
    setWorking(true);
    setError("");
    const userRef = doc(db, "users", user.uid);
    const usernameRef = doc(db, "usernames", cleanUsername);
    try {
      await runTransaction(db, async (transaction) => {
        const [existingUsername, existingProfile] = await Promise.all([
          transaction.get(usernameRef),
          transaction.get(userRef),
        ]);
        const currentUsername = existingProfile.exists() ? existingProfile.data().username : null;
        if (existingUsername.exists() && currentUsername !== cleanUsername) throw new Error("That username is already taken.");
        if (typeof currentUsername === "string" && currentUsername !== cleanUsername) {
          transaction.delete(doc(db, "usernames", currentUsername));
        }
        const now = serverTimestamp();
        const cleanName = displayName.trim() || user.displayName || cleanUsername;
        transaction.set(usernameRef, {
          username: cleanUsername,
          displayName: cleanName,
          avatarUrl: user.photoURL ?? "",
          createdAt: existingUsername.exists() ? existingUsername.data().createdAt : now,
          updatedAt: now,
        });
        transaction.set(userRef, {
          uid: user.uid,
          email: user.email,
          username: cleanUsername,
          displayName: cleanName,
          avatarUrl: user.photoURL ?? "",
          createdAt: now,
          updatedAt: now,
        });
      });
      const snapshot = await getDoc(userRef);
      setProfile({ uid: user.uid, email: user.email, ...snapshot.data() } as UserProfile);
      const library = await loadLibrary(user, cleanUsername);
      setTopics(library.topics);
      setInvitations(library.invitations);
      setNotice(t.continue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setWorking(false);
    }
  }

  async function createTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !topicTitle.trim()) return;
    setWorking(true);
    setError("");
    try {
      const topicRef = await addDoc(collection(db, "topics"), {
        ownerId: user.uid,
        title: topicTitle.trim(),
        description: topicDescription.trim(),
        coverImagePath: null,
        visibility: "private",
        publicShareId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      let coverImagePath: string | null = null;
      if (coverFile) {
        const validation = validateUpload(coverFile);
        if (!validation.ok) throw new Error(validation.reason === "size" ? t.sizeError : t.typeError);
        if (!validation.isImage) throw new Error(t.typeError);
        coverImagePath = `topics/${topicRef.id}/cover/${crypto.randomUUID()}.${coverFile.name.split(".").pop()?.toLowerCase()}`;
        await uploadBytes(ref(storage, coverImagePath), coverFile, { contentType: validation.contentType });
        await updateDoc(topicRef, { coverImagePath, updatedAt: serverTimestamp() });
      }
      setTopicModal(false);
      setTopicTitle("");
      setTopicDescription("");
      setCoverFile(null);
      await refreshLibrary(user);
      setTips([]);
      setSelectedTopicId(topicRef.id);
      setNotice(t.create);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.missingStorage);
    } finally {
      setWorking(false);
    }
  }

  async function openTopic(topic: Topic) {
    if (draft && !window.confirm(t.discardUnsaved)) return;
    setSelectedTopicId(topic.id);
    setSelectedTipId(null);
    setDraft(null);
    setTips([]);
    setError("");
  }

  function startNewTip() {
    setSelectedTipId(null);
    setDraft({ id: null, title: "", summary: "", blocks: [] });
  }

  function editTip(tip: Tip) {
    setSelectedTipId(tip.id);
    setDraft({ id: tip.id, title: tip.title, summary: tip.summary ?? "", blocks: structuredClone(tip.blocks ?? []) });
  }

  async function saveTip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selectedTopic || !draft || !draft.title.trim()) return;
    setWorking(true);
    setError("");
    try {
      const tipRef = draft.id ? doc(db, "topics", selectedTopic.id, "tips", draft.id) : doc(collection(db, "topics", selectedTopic.id, "tips"));
      const previous = tips.find((item) => item.id === draft.id);
      await setDoc(tipRef, {
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        blocks: draft.blocks,
        position: previous?.position ?? tips.length,
        createdBy: previous?.createdBy ?? user.uid,
        createdAt: previous?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "topics", selectedTopic.id), { updatedAt: serverTimestamp() });
      const updatedTips = await getDocs(query(collection(db, "topics", selectedTopic.id, "tips"), orderBy("position")));
      const loaded = updatedTips.docs.map((item) => ({ id: item.id, ...item.data() } as Tip));
      setTips(loaded);
      setSelectedTipId(tipRef.id);
      setDraft(null);
      await refreshLibrary(user);
      setNotice(t.saveTip);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setWorking(false);
    }
  }

  async function uploadBlock(file: File) {
    if (!selectedTopic || !draft) return;
    const validation = validateUpload(file);
    if (!validation.ok) {
      setError(validation.reason === "size" ? t.sizeError : t.typeError);
      return;
    }
    setWorking(true);
    setError("");
    try {
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
      const path = `topics/${selectedTopic.id}/files/${crypto.randomUUID()}-${safeName}`;
      await uploadBytes(ref(storage, path), file, { contentType: validation.contentType });
      const block: TipBlock = validation.isImage
        ? { id: crypto.randomUUID(), type: "image", path, alt: file.name }
        : { id: crypto.randomUUID(), type: "file", path, name: file.name, mimeType: validation.contentType, size: file.size };
      setDraft((current) => current ? { ...current, blocks: [...current.blocks, block] } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.missingStorage);
    } finally {
      setWorking(false);
    }
  }

  function appendBlock(type: "text" | "steps" | "label") {
    if (!draft) return;
    const block: TipBlock = type === "text"
      ? { id: crypto.randomUUID(), type: "text", text: "" }
      : type === "steps"
        ? { id: crypto.randomUUID(), type: "steps", items: [""] }
        : { id: crypto.randomUUID(), type: "label", text: "", tone: "line-blue", style: "solid" };
    setDraft({ ...draft, blocks: [...draft.blocks, block] });
  }

  function patchBlock(index: number, patch: Partial<TipBlock>) {
    if (!draft) return;
    const blocks = draft.blocks.map((block, at) => at === index ? { ...block, ...patch } as TipBlock : block);
    setDraft({ ...draft, blocks });
  }

  function moveBlock(index: number, delta: number) {
    if (!draft) return;
    const target = index + delta;
    if (target < 0 || target >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    setDraft({ ...draft, blocks });
  }

  function removeBlock(index: number) {
    if (!draft) return;
    setDraft({ ...draft, blocks: draft.blocks.filter((_, at) => at !== index) });
  }

  async function lookupAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setShareBusy(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const response = await fetch("/api/accounts/lookup", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ username: lookupUsername }),
      });
      const result = await response.json() as { user?: PublicUser | null; error?: string };
      if (!response.ok) throw new Error(result.error || t.error);
      if (!result.user) throw new Error(t.noUsername);
      setLookupResult(result.user);
    } catch (cause) {
      setLookupError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setShareBusy(false);
    }
  }

  async function sendShare(target: { username?: string; email?: string }) {
    if (!user || !selectedTopic) return;
    setShareBusy(true);
    setLookupError("");
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ topicId: selectedTopic.id, role: shareRole, ...target }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || t.error);
      setLookupResult(null);
      setLookupUsername("");
      setInviteEmail("");
      await refreshLibrary(user);
      setNotice(t.pending);
    } catch (cause) {
      setLookupError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setShareBusy(false);
    }
  }

  async function acceptInvitation(invitation: TopicInvitation) {
    if (!user) return;
    setWorking(true);
    setError("");
    const invitationRef = doc(db, "invitations", invitation.id);
    const memberRef = doc(db, "topics", invitation.topicId, "members", user.uid);
    try {
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(invitationRef);
        if (!current.exists() || current.data().status !== "pending") throw new Error("This invitation is no longer available.");
        transaction.set(memberRef, {
          uid: user.uid,
          role: invitation.role,
          invitationId: invitation.id,
          addedAt: serverTimestamp(),
        });
        transaction.update(invitationRef, {
          status: "accepted",
          acceptedBy: user.uid,
          acceptedAt: serverTimestamp(),
        });
      });
      await refreshLibrary(user);
      setNotice(t.accept);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setWorking(false);
    }
  }

  async function setPublicLink(active: boolean) {
    if (!user || !selectedTopic || selectedTopic.role !== "owner") return;
    setWorking(true);
    setError("");
    try {
      const topicRef = doc(db, "topics", selectedTopic.id);
      const shareId = selectedTopic.publicShareId || crypto.randomUUID();
      const shareRef = doc(db, "publicShares", shareId);
      await runTransaction(db, async (transaction) => {
        const topicSnapshot = await transaction.get(topicRef);
        if (!topicSnapshot.exists()) throw new Error(t.error);
        if (active) {
          transaction.set(shareRef, {
            topicId: selectedTopic.id,
            ownerUid: user.uid,
            active: true,
            createdAt: serverTimestamp(),
          });
          transaction.update(topicRef, { visibility: "unlisted", publicShareId: shareId, updatedAt: serverTimestamp() });
        } else {
          transaction.update(shareRef, { active: false, revokedAt: serverTimestamp() });
          transaction.update(topicRef, { visibility: "private", publicShareId: null, updatedAt: serverTimestamp() });
        }
      });
      const current = await getDoc(topicRef);
      if (current.exists()) setTopics((items) => items.map((item) => item.id === selectedTopic.id ? { ...item, ...current.data() } as Topic : item));
      setNotice(active ? t.createLink : t.revokeLink);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setWorking(false);
    }
  }

  async function copyPublicLink() {
    if (!selectedTopic?.publicShareId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${selectedTopic.publicShareId}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setError(t.error); }
  }

  async function removeTip(tip: Tip) {
    if (!selectedTopic || !canEdit || !window.confirm(`${t.confirmDelete} “${tip.title || t.untitled}”?`)) return;
    try {
      await deleteDoc(doc(db, "topics", selectedTopic.id, "tips", tip.id));
      setTips((items) => items.filter((item) => item.id !== tip.id));
      setSelectedTipId(null);
      setNotice(t.remove);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
  }

  if (busy) return <div className="app-loading"><span className="loading-mark"/><p>{t.loading}</p></div>;

  const sidebar = <>
    <button type="button" className="brand" onClick={() => { clearTopicSelection("all"); setMobileNav(false); }}>
      <span className="brand-mark"><Icon name="library" size={20}/></span><span><strong>Tipstash</strong><small>{t.subtitle}</small></span>
    </button>
    <div className="sidebar-rule"><RouteMarks tone="line-red"/><span>{t.privateKnowledge}</span></div>
    <nav className="main-nav" aria-label={t.library}>
      <button className={`nav-item ${activeView === "all" && !selectedTopic ? "selected" : ""}`} onClick={() => { clearTopicSelection("all"); setMobileNav(false); }}>
        <Icon name="library"/><span>{t.allTopics}</span><b>{topics.filter((topic) => topic.role === "owner").length}</b>
      </button>
      <button className={`nav-item ${activeView === "shared" && !selectedTopic ? "selected" : ""}`} onClick={() => { clearTopicSelection("shared"); setMobileNav(false); }}>
        <Icon name="share"/><span>{t.shared}</span><b>{topics.filter((topic) => topic.role !== "owner").length}</b>
      </button>
    </nav>
    <div className="sidebar-divider"/>
    <div className="topic-nav-title"><span>{activeView === "shared" ? t.shared : t.library}</span><button aria-label={t.newTopic} onClick={() => setTopicModal(true)} disabled={!user || !profile}><Icon name="plus" size={16}/></button></div>
    <nav className="topic-nav" aria-label="Topics">
      {(activeView === "shared" ? topics.filter((topic) => topic.role !== "owner") : topics.filter((topic) => topic.role === "owner")).slice(0, 8).map((topic, index) => <button key={topic.id} className={`topic-nav-item ${selectedTopicId === topic.id ? "selected" : ""}`} onClick={() => openTopic(topic)}>
        <span className={`station-dot tone-dot-${tones[index % tones.length]}`}/><span>{topic.title}</span>
      </button>)}
      {topics.length === 0 && <p className="sidebar-empty">{t.emptyTitle}</p>}
    </nav>
    <div className="sidebar-bottom">
      <div className="private-note"><Icon name="lock" size={15}/><span>{t.private}</span></div>
      {user ? <button className="account-button" onClick={() => setAccountMenu((open) => !open)}>
        <AccountAvatar profile={profile} user={user}/><span className="account-copy"><strong>{profile?.displayName || user.displayName || user.email}</strong><small>@{profile?.username || "…"}</small></span><Icon name="more" size={18}/>
      </button> : <div className="sidebar-tag"><Icon name="spark" size={13}/> {t.private}</div>}
      {accountMenu && user && <div className="account-menu"><button onClick={() => { setAccountMenu(false); changeLocale(locale === "vi" ? "en" : "vi"); }}>{t.language}: {locale === "vi" ? "Tiếng Việt" : "English"}</button><button onClick={() => signOut(auth)}>{t.signOut}</button></div>}
    </div>
  </>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>{sidebar}</aside>
    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="main-pane">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="menu"/></button>
        <div className="breadcrumbs"><span>{t.library}</span><i>/</i><strong>{selectedTopic?.title ?? (activeView === "shared" ? t.shared : t.allTopics)}</strong></div>
        <div className="topbar-actions">
          <label className="search-box"><Icon name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search}/><kbd>⌘ K</kbd></label>
          <button className="language-button" onClick={() => changeLocale(locale === "vi" ? "en" : "vi")} aria-label={t.language}><Icon name="globe" size={16}/><span>{locale === "vi" ? "VI" : "EN"}</span></button>
          {user && <button className="topbar-avatar" onClick={() => setAccountMenu((open) => !open)} aria-label={profile?.displayName || user.email || "Account"}><AccountAvatar profile={profile} user={user}/></button>}
        </div>
      </header>
      <div className="main-scroll">
        {error && <div className="toast toast-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Icon name="close" size={15}/></button></div>}
        {notice && <div className="toast toast-success" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><Icon name="close" size={15}/></button></div>}
        {!firebaseConfigured() && <div className="config-alert">Firebase environment is not configured. Add the NEXT_PUBLIC_FIREBASE values before signing in.</div>}
        {!user ? <section className="welcome-layout">
          <div className="welcome-copy"><div className="atlas-route"><span className="route-circle"/><span className="route-path"/><span className="route-circle"/><span className="route-end"/></div>
            <span className="section-kicker">{t.private}</span><h1>{t.signInTitle}</h1><p>{t.signInBody}</p>
            <button className="primary-button google-button" onClick={handleGoogleSignIn} disabled={working}><Icon name="google" size={19}/>{working ? "…" : t.signIn}<Icon name="arrow" size={17}/></button>
            {error && <p className="inline-error">{error}</p>}
            <div className="welcome-trust"><Icon name="lock" size={15}/><span>{t.private} · {t.uploadLimit}</span></div>
          </div>
          <div className="welcome-map" aria-hidden="true"><div className="map-lines"><i className="map-line red"/><i className="map-line blue"/><i className="map-line amber"/><i className="map-line green"/>{[0,1,2,3,4,5,6,7].map((x) => <b key={x} className={`station station-${x}`}/>)}</div><div className="map-caption"><span>{t.mapSubtitle}</span><strong>{t.mapTitle}</strong><i>TIPSTASH / INDEX</i></div></div>
        </section> : !profile ? <Modal title={t.usernameSetup} onClose={() => {}}>
          <form className="form-stack" onSubmit={saveProfile}><p className="form-explainer">{t.usernameSetupNote}</p><label>{t.username}<div className="username-field"><span>@</span><input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={24} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,23}"/></div></label><label>{t.displayName}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60}/></label><p className="field-note">{t.usernameRule}</p><button className="primary-button" disabled={working}>{working ? "…" : t.continue}<Icon name="arrow" size={16}/></button></form>
        </Modal> : selectedTopic ? <section className="topic-screen">
          <div className="topic-heading">
            <div className="topic-heading-main"><div className="topic-route-mark"><RouteMarks tone="line-blue"/><span>{selectedTopic.role === "owner" ? t.owner : selectedTopic.role === "editor" ? t.editor : t.viewer}</span></div><h1>{selectedTopic.title}</h1><p>{selectedTopic.description || t.noDescription}</p>
              <div className="topic-meta"><span className="access-pill"><Icon name={selectedTopic.publicShareId ? "globe" : "lock"} size={13}/>{selectedTopic.publicShareId ? t.publicLink : selectedTopic.role === "owner" ? t.privateBadge : t.sharedBadge}</span><span className="dot-separator"/>{tips.length} {t.tips}</div>
            </div>
            {selectedTopic.coverImagePath && <AssetPreview path={selectedTopic.coverImagePath} alt="" className="topic-cover"/>}
            <div className="topic-heading-actions">{canEdit && <button className="secondary-button" onClick={() => setShareModal(true)}><Icon name="share" size={16}/>{t.share}</button>}</div>
          </div>
          <div className="topic-workspace">
            <section className="tip-index-panel">
              <div className="panel-title-row"><div><span className="section-kicker">{t.library}</span><h2>{t.blocks}</h2></div>{canEdit && <button className="small-primary" onClick={startNewTip}><Icon name="plus" size={16}/>{t.newTip}</button>}</div>
              {tips.length === 0 ? <div className="empty-tips"><div className="empty-route"><span/><i/><span/></div><h3>{t.noTips}</h3><p>{t.emptyBody}</p>{canEdit && <button className="text-button" onClick={startNewTip}>{t.addFirstTip}<Icon name="arrow" size={15}/></button>}</div> : <div className="tip-index-list">{tips.map((tip, index) => <button key={tip.id} className={`tip-row ${selectedTipId === tip.id ? "active" : ""}`} onClick={() => { setDraft(null); setSelectedTipId(tip.id); }}>
                <span className="tip-row-index">{String(index + 1).padStart(2, "0")}</span><span className="tip-row-station"><i/></span><span className="tip-row-copy"><strong>{tip.title || t.untitled}</strong><small>{tip.summary || `${tip.blocks?.length ?? 0} ${t.blocks.toLowerCase()}`}</small></span><Icon name="chevron" size={16} className="tip-row-chevron"/>
              </button>)}</div>}
            </section>
            <section className="tip-detail-panel">
              {draft && canEdit ? <form className="tip-editor" onSubmit={saveTip}>
                <div className="editor-heading"><div><span className="section-kicker">{draft.id ? t.editTip : t.newTip}</span><h2>{draft.id ? t.editTip : t.newTip}</h2></div><button type="button" className="icon-button" aria-label={t.cancel} onClick={() => { setDraft(null); setSelectedTipId(null); }}><Icon name="close"/></button></div>
                <label>{t.tipTitle}<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required maxLength={120}/></label>
                <label>{t.tipSummary}<textarea rows={2} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} maxLength={240}/></label>
                <div className="editor-block-heading"><h3>{t.blocks}</h3><span>{draft.blocks.length}</span></div>
                {draft.blocks.map((block, index) => <div className="block-editor" key={block.id}>
                  <div className="block-editor-top"><span><Icon name={block.type === "steps" ? "steps" : block.type === "image" ? "image" : block.type === "file" ? "file" : block.type === "label" ? "tag" : "text"} size={15}/>{block.type === "text" ? t.textBlock : block.type === "steps" ? t.stepsBlock : block.type === "image" ? t.imageBlock : block.type === "label" ? t.labelBlock : t.fileBlock}</span><div><button type="button" className="tiny-icon" onClick={() => moveBlock(index, -1)} disabled={index === 0} aria-label={t.moveUp}><Icon name="arrow-up" size={14}/></button><button type="button" className="tiny-icon" onClick={() => moveBlock(index, 1)} disabled={index === draft.blocks.length - 1} aria-label={t.moveDown}><Icon name="arrow-down" size={14}/></button><button type="button" className="tiny-icon danger" onClick={() => removeBlock(index)} aria-label={t.remove}><Icon name="trash" size={14}/></button></div></div>
                  {block.type === "text" && <textarea rows={3} placeholder={t.textBlock} value={block.text} onChange={(event) => patchBlock(index, { text: event.target.value })}/>}
                  {block.type === "steps" && <><textarea rows={4} placeholder={t.stepHint} value={block.items.join("\n")} onChange={(event) => patchBlock(index, { items: event.target.value.split("\n") })}/><small className="field-note">{t.stepHint}</small></>}
                  {block.type === "label" && <div className="label-editor"><input placeholder={t.labelHint} value={block.text} onChange={(event) => patchBlock(index, { text: event.target.value })}/><select value={block.tone} onChange={(event) => patchBlock(index, { tone: event.target.value as LabelTone })}>{tones.map((tone) => <option key={tone} value={tone}>{routeNames[tone]}</option>)}</select><select value={block.style} onChange={(event) => patchBlock(index, { style: event.target.value as "solid" | "outline" })}><option value="solid">{t.solid}</option><option value="outline">{t.outline}</option></select></div>}
                  {block.type === "image" && <div className="block-file-preview"><AssetPreview path={block.path} alt={block.alt} className="block-image-thumb"/><input value={block.alt} aria-label="Image description" onChange={(event) => patchBlock(index, { alt: event.target.value })}/></div>}
                  {block.type === "file" && <div className="block-file-preview file-preview"><Icon name="file"/><span>{block.name}</span><small>{(block.size / 1024 / 1024).toFixed(1)} MB</small></div>}
                </div>)}
                <div className="add-blocks"><button type="button" onClick={() => appendBlock("text")}><Icon name="text" size={15}/>{t.addText}</button><button type="button" onClick={() => appendBlock("steps")}><Icon name="steps" size={15}/>{t.addSteps}</button><button type="button" onClick={() => appendBlock("label")}><Icon name="tag" size={15}/>{t.addLabel}</button><label className="upload-control"><Icon name="image" size={15}/>{t.addImage}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBlock(file); event.currentTarget.value = ""; }}/></label><label className="upload-control"><Icon name="file" size={15}/>{t.attachFile}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBlock(file); event.currentTarget.value = ""; }}/></label></div>
                <p className="field-note upload-limit-note">{t.uploadLimit}</p>
                <div className="editor-actions"><button type="button" className="text-button" onClick={() => setDraft(null)}>{t.cancel}</button><button className="primary-button" disabled={working || !draft.title.trim()}>{working ? "…" : t.saveTip}<Icon name="check" size={16}/></button></div>
              </form> : selectedTip ? <article className="tip-reader">
                <div className="reader-heading"><div><span className="section-kicker">{t.route} {String(tips.findIndex((tip) => tip.id === selectedTip.id) + 1).padStart(2, "0")}</span><h2>{selectedTip.title || t.untitled}</h2>{selectedTip.summary && <p>{selectedTip.summary}</p>}</div>{canEdit && <div className="reader-actions"><button className="secondary-button" onClick={() => editTip(selectedTip)}>{t.editTip}</button><button className="icon-button" aria-label="Delete tip" onClick={() => removeTip(selectedTip)}><Icon name="trash" size={16}/></button></div>}</div>
                <div className="reader-route"><RouteMarks tone="line-blue"/><span>{selectedTopic.title}</span><i/></div>
                <div className="reader-blocks">{(selectedTip.blocks ?? []).map((block) => <BlockView key={block.id} block={block}/>)}</div>
                {selectedTip.blocks?.length === 0 && <p className="reader-no-content">{t.noDescription}</p>}
                <div className="reader-footer"><Icon name="lock" size={14}/>{selectedTopic.role === "owner" ? t.privateBadge : t.allAccess}</div>
              </article> : <div className="tip-placeholder"><div className="placeholder-route"><span/><i/><span/></div><h2>{tips.length ? t.emptyTitle : t.noTips}</h2><p>{tips.length ? t.libraryIntro : t.emptyBody}</p>{canEdit && <button className="text-button" onClick={startNewTip}>{t.newTip}<Icon name="arrow" size={15}/></button>}</div>}
            </section>
          </div>
        </section> : <section className="library-screen">
          <div className="library-intro"><div><span className="section-kicker">{activeView === "shared" ? t.shared : t.private}</span><h1>{activeView === "shared" ? t.shared : t.libraryTitle}</h1><p>{t.libraryIntro}</p></div><button className="primary-button" onClick={() => setTopicModal(true)}><Icon name="plus" size={17}/>{t.newTopic}</button></div>
          {invitations.length > 0 && <div className="invitation-strip"><div><span className="invitation-mark"><Icon name="share" size={17}/></span><span><strong>{invitations.length} {t.invitation}{invitations.length > 1 ? "s" : ""}</strong><small>{t.inviteNote}</small></span></div><div className="invitation-list">{invitations.map((invitation) => <button key={invitation.id} className="accept-button" disabled={working} onClick={() => acceptInvitation(invitation)}>{t.accept} · {invitation.role === "editor" ? t.editor : t.viewer}</button>)}</div></div>}
          {!user.emailVerified && <div className="verify-email-note">{t.inviteNote}</div>}
          <div className="library-index-bar"><div><span className="route-column">{t.route}</span><span>{t.topicName}</span></div><span>{activeView === "shared" ? t.access : t.updated}</span></div>
          {visibleTopics.length === 0 ? <div className="empty-library"><div className="empty-map" aria-hidden="true"><i/><i/><i/><b/><b/><b/><b/></div><div><h2>{search ? t.noResults : topics.length ? t.noResults : t.emptyTitle}</h2><p>{search ? t.noResults : topics.length ? t.noResults : t.emptyBody}</p>{!search && activeView === "all" && <button className="primary-button" onClick={() => setTopicModal(true)}><Icon name="plus" size={17}/>{t.firstTopic}</button>}</div></div> : <div className="topic-index-list">{visibleTopics.map((topic, index) => <button className="topic-index-row" key={topic.id} onClick={() => openTopic(topic)}>
            <span className="topic-index-route"><span className={`route-number tone-dot-${tones[index % tones.length]}`}>{String(index + 1).padStart(2, "0")}</span><i className={`route-stroke tone-stroke-${tones[index % tones.length]}`}/></span><span className="topic-index-name"><strong>{topic.title}</strong><small>{topic.description || t.noDescription}</small></span><span className="topic-index-state"><span className="access-pill"><Icon name={topic.publicShareId ? "globe" : topic.role === "owner" ? "lock" : "share"} size={13}/>{topic.publicShareId ? t.publicLink : topic.role === "owner" ? t.privateBadge : topic.role === "editor" ? t.editor : t.viewer}</span><small>{topic.role === "owner" ? t.owner : t.sharedBadge}</small></span><Icon name="arrow" className="topic-index-arrow" size={17}/>
          </button>)}</div>}
          <div className="library-footer"><div className="footer-transit"><span/><i/><span/><i/><span/></div><span>{visibleTopics.length} {t.topic}{visibleTopics.length === 1 ? "" : "s"}</span><span>{t.private}</span></div>
        </section>}
        <footer className="app-footer"><span>Tipstash</span><span>{t.footerTagline}</span><span>© {new Date().getFullYear()}</span></footer>
      </div>
    </main>

    {topicModal && <Modal title={t.newTopic} onClose={() => setTopicModal(false)}><form className="form-stack" onSubmit={createTopic}><label>{t.topicName}<input autoFocus value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} required maxLength={90}/></label><label>{t.topicDescription}<textarea rows={3} value={topicDescription} onChange={(event) => setTopicDescription(event.target.value)} maxLength={300}/></label><label>{t.cover}<span className="field-note">{t.uploadLimit}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}/></label><div className="private-default"><Icon name="lock" size={15}/><span>{t.privateBadge}</span><small>{t.private}</small></div><div className="modal-actions"><button type="button" className="text-button" onClick={() => setTopicModal(false)}>{t.cancel}</button><button className="primary-button" disabled={working || !topicTitle.trim()}>{working ? "…" : t.create}<Icon name="arrow" size={16}/></button></div></form></Modal>}

    {shareModal && selectedTopic && <Modal title={t.shareWith} onClose={() => setShareModal(false)} wide><div className="share-content">
      <p className="form-explainer">{t.allAccess}: <strong>{selectedTopic.title}</strong></p>
      <label className="role-select-label">{t.access}<select value={shareRole} onChange={(event) => setShareRole(event.target.value as TopicRole)}><option value="viewer">{t.viewer}</option><option value="editor">{t.editor}</option></select></label>
      <div className="share-columns"><form className="share-method" onSubmit={lookupAccount}><div className="share-method-title"><span className="share-icon"><Icon name="user" size={17}/></span><div><strong>{t.username}</strong><small>{t.exactMatch}</small></div></div><div className="share-input-row"><span>@</span><input value={lookupUsername} onChange={(event) => { setLookupUsername(event.target.value); setLookupResult(null); }} placeholder="username" required minLength={3} maxLength={24}/><button className="secondary-button" disabled={shareBusy}>{t.lookup}</button></div>{lookupResult && <div className="lookup-result">{lookupResult.avatarUrl ? <Image width={26} height={26} unoptimized src={lookupResult.avatarUrl} alt="" referrerPolicy="no-referrer"/> : <span className="avatar avatar-fallback">{lookupResult.displayName.slice(0, 1).toUpperCase()}</span>}<span><strong>{lookupResult.displayName}</strong><small>@{lookupResult.username}</small></span><button type="button" className="small-primary" onClick={() => sendShare({ username: lookupResult.username })} disabled={shareBusy}>{t.share}</button></div>}</form>
        <form className="share-method" onSubmit={(event) => { event.preventDefault(); void sendShare({ email: inviteEmail }); }}><div className="share-method-title"><span className="share-icon"><Icon name="file" size={17}/></span><div><strong>{t.email}</strong><small>{t.pending}</small></div></div><div className="share-input-row"><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" required/><button className="secondary-button" disabled={shareBusy}>{t.invite}</button></div><p className="field-note">{t.inviteNote}</p></form></div>
      {lookupError && <p className="inline-error" role="alert">{lookupError}</p>}
      <div className="public-link-panel"><div className="public-link-copy"><span className="share-icon"><Icon name="globe" size={17}/></span><div><strong>{t.publicLink}</strong><small>{t.linkWarning}</small></div></div>{selectedTopic.publicShareId ? <div className="public-link-controls"><code>{typeof window === "undefined" ? "" : window.location.origin}/s/{selectedTopic.publicShareId}</code><button className="secondary-button" onClick={copyPublicLink}><Icon name={copied ? "check" : "copy"} size={15}/>{copied ? t.copied : t.copyLink}</button><button className="revoke-button" onClick={() => setPublicLink(false)} disabled={working}>{t.revokeLink}</button></div> : <button className="secondary-button" onClick={() => setPublicLink(true)} disabled={working}><Icon name="plus" size={15}/>{t.createLink}</button>}</div>
    </div></Modal>}
  </div>;
}
