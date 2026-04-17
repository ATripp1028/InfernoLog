# InfernoLog — Level Picker

## Overview

The Level Picker is an Akinator-style guided decision tool that helps players choose their next demon to go for. The user answers a series of yes/no questions that progressively filter a pool of levels until a small set of candidates remains, at which point the user picks one or restarts.

---

## Two Modes

```
┌─────────────────────────────────────────────────────┐
│                   Level Picker                      │
│                                                     │
│   ┌───────────────────┐  ┌────────────────────────┐ │
│   │   Personal Mode   │  │   Discovery Mode       │ │
│   │   (v2)            │  │   (v4, post-launch)    │ │
│   │                   │  │                        │ │
│   │ Filters from the  │  │ Filters from all       │ │
│   │ user's want-to-   │  │ levels cached in the   │ │
│   │ beat list         │  │ InfernoLog database    │ │
│   └───────────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Personal Mode (v2):** Immediately useful from day one. Works from the user's own want-to-beat list. Useful for players who have a curated backlog and want help deciding what to tackle next.

**Discovery Mode (v4):** Queries the broader cached level database. Useful for players who want to find something new rather than choose from a personal list. Held until after v4's initial release to ensure meaningful database population.

---

## Question Algorithm

Questions are ordered **dynamically** using a greedy elimination strategy. At each step, the algorithm selects the question whose yes/no split most evenly divides the remaining level pool — maximizing information gained per question.

```
Remaining pool: 40 levels

Available questions and their splits:
  "New hardest?"           → Yes: 8,  No: 32  (imbalanced, low priority)
  "Outside your skillset?" → Yes: 18, No: 22  (near 50/50, high priority)
  "Short level?"           → Yes: 21, No: 19  (near 50/50, high priority)

→ Ask "Outside your skillset?" first
```

After each answer, the pool is filtered and the algorithm recalculates which remaining question produces the best split on the new pool.

### Question Attributes

Each question maps to one or more filterable attributes on the level or user's data:

| Question | Filters On |
|---|---|
| "Going for a new hardest?" | Levels ranked above user's current hardest by primary list source |
| "Outside your skillset?" | Levels whose skill tags don't overlap heavily with user's completions (v3+) |
| "Something short?" | Level length metadata from GDBrowser |
| "Okay with a NONG?" | `levels.is_nong` flag (v2) |
| "Something with a good song rating?" | User's historical song rating scores |
| "A level you've seen others play?" | Presence in InfernoLog database (discovery mode only) |
| "A rated level?" | `levels.is_rated` |
| "A specific difficulty range?" | List reference tier/rank range |

Questions are only asked if they meaningfully split the current pool. A question with a 0/N split (all levels answer the same way) is skipped.

---

## Flow Diagram

```
         ┌──────────────┐
         │  Start Picker │
         └──────┬───────┘
                │
                ▼
    ┌───────────────────────┐
    │  Select pool source   │
    │  Personal / Discovery │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │  Algorithm selects    │◄─────────────┐
    │  best next question   │              │
    └───────────┬───────────┘              │
                │                          │
                ▼                          │
    ┌───────────────────────┐              │
    │  User answers Yes/No  │              │
    └───────────┬───────────┘              │
                │                          │
                ▼                          │
    ┌───────────────────────┐              │
    │  Pool filtered        │              │
    │  Remaining > 5?  ─────┼──── Yes ─────┘
    └───────────┬───────────┘
                │ No (≤ 5 remain)
                ▼
    ┌───────────────────────┐
    │  Show remaining levels│
    │  User picks one       │
    └───────────┬───────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
  ┌──────────┐    ┌─────────────────┐
  │ Selected │    │ None sound good │
  │ a level  │    └────────┬────────┘
  └──────────┘             │
                   ┌───────┴────────┐
                   │                │
                   ▼                ▼
            ┌──────────┐    ┌──────────────┐
            │ Restart  │    │ Go to home   │
            │ picker   │    │ page         │
            └──────────┘    └──────────────┘
```

---

## Result Display

When the pool reaches 5 or fewer levels, results are shown as cards displaying:

- Level thumbnail
- Level name and creator
- GDDL tier or relevant list reference
- Skill tags (v3+)
- Whether it's a NONG (v2)
- A "Go for it" button that adds it to in-progress levels

The user can pick any of the shown levels or choose none and restart or exit.

---

## Version Notes

- **v2:** Personal Mode ships alongside want-to-beat list functionality
- **v4:** Discovery Mode ships after v4's initial release, once the database has meaningful population
- Skill-tag-based questions require v3 skill tag integration to function. They are simply absent from the question pool in v2
- NONG-based questions require v2 NONG fields to function
