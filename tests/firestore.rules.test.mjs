import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, doc, getDoc, getDocs, query, runTransaction, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";

const projectId = "tipstash-imcleverly";
const topic = (ownerId, extra = {}) => ({
  ownerId,
  title: "Private topic",
  description: "",
  coverImagePath: null,
  visibility: "private",
  publicShareId: null,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  ...extra,
});
const emailHash = (email) => createHash("sha256").update(email.toLowerCase()).digest("hex");
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

beforeEach(async () => env.clearFirestore());
after(async () => env?.cleanup());

test("new topics are private by default and stay hidden from other accounts", async () => {
  const owner = env.authenticatedContext("owner-1").firestore();
  const stranger = env.authenticatedContext("stranger-1").firestore();
  const unauthenticated = env.unauthenticatedContext().firestore();
  const privateTopic = doc(owner, "topics/private-topic");
  await assertSucceeds(setDoc(privateTopic, topic("owner-1")));
  await assertSucceeds(getDoc(privateTopic));
  await assertFails(getDoc(doc(stranger, "topics/private-topic")));
  await assertFails(getDoc(doc(unauthenticated, "topics/private-topic")));
  await assertFails(setDoc(doc(owner, "topics/public-by-default"), topic("owner-1", { visibility: "unlisted", publicShareId: "share-1" })));
  await assertFails(getDocs(collection(stranger, "topics")));
  await assertSucceeds(getDocs(query(collection(owner, "topics"), where("ownerId", "==", "owner-1"))));
});

test("username reads are exact-get only and user email stays private", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "usernames/maple_road"), { username: "maple_road", displayName: "Maple", avatarUrl: "" });
    await setDoc(doc(db, "users/person-1"), { uid: "person-1", email: "private@example.com", username: "maple_road" });
  });
  const lookup = env.authenticatedContext("lookup-user").firestore();
  const other = env.authenticatedContext("other-user").firestore();
  const publicProfile = (await getDoc(doc(lookup, "usernames/maple_road"))).data();
  assert.deepEqual(Object.keys(publicProfile).sort(), ["avatarUrl", "displayName", "username"]);
  assert.equal(publicProfile.displayName, "Maple");
  await assertFails(getDocs(collection(lookup, "usernames")));
  await assertFails(getDoc(doc(other, "users/person-1")));
  await assertFails(getDocs(collection(other, "users")));
});

test("username profiles can be created and renamed transactionally without exposing account ids", async () => {
  const owner = env.authenticatedContext("profile-owner", { email: "owner@example.com" }).firestore();
  const other = env.authenticatedContext("profile-other").firestore();
  const userRef = doc(owner, "users/profile-owner");
  const originalUsernameRef = doc(owner, "usernames/maple_road");

  await assertSucceeds(runTransaction(owner, async (transaction) => {
    const [usernameSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(originalUsernameRef),
      transaction.get(userRef),
    ]);
    assert.equal(usernameSnapshot.exists(), false);
    assert.equal(profileSnapshot.exists(), false);
    transaction.set(originalUsernameRef, {
      username: "maple_road",
      displayName: "Maple",
      avatarUrl: "https://example.com/avatar.png",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    transaction.set(userRef, {
      uid: "profile-owner",
      email: "owner@example.com",
      username: "maple_road",
      displayName: "Maple",
      avatarUrl: "https://example.com/avatar.png",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }));

  const publicProfile = (await getDoc(doc(other, "usernames/maple_road"))).data();
  assert.deepEqual(Object.keys(publicProfile).sort(), ["avatarUrl", "createdAt", "displayName", "updatedAt", "username"]);
  assert.equal(publicProfile.displayName, "Maple");
  assert.equal((await getDoc(doc(owner, "users/profile-owner"))).data().email, "owner@example.com");
  await assertFails(getDoc(doc(other, "users/profile-owner")));

  const renamedUsernameRef = doc(owner, "usernames/maple-grove");
  await assertSucceeds(runTransaction(owner, async (transaction) => {
    const [newUsernameSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(renamedUsernameRef),
      transaction.get(userRef),
    ]);
    assert.equal(newUsernameSnapshot.exists(), false);
    assert.equal(profileSnapshot.data().username, "maple_road");
    transaction.delete(originalUsernameRef);
    transaction.set(renamedUsernameRef, {
      username: "maple-grove",
      displayName: "Maple Grove",
      avatarUrl: "https://example.com/avatar.png",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    transaction.set(userRef, {
      ...profileSnapshot.data(),
      username: "maple-grove",
      displayName: "Maple Grove",
      updatedAt: Timestamp.now(),
    });
  }));

  assert.equal((await getDoc(doc(other, "usernames/maple_road"))).exists(), false);
  assert.equal((await getDoc(doc(other, "usernames/maple-grove"))).data().displayName, "Maple Grove");

  const attacker = env.authenticatedContext("profile-attacker", { email: "attacker@example.com" }).firestore();
  await assertFails(runTransaction(attacker, async (transaction) => {
    const occupiedUsernameRef = doc(attacker, "usernames/maple-grove");
    const attackerProfileRef = doc(attacker, "users/profile-attacker");
    await Promise.all([transaction.get(occupiedUsernameRef), transaction.get(attackerProfileRef)]);
    transaction.set(occupiedUsernameRef, { username: "maple-grove", displayName: "Attacker", avatarUrl: "" });
    transaction.set(attackerProfileRef, {
      uid: "profile-attacker",
      email: "attacker@example.com",
      username: "maple-grove",
      displayName: "Attacker",
      avatarUrl: "",
    });
  }));
});

test("viewer can read inherited topic tips while editors can add and change tips", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "topics/topic-a"), topic("owner-1"));
    await setDoc(doc(db, "topics/topic-a/members/viewer-1"), { uid: "viewer-1", role: "viewer" });
    await setDoc(doc(db, "topics/topic-a/members/editor-1"), { uid: "editor-1", role: "editor" });
    await setDoc(doc(db, "topics/topic-a/tips/tip-a"), { title: "Saved tip", summary: "", blocks: [], position: 0, createdBy: "owner-1", createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  });
  const viewer = env.authenticatedContext("viewer-1").firestore();
  const editor = env.authenticatedContext("editor-1").firestore();
  const owner = env.authenticatedContext("owner-1").firestore();
  const stranger = env.authenticatedContext("stranger-1").firestore();
  assert.equal((await getDoc(doc(viewer, "topics/topic-a/members/viewer-1"))).data().role, "viewer");
  assert.equal((await getDoc(doc(editor, "topics/topic-a/members/editor-1"))).data().role, "editor");
  await assertSucceeds(getDoc(doc(editor, "topics/topic-a")));
  await assertSucceeds(setDoc(doc(editor, "topics/topic-a/members/invitee-1"), { uid: "invitee-1", role: "viewer", addedAt: Timestamp.now() }));
  await assertSucceeds(setDoc(doc(owner, "topics/topic-a/tips/tip-owner"), { title: "Owner tip", summary: "", blocks: [], position: 0, createdBy: "owner-1", createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  await assertSucceeds(getDoc(doc(viewer, "topics/topic-a")));
  await assertSucceeds(getDoc(doc(viewer, "topics/topic-a/tips/tip-a")));
  await assertSucceeds(setDoc(doc(editor, "topics/topic-a/tips/tip-b"), { title: "Editor tip", summary: "", blocks: [], position: 1, createdBy: "editor-1", createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  await assertFails(setDoc(doc(viewer, "topics/topic-a/tips/blocked"), { title: "No", summary: "", blocks: [], position: 2, createdBy: "viewer-1", createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  await assertFails(getDoc(doc(stranger, "topics/topic-a/tips/tip-a")));
  const sharedMembers = await getDocs(query(collectionGroup(viewer, "members"), where("uid", "==", "viewer-1")));
  assert.equal(sharedMembers.size, 1);
});

test("verified email invitations can be claimed once by the matching account", async () => {
  const email = "reader@example.com";
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "topics/topic-invite"), topic("owner-1"));
  });
  const owner = env.authenticatedContext("owner-1").firestore();
  assert.equal((await getDoc(doc(owner, "topics/topic-invite"))).data().ownerId, "owner-1");
  await assertSucceeds(setDoc(doc(owner, "invitations/invite-a"), {
    topicId: "topic-invite",
    inviterUid: "owner-1",
    invitedEmail: email,
    inviteeEmailHash: emailHash(email),
    role: "viewer",
    status: "pending",
    createdAt: Timestamp.now(),
  }));
  const invitee = env.authenticatedContext("reader-1", { email, email_verified: true }).firestore();
  const wrongEmail = env.authenticatedContext("wrong-1", { email: "wrong@example.com", email_verified: true }).firestore();
  const unverified = env.authenticatedContext("unverified-1", { email, email_verified: false }).firestore();
  await assertSucceeds(getDoc(doc(invitee, "invitations/invite-a")));
  await assertFails(getDoc(doc(wrongEmail, "invitations/invite-a")));
  await assertFails(getDoc(doc(unverified, "invitations/invite-a")));
  const batch = writeBatch(invitee);
  batch.set(doc(invitee, "topics/topic-invite/members/reader-1"), { uid: "reader-1", role: "viewer", invitationId: "invite-a", addedAt: Timestamp.now() });
  batch.update(doc(invitee, "invitations/invite-a"), { status: "accepted", acceptedBy: "reader-1", acceptedAt: Timestamp.now() });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(invitee, "topics/topic-invite")));
});

test("username invitations expose no account id and can only be claimed by the named user", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "topics/topic-username-invite"), topic("owner-1"));
    await setDoc(doc(db, "users/owner-1"), { uid: "owner-1", email: "owner@example.com", username: "ownername" });
    await setDoc(doc(db, "users/person-1"), { uid: "person-1", email: "private@example.com", username: "maple_road" });
    await setDoc(doc(db, "usernames/ownername"), { username: "ownername", displayName: "Owner", avatarUrl: "" });
    await setDoc(doc(db, "usernames/maple_road"), { username: "maple_road", displayName: "Maple", avatarUrl: "" });
  });
  const owner = env.authenticatedContext("owner-1").firestore();
  await assertSucceeds(setDoc(doc(owner, "invitations/username-invite"), {
    topicId: "topic-username-invite",
    inviterUid: "owner-1",
    inviteeUsername: "maple_road",
    role: "editor",
    status: "pending",
    createdAt: Timestamp.now(),
  }));

  const invitee = env.authenticatedContext("person-1", { email: "private@example.com", email_verified: false }).firestore();
  const stranger = env.authenticatedContext("other-user").firestore();
  const received = await getDocs(query(
    collection(invitee, "invitations"),
    where("inviteeUsername", "==", "maple_road"),
    where("status", "==", "pending"),
  ));
  assert.equal(received.size, 1);
  await assertFails(getDoc(doc(stranger, "invitations/username-invite")));
  await assertFails(getDocs(query(
    collection(stranger, "invitations"),
    where("inviteeUsername", "==", "maple_road"),
    where("status", "==", "pending"),
  )));

  const batch = writeBatch(invitee);
  batch.set(doc(invitee, "topics/topic-username-invite/members/person-1"), {
    uid: "person-1",
    role: "editor",
    invitationId: "username-invite",
    addedAt: Timestamp.now(),
  });
  batch.update(doc(invitee, "invitations/username-invite"), {
    status: "accepted",
    acceptedBy: "person-1",
    acceptedAt: Timestamp.now(),
  });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(invitee, "topics/topic-username-invite")));
});

test("unlisted topics are readable through an active link and stop after revocation", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "topics/topic-public"), topic("owner-1", { visibility: "unlisted", publicShareId: "share-a" }));
    await setDoc(doc(db, "topics/topic-public/tips/tip-a"), { title: "Public tip", summary: "", blocks: [], position: 0, createdBy: "owner-1", createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    await setDoc(doc(db, "publicShares/share-a"), { topicId: "topic-public", ownerUid: "owner-1", active: true, createdAt: Timestamp.now() });
  });
  const visitor = env.unauthenticatedContext().firestore();
  const owner = env.authenticatedContext("owner-1").firestore();
  await assertSucceeds(getDoc(doc(visitor, "publicShares/share-a")));
  await assertSucceeds(getDoc(doc(visitor, "topics/topic-public")));
  await assertSucceeds(getDocs(collection(visitor, "topics/topic-public/tips")));
  await assertSucceeds(updateDoc(doc(owner, "publicShares/share-a"), { active: false, revokedAt: Timestamp.now() }));
  await assertFails(getDoc(doc(visitor, "publicShares/share-a")));
  await assertFails(getDoc(doc(visitor, "topics/topic-public")));
  await assertFails(getDoc(doc(visitor, "topics/topic-public/tips/tip-a")));
});
