import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const projectId = "tipstash-imcleverly";
const maxBytes = 25 * 1024 * 1024;
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});

beforeEach(async () => env.clearFirestore());
after(async () => env?.cleanup());

async function seedTopic(extra = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "topics/topic-files"), {
      ownerId: "owner-1", title: "Files", description: "", coverImagePath: null,
      visibility: "private", publicShareId: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), ...extra,
    });
    await setDoc(doc(db, "topics/topic-files/members/viewer-1"), { uid: "viewer-1", role: "viewer" });
    await setDoc(doc(db, "topics/topic-files/members/editor-1"), { uid: "editor-1", role: "editor" });
  });
}

test("Storage accepts supported images and PDF files up to 25 MB", async () => {
  await seedTopic();
  const owner = env.authenticatedContext("owner-1").storage();
  await assertSucceeds(uploadBytes(ref(owner, "topics/topic-files/files/cover.png"), new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
  await assertSucceeds(uploadBytes(ref(owner, "topics/topic-files/files/guide.pdf"), new Uint8Array(maxBytes), { contentType: "application/pdf" }));
});

test("Storage rejects oversized and unsupported uploads", async () => {
  await seedTopic();
  const owner = env.authenticatedContext("owner-1").storage();
  await assertFails(uploadBytes(ref(owner, "topics/topic-files/files/too-large.pdf"), new Uint8Array(maxBytes + 1), { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(owner, "topics/topic-files/files/script.svg"), new Uint8Array([1, 2]), { contentType: "image/svg+xml" }));
  await assertFails(uploadBytes(ref(owner, "topics/topic-files/files/archive.zip"), new Uint8Array([1, 2]), { contentType: "application/zip" }));
});

test("topic viewers may download files but cannot upload", async () => {
  await seedTopic();
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), "topics/topic-files/files/private.png"), new Uint8Array([8, 9]), { contentType: "image/png" });
  });
  const viewer = env.authenticatedContext("viewer-1").storage();
  await assertSucceeds(getBytes(ref(viewer, "topics/topic-files/files/private.png")));
  await assertFails(uploadBytes(ref(viewer, "topics/topic-files/files/new.png"), new Uint8Array([1]), { contentType: "image/png" }));
});

test("editors can upload while unshared accounts cannot access topic files", async () => {
  await seedTopic();
  const editor = env.authenticatedContext("editor-1").storage();
  await assertSucceeds(uploadBytes(ref(editor, "topics/topic-files/files/editor.webp"), new Uint8Array([1]), { contentType: "image/webp" }));
  const stranger = env.authenticatedContext("stranger-1").storage();
  await assertFails(getBytes(ref(stranger, "topics/topic-files/files/editor.webp")));
});

test("public file access follows the share state and ends after revocation", async () => {
  await seedTopic({ visibility: "unlisted", publicShareId: "share-files" });
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "publicShares/share-files"), { topicId: "topic-files", ownerUid: "owner-1", active: true, createdAt: Timestamp.now() });
    await uploadBytes(ref(context.storage(), "topics/topic-files/files/public.png"), new Uint8Array([2, 3]), { contentType: "image/png" });
  });
  const visitor = env.unauthenticatedContext().storage();
  await assertSucceeds(getBytes(ref(visitor, "topics/topic-files/files/public.png")));
  const owner = env.authenticatedContext("owner-1").firestore();
  await assertSucceeds(updateDoc(doc(owner, "publicShares/share-files"), { active: false, revokedAt: Timestamp.now() }));
  await assertFails(getBytes(ref(visitor, "topics/topic-files/files/public.png")));
});
