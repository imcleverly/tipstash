import { NextResponse } from "next/server";
import { firestoreUrl, verifyFirebaseIdToken } from "@/lib/firebase-rest";
import type { ShareAudience, Tip, TipBlock, Topic } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FirestoreDocument = { name?: string; fields?: Record<string, unknown> };

function decodeValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  const fields = value as Record<string, unknown>;
  if ("stringValue" in fields) return fields.stringValue;
  if ("integerValue" in fields) return Number(fields.integerValue);
  if ("doubleValue" in fields) return Number(fields.doubleValue);
  if ("booleanValue" in fields) return fields.booleanValue;
  if ("nullValue" in fields) return null;
  if ("timestampValue" in fields) return fields.timestampValue;
  if ("arrayValue" in fields) {
    const items = (fields.arrayValue as { values?: unknown[] } | undefined)?.values ?? [];
    return items.map(decodeValue);
  }
  if ("mapValue" in fields) {
    const map = (fields.mapValue as { fields?: Record<string, unknown> } | undefined)?.fields ?? {};
    return Object.fromEntries(Object.entries(map).map(([key, item]) => [key, decodeValue(item)]));
  }
  return undefined;
}

function decodeFields(document: FirestoreDocument) {
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]));
}

function documentId(document: FirestoreDocument) {
  return document.name?.split("/").at(-1) ?? "";
}

async function firestoreFetch(path: string, idToken: string | null, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (idToken) headers.set("authorization", `Bearer ${idToken}`);
  if (init?.body) headers.set("content-type", "application/json");
  return fetch(firestoreUrl(path), { ...init, headers, cache: "no-store" });
}

function unavailable(status = 404) {
  return NextResponse.json({ error: "This share link is unavailable." }, { status, headers: { "cache-control": "no-store, private" } });
}

export async function GET(request: Request, context: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return unavailable();

  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const caller = idToken ? await verifyFirebaseIdToken(idToken) : null;
  if (idToken && !caller) return unavailable(401);

  try {
    const shareResponse = await firestoreFetch(`publicShares/${encodeURIComponent(shareId)}`, idToken);
    if (shareResponse.status === 401 || shareResponse.status === 403) {
      return NextResponse.json({ error: idToken ? "An administrator must approve this account before it can view this topic." : "Sign in with an administrator-approved account to view this topic.", reason: idToken ? "approval-required" : "sign-in-required" }, {
        status: idToken ? 403 : 401,
        headers: { "cache-control": "no-store, private" },
      });
    }
    if (!shareResponse.ok) return unavailable();
    const shareDocument = await shareResponse.json() as FirestoreDocument;
    const share = decodeFields(shareDocument) as { active?: boolean; topicId?: string; audience?: ShareAudience };
    if (share.active !== true || typeof share.topicId !== "string") return unavailable();
    const audience: ShareAudience = share.audience === "approvedUsers" ? "approvedUsers" : "anyone";
    if (share.audience && share.audience !== "anyone" && share.audience !== "approvedUsers") return unavailable();
    if (audience === "approvedUsers") {
      if (!caller) return NextResponse.json({ error: "Sign in with an administrator-approved account to view this topic.", reason: "sign-in-required" }, { status: 401, headers: { "cache-control": "no-store, private" } });
      if (!caller.emailVerified) return NextResponse.json({ error: "An administrator must approve this account before it can view this topic.", reason: "approval-required" }, { status: 403, headers: { "cache-control": "no-store, private" } });
    }

    const topicResponse = await firestoreFetch(`topics/${encodeURIComponent(share.topicId)}`, idToken);
    if (!topicResponse.ok) return unavailable();
    const topicDocument = await topicResponse.json() as FirestoreDocument;
    const topic = decodeFields(topicDocument);
    const tipsResponse = await firestoreFetch(`topics/${encodeURIComponent(share.topicId)}:runQuery`, idToken, {
      method: "POST",
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: "tips" }],
        orderBy: [{ field: { fieldPath: "position" }, direction: "ASCENDING" }],
      } }),
    });
    if (!tipsResponse.ok) return unavailable();
    const tipRows = await tipsResponse.json() as Array<{ document?: FirestoreDocument }>;
    const tips = tipRows.flatMap(({ document }) => {
      if (!document) return [];
      const value = decodeFields(document);
      return [{
        id: documentId(document),
        title: value.title ?? "",
        summary: value.summary ?? "",
        blocks: value.blocks ?? [],
        position: value.position ?? 0,
      } as Tip];
    });

    return NextResponse.json({
      topic: {
        id: documentId(topicDocument),
        title: topic.title,
        description: topic.description ?? "",
        coverImagePath: topic.coverImagePath ?? null,
      } as Topic,
      tips: tips.map((tip) => ({ ...tip, blocks: tip.blocks as TipBlock[] })),
      audience,
    }, { headers: { "cache-control": "no-store, private" } });
  } catch {
    return unavailable();
  }
}
