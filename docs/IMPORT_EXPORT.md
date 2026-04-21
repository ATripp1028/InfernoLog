# InfernoLog — Import & Export

## Overview

InfernoLog supports importing data from spreadsheets and exporting data back to spreadsheets. The import and export formats are **identical** — a user can export their data, modify it, and re-import it cleanly. This also means the import template is simply a blank copy of the export format.

Spreadsheet import is a **v1 feature** because onboarding friction is the biggest risk to early adoption. Players with years of existing spreadsheet data should be able to bring that history into InfernoLog on day one, including full Time Machine reconstruction from historical completion dates.

---

## File Format

**SheetJS (xlsx)** is used for both import and export. The file contains multiple tabs:

| Tab | Contents |
|---|---|
| `Completions` | All completion progress updates (is_completion = true) |
| `Progress` | All non-completion progress updates (optional, included on export if user chooses) |
| `Dropped` | All dropped level entries |
| `WantToBeat` | Want-to-beat list |
| `Lists` | Custom lists and favorites |

Import processes `Completions` and `Dropped` tabs. Other tabs are supported in later versions.

---

## Date Format Handling

Date format is the most critical import concern given the global player base.

### Format Selection

Before uploading, the user selects their date format:

```
┌────────────────────────────────────────┐
│  What date format does your sheet use? │
│                                        │
│  ○ MM/DD/YYYY  (US)                    │
│  ○ DD/MM/YYYY  (International)         │
│  ○ YYYY/MM/DD  (ISO with slashes)      │
│  ○ YYYY-MM-DD  (ISO with dashes)       │
└────────────────────────────────────────┘
```

This selection pre-populates from the user's `date_format_preference` account setting but can be overridden per-import.

### Silent Handling

These are resolved automatically without flagging:
- Missing leading zeros (`1/4/2019` → `2019-04-01`)
- Two-digit years (`19` → `2019`, valid since GD released in 2013)
- Dashes vs. slashes as separators

### Flagged for Manual Resolution

These are included in the validation report:
- Dates unparseable in the selected format
- Ambiguous dates (e.g. `04/05/2019` when the format could be either MDY or DMY and the values are ≤ 12)
- Dates written as phrases (`"April 5th 2019"`, `"early 2019"`)

### Internal Storage

All dates stored as **ISO 8601 (YYYY-MM-DD)** regardless of input format. Displayed back to the user in their `date_format_preference`.

---

## Import Flow

```
┌─────────────────────────────────────────────────┐
│                  Import Flow                    │
│                                                 │
│  1. User downloads template (= blank export)   │
│                                                 │
│  2. User fills in template OR reformats         │
│     their existing sheet to match              │
│                                                 │
│  3. User selects date format                   │
│                                                 │
│  4. User uploads file                          │
│                                                 │
│  5. Validation pass runs:                      │
│     ├── Parse all dates                        │
│     ├── Check required fields                  │
│     ├── Flag ambiguous/invalid rows            │
│     └── Preview: X rows valid, Y rows flagged  │
│                                                 │
│  6. User reviews validation report             │
│     ├── Fix flagged rows and re-upload, OR     │
│     └── Proceed importing valid rows only      │
│                                                 │
│  7. Import commits valid rows                  │
│     └── Flagged rows skipped with report       │
└─────────────────────────────────────────────────┘
```

### Validation Report

The validation report shows flagged rows before committing any data:

```
Import Preview: 847 rows valid, 3 rows flagged

Row 14 — Carnage Mode — Date "June 18" unparseable. Please use MM/DD/YYYY.
Row 67 — Phobos — Date "07/28/19" ambiguous in DD/MM format. Is this July 28 or Aug 7?
Row 203 — Bloodbath — Attempts field contains "~10000". Remove non-numeric characters.

[ Fix and re-upload ]  [ Import 847 valid rows, skip 3 ]
```

---

## Completions Tab Format

| Column | Required | Notes |
|---|---|---|
| `level_id` | Yes | In-game level ID |
| `level_name` | No | If blank, autofilled from GDBrowser |
| `date` | No | In selected date format |
| `date_uncertain` | No | TRUE/FALSE |
| `attempts` | No | Integer |
| `percentage` | No | Worst fail / last logged percentage |
| `run_from` | No | Integer 1-100 |
| `run_to` | No | Integer 1-100 |
| `on_stream` | No | TRUE/FALSE |
| `fps` | No | Integer |
| `enjoyment` | No | 0-10 |
| `simple_rating` | No | 0-10 |
| `in_game_difficulty` | No | Text snapshot |
| `gddl_tier` | No | Numeric tier |
| `pointercrate_rank` | No | Numeric rank |
| `aredl_rank` | No | Numeric rank |
| `nlw_tier` | No | Tier name |
| `notes` | No | Text |
| `video_url` | No | URL |
| `highlight_url` | No | URL |

### Column Tolerance

- Extra columns in the user's sheet are ignored
- Column order does not matter — columns are matched by header name
- Header names are case-insensitive and whitespace-tolerant (`"Level ID"`, `"level_id"`, `"LevelID"` all match)

---

## Dropped Tab Format

| Column | Required | Notes |
|---|---|---|
| `level_id` | Yes | |
| `level_name` | No | |
| `best_progress` | No | Percentage |
| `run_from` | No | |
| `run_to` | No | |
| `attempts_at_drop` | No | |
| `dropped_at` | No | Date |
| `reason` | No | Text |
| `gddl_tier_at_drop` | No | Snapshot |

---

## Export Options

When exporting, the user chooses:

```
┌─────────────────────────────────────────┐
│             Export Options              │
│                                         │
│  Data to include:                       │
│  ○ Current filtered view only           │
│  ● Full unfiltered log                  │
│                                         │
│  Non-completion entries:                │
│  ○ Exclude (completions only)           │
│  ● Include all progress updates         │
│                                         │
│  List references:                       │
│  Always included (all sources)          │
│                                         │
│            [ Export .xlsx ]             │
└─────────────────────────────────────────┘
```

---

## Template Download

A blank template file is always available for download from the import screen. It contains:
- All column headers with correct names
- One example row (clearly marked as example, to be deleted)
- A second tab with field descriptions and valid value ranges

The template is identical to an export file, making the workflow for existing spreadsheet users:

```
Export from InfernoLog → modify → re-import  (round-trip safe)
Existing sheet → reformat to match template → import
```
