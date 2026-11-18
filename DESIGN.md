# Tipstash visual system

## Direction

Tipstash is a private knowledge library drawn as a midnight transit atlas. A familiar topic index remains the product's structure; transit cartography contributes the palette, humanist sans-serif voice, precise density, and a single route-line signature.

## Product screen

- A dark navy sidebar carries the library and the user's topic list.
- A warm paper workspace uses standard search, buttons, inputs, and topic rows.
- Topic rows use numbered stations joined by a short route segment. Tips continue as a vertical route through the detail pane.
- Read-only shared topics keep the same structure and remove every edit affordance.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Midnight | `#102A43` | Primary navigation and key actions |
| Deep blue | `#173A56` | Hover and pressed action states |
| Paper | `#F5F3EE` | Main application ground |
| Surface | `#FFFEFA` | Inputs and reading surfaces |
| Ink | `#1B2C35` | Main text |
| Muted ink | `#576C75` | Secondary text |
| Rule | `#DEDFD8` | Dividers and table edges |
| Scarlet | `#C84E50` | Route identity and destructive emphasis |
| Cobalt | `#3C769D` | Selected route and link emphasis |
| Amber | `#AD7417` | Labels and caution states |
| Verdant | `#238362` | Access and success states |

## Type and shape

- Use IBM Plex Sans for the humanist signage voice across controls, labels, and reading text. The font is self-hosted under `public/fonts` with its SIL Open Font License.
- Use a compact 9–13 px label scale and clear 18–38 px heading steps.
- Keep the main reading measure below 70 characters.
- Use small 4–8 px corner radii; avoid decorative pills except for access and route labels.
- Keep borders visible on the paper ground. Use shadows only for overlays.

## Signature move

Route lines connect station markers between topics and through ordered tip blocks. Use the motif to clarify location and sequence; do not use it as a background pattern on every section.

## Interaction and state

- Private is the default. Access changes are explicit and reversible.
- Focus uses a 3 px amber ring. Hover shifts the surface slightly; it does not move or scale the control.
- Upload states report file type and 25 MB limits before storage is attempted.
- Respect reduced motion; motion only marks loading and an interaction state.
- Public links display a read-only label and lose access immediately when revoked.

## Boundaries

Do not put email addresses in username search results. Public links expose the entire topic and its tips, and are revocable. Images and files are fetched through Firebase Storage rules so the topic's current access state is checked on each read.
