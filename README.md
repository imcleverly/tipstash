# Tipstash

Tipstash is a Vietnamese-first, bilingual private library for practical tips and tricks. Each topic is private by default and can be shared with a viewer/editor or through a revocable, read-only link.

The interface uses a self-hosted IBM Plex Sans variable font. Its SIL Open Font License is included in `public/fonts/OFL.txt`.

## Local setup

1. Install Node.js 20+ and pnpm.
2. Copy .env.example to .env.local and set the Firebase web configuration.
3. Run pnpm install, then pnpm dev.
4. In Firebase Authentication, enable Google as a sign-in provider and add the local and Vercel domains to Authorized domains.
5. Create the Firestore database in asia-southeast1. Deploy rules and indexes with firebase deploy --only firestore:rules,firestore:indexes.

## Firebase Storage

The default bucket must be created in asia-southeast1. New Firebase Storage buckets require the Blaze plan. Create the bucket only after billing is configured, then deploy Storage rules with firebase deploy --only storage and apply storage.cors.json to the bucket so the browser can read files through the Storage SDK.

Every upload is limited to 25 MB. The interface accepts JPEG, PNG, WebP, GIF, AVIF, PDF, Microsoft Office, and OpenDocument files. Storage rules repeat the size and content-type checks.

## Data model

- users/{uid}: private account profile including verified email.
- usernames/{username}: exact-match display index.
- topics/{topicId}: owner, title, description, cover path, visibility, and active public share id.
- topics/{topicId}/tips/{tipId}: ordered TipBlock[] content.
- topics/{topicId}/members/{uid}: viewer or editor role.
- invitations/{invitationId}: pending email or username invitation, claimable only by the matching verified email or username.
- publicShares/{shareId}: active/revoked link state for one whole topic.

Server endpoints verify Firebase ID tokens before username lookup and invitation creation. Public reads use an unguessable share id and the Firebase Web SDK, which continues to enforce Firestore rules. No Admin SDK credential is stored in Vercel.

## Checks

- pnpm typecheck
- pnpm lint
- pnpm test:rules (Firestore and Storage emulators require Java)
- pnpm build
