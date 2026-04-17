# InfernoLog — Design Language

This document defines InfernoLog's visual identity, iconography, color system, and typography. It serves as a brief for designers and as context for AI tools generating UI components. The overarching goal is an app that feels immediately native to the Geometry Dash community — made by a player, not an outsider.

---

## Design Philosophy

InfernoLog's visual identity draws from three sources:

1. **GD's own visual vocabulary** — difficulty icons, portal mechanics, the demon aesthetic
2. **The "inferno" name** — fire, heat, darkness, deep reds and oranges
3. **Modern dashboard apps** — clean, data-dense, dark mode by default

The result should feel like a premium tool built specifically for the GD community, not a generic web app that happens to track demons. Every GD player who opens InfernoLog should have a moment of recognition — "this was made by one of us."

---

## Color System

### Base Palette

```
--color-bg-base:       #0d0d0d   Page background — near black
--color-bg-surface:    #171717   Card / panel backgrounds
--color-bg-elevated:   #212121   Modals, dropdowns, tooltips
--color-bg-subtle:     #2a2a2a   Subtle separators, hover states
--color-border:        #333333   Standard borders
--color-border-subtle: #242424   De-emphasized borders
```

### Primary — Inferno Red/Orange

The primary brand color family. Used for CTAs, active states, the InfernoLog wordmark, and the FAB.

```
--color-primary:       #e8390e   Main CTA, FAB, active nav indicator
--color-primary-hover: #ff4d1f   Hover state
--color-primary-light: #ff6b35   Secondary highlights, links
--color-primary-dim:   #e8390e1a Tinted backgrounds (10% opacity)
```

### Accent — Amber

Used for secondary highlights, warning-adjacent states, and GDDL tier indicators in the mid-difficulty range.

```
--color-accent:        #ff9f1c   Secondary CTAs, highlights
--color-accent-hover:  #ffb347   Hover
--color-accent-dim:    #ff9f1c1a Tinted backgrounds
```

### Semantic Colors

```
--color-success:       #22c55e   Completion indicator, accepted record badge
--color-success-dim:   #22c55e1a
--color-warning:       #f59e0b   Uncertain date, needs placement, pending nudge
--color-warning-dim:   #f59e0b1a
--color-danger:        #ef4444   Dropped status, delete actions, banned status
--color-danger-dim:    #ef4444 1a
--color-info:          #3b82f6   Informational states, GDDL tier badges (low range)
--color-info-dim:      #3b82f61a
```

### Text

```
--color-text-primary:  #f5f5f5   Primary body text
--color-text-secondary:#a3a3a3   Secondary / muted text, metadata
--color-text-tertiary: #666666   Placeholder text, disabled states
--color-text-inverse:  #0d0d0d   Text on light backgrounds (rare)
```

### Dark Mode Only

InfernoLog is **dark mode only** in v1. The GD community skews toward dark interfaces, the inferno color palette reads dramatically better on dark backgrounds, and maintaining a light mode adds significant UI complexity for no meaningful user benefit at this stage. A light mode toggle can be reconsidered in a later version.

---

## Typography

### Fonts

**Display / Headings: Pusab**
GD's iconic in-game font. Used selectively for maximum impact — level names, section hero titles, the InfernoLog wordmark. Not used for body text or data-dense UI where legibility at small sizes matters.

Pusab is free for personal use. Verify licensing for commercial web app use before deploying. If licensing is a blocker, **Fredoka One** or **Nunito** are reasonable fallbacks that share Pusab's rounded, friendly character.

**Body / UI: Inter**
The modern standard for dashboard and data applications. Clean, highly legible at small sizes, excellent number rendering (important for attempt counts, tiers, ranks). Inter is the default for all UI text that isn't a display element.

**Monospace: JetBrains Mono**
Used sparingly for level IDs, API keys, and any technical strings where character distinction matters.

### Type Scale

```
--text-xs:   12px / 1.4  Metadata, badges, tooltips
--text-sm:   14px / 1.5  Secondary UI, table cells
--text-base: 16px / 1.6  Body text, form inputs
--text-lg:   18px / 1.5  Card titles, section headers
--text-xl:   20px / 1.4  Page section titles
--text-2xl:  24px / 1.3  Page titles
--text-3xl:  30px / 1.2  Hero/display text (Inter)
--text-4xl:  36px / 1.1  Wordmark, major display (Pusab)
```

---

## Iconography

### Icon Library

**Lucide React** is the primary icon library for standard UI actions. Clean, consistent stroke-based icons that suit the dark dashboard aesthetic.

### GD Official Game Assets

InfernoLog uses official Geometry Dash in-game assets for GD-specific UI elements. This is established practice in the GD community — GDDL, GDBrowser, Pointercrate, and virtually every major community tool uses in-game assets. RobTop has historically been fully supportive of community tools and has never taken action against projects using his assets this way.

**Attribution:** All game assets are the property of RobTop Games. InfernoLog is an unofficial fan tool, not affiliated with or endorsed by RobTop Games. A credits note appears on the acknowledgments page.

**Asset extraction:** GD's sprite sheets are extractable from the game files. GDBrowser's GitHub repo is the recommended reference for how the community has already organized these assets in web-friendly formats. Store extracted assets in `apps/web/public/assets/gd/` and serve through CloudFront as static assets. Extract at the highest available resolution for crisp rendering at all screen densities.

### GD Assets Used

#### Difficulty Faces
**Used for:** Difficulty indicators on list entries, ranking entries, level page headers
**Asset:** Official GD difficulty face sprites — auto, easy, normal, hard, harder, insane, easy demon, medium demon, hard demon, insane demon, extreme demon
**Notes:** Use the exact in-game sprites. Players recognize these instantly at any size. The extreme demon face (red, horned) is InfernoLog's primary demon indicator.

#### Mirror Portal
**Used for:** Time Machine navigation icon and page header
**Asset:** Official GD mirror portal sprite
**Notes:** The mirror portal is both the in-game asset for the "Time Machine" level (which introduces it) and a visual metaphor for looking back in time via reflection. At sidebar nav size (24px), use a simplified crop of the portal. At page header size (48px+), use the full sprite.

#### Practice Mode Checkpoint Flag
**Used for:** In Progress section nav icon and status badge
**Asset:** Official GD practice mode flag sprite (yellow/gold flag)
**Notes:** Immediately recognizable to any GD player as "mid-attempt." No community member will need this explained.

#### Star / Diamond
**Used for:** Enjoyment and rating display
**Asset:** Official GD star sprite (classic) and/or diamond sprite (newer)
**Notes:** Use in place of generic star ratings. The GD star has a distinctive styled appearance that reinforces the app's identity. Star for enjoyment (a personal feeling), diamond for rating (a more objective assessment) is a reasonable distinction.

#### Orbs and Portals (Supporting)
**Used for:** Decorative elements, section accents, empty states
**Asset:** Various GD orb and portal sprites as appropriate
**Notes:** Use sparingly as supporting decoration — not as primary UI elements. Empty states and section headers are appropriate locations.

### Custom Assets (No In-Game Equivalent)

These concepts have no direct in-game equivalent and require original design:

#### Dropped Level Indicator
**Used for:** Dropped section nav icon and status badge
**Design notes:** "Dropping" a level is a community concept, not an in-game mechanic. Options:
- A crossed-out practice flag (most legible — combines "in progress" + "stopped")
- A cracked or broken orb (evokes failure without being too harsh)
- A flag with an X overlay

The crossed-out flag approach is recommended since it visually connects to the In Progress icon (same flag, different state), telling a clear visual story.

#### NONG Indicator (v2)
**Used for:** Small badge on level entries that require a NONG
**Design notes:** No in-game equivalent — NONG is a community workaround concept. A music note with a strikethrough or question mark overlay communicates "song not standard." Keep it small and subtle — this is secondary information.

### Generic Icons (Lucide)

Standard UI actions use Lucide without customization:

| Element | Lucide Icon |
|---|---|
| Settings | `Settings` |
| Notifications | `Bell` |
| Add / Log new | `Plus` (inside FAB) |
| Search | `Search` |
| Sort | `ArrowUpDown` |
| Filter | `Filter` |
| Export | `Download` |
| Import | `Upload` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| Video link | `Play` |
| Highlight link | `Film` |
| External link | `ExternalLink` |
| Copy | `Copy` |
| Drag handle | `GripVertical` |
| Collapse/expand | `ChevronDown` |
| Close | `X` |
| Confirmed/accepted | `CheckCircle2` |
| Uncertain date | `HelpCircle` |
| Private entry | `EyeOff` |
| Needs placement | `AlertCircle` |
| On stream | `Radio` |
| GDDL | `Link` |
| Pointercrate | `Trophy` |

---

## Difficulty Color Coding

The GD community has established color conventions for difficulty tiers. InfernoLog should honor these where possible to feel immediately native.

### NLW Tier Colors

These are the colors Zeronium's spreadsheet and the broader community use. Apply as badge backgrounds on list references:

```
Beginner:     #6495ED  Cornflower blue
Easy:         #00BFFF  Deep sky blue
Medium:       #32CD32  Lime green
Hard:         #FFD700  Gold
Very Hard:    #FF8C00  Dark orange
Insane:       #FF0000  Red
Remorseless:  #9400D3  Dark violet
```

### GDDL Tier Colors

GDDL uses a gradient from easier (blue/green) to harder (red/purple). Rather than mapping exact colors per tier (which shift as the list updates), use a computed gradient:

```
Tiers 1-10:   Blue family   (#3b82f6 → #6366f1)
Tiers 11-20:  Green family  (#22c55e → #eab308)
Tiers 21-30:  Orange family (#f97316 → #ef4444)
Tiers 31+:    Red/Purple    (#dc2626 → #9333ea)
```

This is approximate — the community does not have a strict canonical color per GDDL tier the way NLW does, so a gradient is more maintainable.

### Pointercrate / AREDL

No established community color convention. Use the primary/accent palette for these badges with the list source name as the primary identifier.

---

## Component Patterns

### Level Entry Card

The level entry card is the most frequently rendered component in the app — it appears in the List, the Ranking, the placement modal, the Level Picker results, and user lists. Getting it right is the highest-priority design task.

```
┌─────────────────────────────────────────────────────┐
│ ████  Level Name                    ⭐ 8.5  😊 9   │
│ thumbnail  Creator · Song                           │
│       [GDDL 28] [PC #47]  ✓ Record  📹 🎬          │
│       Apr 15 2024 · 4,429 attempts · 94% worst fail │
└─────────────────────────────────────────────────────┘
```

Key decisions:
- Thumbnail on the left (levelthumbs, with placeholder fallback)
- Level name prominent, creator and song secondary
- List reference badges inline, color-coded by tier/rank range
- Rating and enjoyment visible at a glance
- Media links (video, highlight) as small icon buttons
- Metadata (date, attempts, worst fail) de-emphasized at the bottom
- Demon face difficulty indicator subtle — not the dominant element

### Status Badges

```
[ ✓ Completed ]   green background
[ ⚡ In Progress ] amber background
[ ✕ Dropped ]     red/muted background
[ ? Unconfirmed ] warning background — needs placement
[ ~ Uncertain ]   muted — applied to date display
```

### The FAB

Large, circular, fixed position. Bottom-right on desktop, bottom-center on mobile (above the bottom nav bar). Primary color (`--color-primary`). Contains a `Plus` icon. On click, opens a bottom sheet or modal with options:

```
[ Log progress on a level ]   ← primary
[ Add to Want to Beat      ]
[ Add to a list            ]
```

The first option is the overwhelmingly most common action and should be visually dominant.

---

## Motion & Animation

Keep animations purposeful and brief. The GD community is accustomed to fast, responsive feedback from the game itself.

```
Transition duration: 150ms for micro-interactions (hover, focus)
                     250ms for panel open/close
                     350ms for page transitions
Easing:             ease-out for elements entering
                    ease-in for elements leaving
                    ease-in-out for position changes (drag-and-drop)
```

The Time Machine graph should animate smoothly when the range slider is dragged — use `requestAnimationFrame` rather than CSS transitions for this since it's data-driven rather than state-driven.

Drag-and-drop reordering in the Ranking should have a satisfying but snappy feel — the dragged item should feel physically responsive, not floaty.

---

## Spacing & Layout

```
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
```

**Sidebar width:** 240px expanded, 64px collapsed (icon only)
**Content max-width:** 1200px centered
**Card border-radius:** 8px (consistent throughout)
**Badge border-radius:** 4px
**Button border-radius:** 6px
**FAB border-radius:** 50% (circular)

---

## Responsive Breakpoints

```
Mobile:   < 768px   Bottom nav, single column, no sidebar
Tablet:   768-1024px Collapsed sidebar (icons only), two column where applicable
Desktop:  > 1024px  Full sidebar, multi-column layouts
```

The Time Machine graph requires special mobile handling — the drag slider becomes a touch slider, and the number of visible lines (top N) should default lower on mobile (5 instead of 10) to avoid an unreadable graph.
