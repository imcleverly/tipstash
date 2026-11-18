import { NextResponse } from "next/server";
import { emailSha256, firestoreBearer, firestoreUrl, restFieldString, verifyFirebaseIdToken } from "@/lib/firebase-rest";
import type { TopicRole } from "@/lib/types";

export const dynamic = "force-dynamic";

function restString(value: string) {
  return { stringValue: value };
}

function validDocumentId(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export async function POST(request: Request) {
  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const caller = idToken ? await verifyFirebaseIdToken(idToken) : null;
  if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let body: { topicId?: unknown; role?: unknown; username?: unknown; email?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "The invitation details are incomplete." }, { status: 400 });
  }
  const topicId = typeof body.topicId === "string" ? body.topicId : "";
  const role: TopicRole = body.role === "editor" ? "editor" : "viewer";
  if (!validDocumentId(topicId)) return NextResponse.json({ error: "That topic could not be found." }, { status: 400 });

  const headers = { ...firestoreBearer(idToken!), "content-type": "application/json" };
  if (typeof body.username === "string" && body.username.trim()) {
    const username = body.username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)) {
      return NextResponse.json({ error: "Check the username and try again." }, { status: 400 });
    }
    const profileResponse = await fetch(firestoreUrl(`usernames/${encodeURIComponent(username)}`), {
      headers: firestoreBearer(idToken!),
      cache: "no-store",
    });
    if (profileResponse.status === 404) return NextResponse.json({ error: "No account uses that username." }, { status: 404 });
    if (!profileResponse.ok) return NextResponse.json({ error: "Could not find that account." }, { status: 502 });
    const profile = (await profileResponse.json()) as { fields?: Record<string, unknown> };
    const targetUid = restFieldString(profile.fields?.uid);
    if (!validDocumentId(targetUid) || targetUid === caller.uid) {
      return NextResponse.json({ error: "Choose another account." }, { status: 400 });
    }
    const response = await fetch(`${firestoreUrl(`topics/${topicId}/members`)}?documentId=${encodeURIComponent(targetUid)}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields: {
        uid: restString(targetUid),
        role: restString(role),
        addedAt: { timestampValue: new Date().toISOString() },
      } }),
    });
    if (response.status === 409) return NextResponse.json({ error: "That person already has access to this topic." }, { status: 409 });
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "Only the owner or an editor can share this topic." }, { status: response.status });
    if (!response.ok) return NextResponse.json({ error: "Could not share this topic." }, { status: 502 });
    return NextResponse.json({ status: "shared", username, role });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (caller.email && caller.email === email) return NextResponse.json({ error: "This topic is already in your library." }, { status: 400 });

  const invitationId = crypto.randomUUID();
  const response = await fetch(`${firestoreUrl("invitations")}?documentId=${invitationId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fields: {
      topicId: restString(topicId),
      inviterUid: restString(caller.uid),
      invitedEmail: restString(email),
      inviteeEmailHash: restString(emailSha256(email)),
      role: restString(role),
      status: restString("pending"),
      createdAt: { timestampValue: new Date().toISOString() },
    } }),
  });
  if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "Only the owner or an editor can invite someone." }, { status: response.status });
  if (!response.ok) return NextResponse.json({ error: "Could not create the invitation." }, { status: 502 });
  return NextResponse.json({ status: "pending", invitationId, role });
}
