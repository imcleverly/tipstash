import { createHash } from "node:crypto";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  photoUrl: string | null;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!apiKey || !idToken) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { users?: Array<{ localId?: string; email?: string; emailVerified?: boolean; displayName?: string; photoUrl?: string }> };
  const user = data.users?.[0];
  if (!user?.localId) return null;
  return {
    uid: user.localId,
    email: (user.email ?? "").toLowerCase(),
    emailVerified: user.emailVerified === true,
    displayName: user.displayName ?? "",
    photoUrl: user.photoUrl ?? null,
  };
}

export function emailSha256(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

export function firestoreUrl(path: string): string {
  if (!projectId) throw new Error("Firebase project is not configured");
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

export function firestoreBearer(idToken: string): HeadersInit {
  return { authorization: `Bearer ${idToken}` };
}

export function restFieldString(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return String((value as { stringValue?: unknown }).stringValue ?? "");
}

export async function isApprovedFirebaseUser(user: VerifiedFirebaseUser, idToken: string): Promise<boolean> {
  if (user.emailVerified && user.email === "tuananhdao.dev.js@gmail.com") return true;
  const response = await fetch(firestoreUrl(`accessRequests/${encodeURIComponent(user.uid)}`), {
    headers: firestoreBearer(idToken),
    cache: "no-store",
  });
  if (!response.ok) return false;
  const request = await response.json() as { fields?: Record<string, unknown> };
  return restFieldString(request.fields?.status) === "approved";
}
