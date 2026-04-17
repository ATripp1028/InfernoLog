# InfernoLog — Time Machine

## Overview

The Time Machine is a historical visualization of a user's personal difficulty ranking over time. It shows how a player's top N hardest demons have evolved — as harder levels are beaten, the lines climb, telling the story of a player's progression.

The icon uses the **mirror portal** from Geometry Dash, both as a visual metaphor for looking back in time through reflection, and as a pun on the base game level "Time Machine," which introduces the mirror portal mechanic.

---

## Visualization

The Time Machine is a **multi-line graph** built with Visx:

```
Difficulty
(list rank/tier)
    ▲
    │                              ╭──────────────
    │                         ╭───╯   #1 hardest
    │                    ╭────╯
    │               ╭────╯
    │          ╭────╯              ╭──────────────
    │     ╭────╯              ╭───╯   #2 hardest
    │╭────╯              ╭────╯
    ││                ───╯         ╭──────────────
    ││───────────────╯         ────╯   #3 hardest
    │
    └──────────────────────────────────────────►
    2019   2020   2021   2022   2023   2024      Time
           ◄──────────────────────────►
                  draggable range slider
```

- Each line represents one slot in the user's top N hardest levels
- Lines move upward as harder levels are beaten and displace earlier entries
- The Y axis is positioned by the user's primary list reference (GDDL tier by default)
- The X axis is time, with configurable range and default breakpoints at each year
- A **draggable range slider** below the graph controls the visible time window, updating the graph in real time

---

## Data Requirements

### Minimum Requirements Per Level

A completion must have **at least one community-recognized list reference** (GDDL tier, Pointercrate rank, AREDL rank, etc.) to appear in the Time Machine. Completions without any list reference are excluded and a prompt nudges the user to assign one.

### Retroactive History

When a user logs a completion with a historical date (including via spreadsheet import), it is automatically placed at the correct point in the timeline. This means importing an existing spreadsheet reconstructs the full Time Machine history from day one — a key onboarding benefit.

```
Import spreadsheet with 5 years of completions
              │
              ▼
Time Machine fully populated retroactively
              │
              ▼
User sees their complete demon history on first login
```

---

## Configuration

| Setting | Default | Notes |
|---|---|---|
| Top N | 10 | How many levels to track simultaneously. User-configurable |
| Y axis source | User's primary list reference | Follows the list priority chain from settings |
| Default time range | Current year | Adjustable via slider |
| Range presets | Per year | Quick buttons: "2019", "2020", etc., plus "All time" |

---

## Interaction

- **Hover** on a data point → tooltip showing level name, tier/rank, date beaten, thumbnail
- **Click** on a data point → navigate to that completion's entry in the log
- **Drag slider** → time window updates in real time, lines animate smoothly
- **Toggle N** → add or remove lines from the top of the ranking

---

## Y Axis: List Reference Priority

The Y axis position of each completion is determined by its list references, using the same priority chain as auto-placement:

```
GDDL tier (if assigned)
  → AREDL rank
    → Pointercrate rank
      → NLW tier
        → Other
```

If a completion's primary list reference changes (user updates it), the Time Machine recalculates that data point's Y position accordingly.

Cross-list comparisons on the Y axis use the community-maintained conversion table (v2) to normalize different list scales to a common axis. In v1, the Y axis only plots levels sharing the same primary list source consistently — levels with different primary sources may appear on separate lines or be flagged visually.

---

## Uncertain Dates

Completions with `date_uncertain = true` are plotted with a **dashed line segment** or subtle indicator at that data point, communicating that the exact position on the X axis is approximate. This is especially relevant for imported historical data.

---

## Version Notes

- **v2:** Time Machine ships as part of the intelligence feature set
- The data model supports it from v1 since completion dates are stored from the beginning
- The longer a user logs before v2, the richer their Time Machine history will be on launch
