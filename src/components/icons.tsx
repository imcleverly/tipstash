import type { SVGProps } from "react";

export type IconName = "library" | "search" | "plus" | "settings" | "share" | "lock" | "globe" | "arrow" | "arrow-up" | "arrow-down" | "close" | "chevron" | "file" | "image" | "text" | "steps" | "tag" | "spark" | "more" | "copy" | "check" | "google" | "user" | "menu" | "eye" | "trash" | "upload" | "home";

const paths: Record<IconName, React.ReactNode> = {
  library: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19"/><path d="M6 4v15a1 1 0 0 0 1 1h12V6H7a1 1 0 0 1-1-1Z"/><path d="M9 9h7M9 13h7M9 17h4"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4 4"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.3v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2H15v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.5 1Z"/></>,
  share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5m-7.6 6.9 7.6 4.5"/></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  "arrow-up": <path d="m6 14 6-6 6 6"/>,
  "arrow-down": <path d="m6 10 6 6 6-6"/>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
  text: <><path d="M4 6h16M4 10h16M4 14h12M4 18h8"/></>,
  steps: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></>,
  tag: <><path d="M20 13 13 20 4 11V4h7z"/><circle cx="8" cy="8" r="1"/></>,
  spark: <><path d="m12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  google: <><path fill="currentColor" stroke="none" d="M21.35 12.2c0-.7-.06-1.4-.18-2.08H12v3.94h5.24a4.5 4.5 0 0 1-1.94 2.95v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.26Z"/><path fill="currentColor" stroke="none" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.59-1.98.94-3.31.94-2.55 0-4.71-1.72-5.49-4.04H3.26v2.53A9.74 9.74 0 0 0 12 21.5Z"/><path fill="currentColor" stroke="none" d="M6.51 13.59A5.85 5.85 0 0 1 6.2 12c0-.55.1-1.08.31-1.59V7.88H3.26A9.73 9.73 0 0 0 2.25 12c0 1.57.38 3.06 1.01 4.12l3.25-2.53Z"/><path fill="currentColor" stroke="none" d="M12 6.37c1.43 0 2.72.49 3.73 1.48l2.8-2.8C16.83 3.47 14.62 2.5 12 2.5a9.74 9.74 0 0 0-8.74 5.38l3.25 2.53c.78-2.32 2.94-4.04 5.49-4.04Z"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  eye: <><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  trash: <><path d="M4 7h16m-10 4v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></>,
  upload: <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M5 14v5h14v-5"/></>,
  home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/></>,
};

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
