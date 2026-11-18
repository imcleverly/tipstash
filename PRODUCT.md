# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js and TypeScript, deployed on Vercel; Firebase Authentication, Cloud Firestore, and Cloud Storage.

## Users

People who want a private place to collect and retrieve practical tips and tricks, with optional collaboration by username or email.

## Product Purpose

Tipstash lets people organize topics and their associated tips, then retrieve details such as instructions, images, labels, and attachments when needed. Success means users can save a useful tip quickly and share a topic with only the access they intend.

## Operating Context

Users organize knowledge into topics and tips. A topic may be shared with named collaborators or exposed through an unlisted public link. The app is bilingual in Vietnamese and English and starts in Vietnamese.

## Capabilities and Constraints

- Topics have cover images and contain multiple tips. Tip content is an ordered set of rich-text, step, image, styled-label, and file-attachment blocks.
- New topics are private. Topic access is granted with viewer or editor roles; tips inherit topic access.
- Users sign in with Google and choose unique usernames. Exact-username lookup reveals only the username, display name, and avatar.
- Email sharing resolves existing Firebase users; an unmatched email remains a pending invitation until someone signs in with that same verified email. No outbound email service is part of the initial release.
- Public links are unlisted, read-only, scoped to a whole topic, and revocable.
- Images and PDF/Office attachments are stored in Firebase Storage, up to 25 MB per file. Cloud Storage for Firebase requires the Blaze pay-as-you-go plan; usage may be billed beyond no-cost allowances.
- Firestore and Storage use the `asia-southeast1` region. Source code is public in `imcleverly/tipstash`; production deployment is on Vercel.

## Product Principles

- Private by default; sharing is an explicit owner action.
- Preserve the structure and supporting material that make each tip useful.
- Make access levels understandable and enforce them at the data boundary.
- Keep user emails private while allowing account discovery by exact username.
- Support Vietnamese and English throughout the interface.

## Evidence on Hand

There is no existing app, customer data, logo, or product artwork. Do not invent testimonials, usage figures, or sample customer content.

## Brand Commitments

The product name is Tipstash. No visual identity or brand assets have been specified.
