import { NextResponse } from "next/server";
import { firestoreBearer, firestoreUrl, isApprovedFirebaseUser, restFieldString, verifyFirebaseIdToken } from "@/lib/firebase-rest";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const caller = idToken ? await verifyFirebaseIdToken(idToken) : null;
  if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!(await isApprovedFirebaseUser(caller, idToken!))) return NextResponse.json({ error: "An administrator must approve your account first." }, { status: 403 });

  let username = "";
  try {
    const body = (await request.json()) as { username?: unknown };
    username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Enter a username to search." }, { status: 400 });
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)) {
    return NextResponse.json({ error: "Usernames use 3–24 letters, numbers, dots, dashes or underscores." }, { status: 400 });
  }

  const response = await fetch(firestoreUrl(`usernames/${encodeURIComponent(username)}`), {
    headers: firestoreBearer(idToken!),
    cache: "no-store",
  });
  if (response.status === 404) return NextResponse.json({ user: null });
  if (!response.ok) return NextResponse.json({ error: "Could not look up that username." }, { status: 502 });
  const document = (await response.json()) as { fields?: Record<string, unknown> };
  return NextResponse.json({
    user: {
      username: restFieldString(document.fields?.username),
      displayName: restFieldString(document.fields?.displayName),
      avatarUrl: restFieldString(document.fields?.avatarUrl) || null,
    },
  });
}
