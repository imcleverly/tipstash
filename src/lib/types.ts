export type Locale = "vi" | "en";
export type TopicRole = "viewer" | "editor" | "admin";
export type TopicVisibility = "private" | "unlisted";
export type ShareAudience = "anyone" | "approvedUsers";
export type LabelTone = "line-red" | "line-blue" | "line-amber" | "line-green" | "ink";

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicUser {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Topic {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  coverImagePath: string | null;
  visibility: TopicVisibility;
  publicShareId: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  role?: TopicRole | "owner";
}

export type TipBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "steps"; items: string[] }
  | { id: string; type: "image"; path: string; alt: string }
  | { id: string; type: "label"; text: string; tone: LabelTone; style: "solid" | "outline" }
  | { id: string; type: "file"; path: string; name: string; mimeType: string; size: number };

export interface Tip {
  id: string;
  title: string;
  summary: string;
  blocks: TipBlock[];
  position: number;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TopicMember {
  uid: string;
  role: TopicRole;
  invitationId?: string;
  addedAt?: unknown;
}

export interface TopicInvitation {
  id: string;
  topicId: string;
  inviterUid: string;
  inviteeUsername?: string;
  invitedEmail?: string;
  inviteeEmailHash?: string;
  role: TopicRole;
  status: "pending" | "accepted" | "revoked";
  createdAt?: unknown;
  acceptedBy?: string;
  acceptedAt?: unknown;
}

export interface AccessRequest {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: "pending" | "approved";
  createdAt?: unknown;
  approvedAt?: unknown;
  approvedBy?: string;
}

export interface PublicShareLink {
  id: string;
  topicId: string;
  ownerUid: string;
  active: boolean;
  audience?: ShareAudience;
  createdAt?: unknown;
  revokedAt?: unknown;
}
