# Code Quality

Conventions that apply to how InfernoLog code is written, as distinct from what
it does. Everything here is enforced by review, not by a linter, unless a rule
says otherwise.

The document is split three ways. **All surfaces** governs both apps and
`packages/core`. A rule under **Backend** governs `apps/api` only, and one under
**Frontend** governs `apps/web` only — neither surface's rules should be assumed
to apply to the other, since several on each side are specific to its stack.

A rule reaches the shared section only once a second surface has actually
adopted it, never in anticipation. Both entries there got in that way: the JSDoc
rule was backend-only from 2026-08-07 until the frontend pass on 2026-08-10
adopted it, and the duplication rule had been written out twice, once per
surface, before that same pass found the two were one rule with two reference
examples. Where a shared rule needs a surface-specific answer — where an
extracted helper lands, say — that answer stays in the surface section and is
linked from the shared one.

---

## All surfaces

### 1. Documentation comments

**Every exported symbol carries a JSDoc block, not `//` comments.**

This is the rule with the widest reach and the least room for interpretation.
`//` comments above a declaration are invisible to IDE hover, `tsserver`
tooltips, and generated docs — the exact moments a reader needs them. A well
written `//` comment above an exported function is _worse_ than none, because it
looks like the function is documented while delivering nothing at the call site.

Applies to functions, classes, constants, types, interfaces, and enums. It
applies to the `export`ed surface specifically: internal helpers may use `//`
freely.

```ts
// Wrong — invisible on hover.
// Removes levels from the user's Want to Beat collection.
export async function removeFromWantToBeat(...) {}

// Right.
/**
 * Drops levels out of the user's Want to Beat collection.
 *
 * Called by EVERY completion write path from inside the same transaction that
 * records the completion. That is what keeps the "Want to Beat holds only
 * unbeaten levels" invariant true; a new completion path that forgets this call
 * silently breaks it.
 *
 * @param tx - The caller's transaction client; this must not open its own.
 * @param userId - Internal user UUID.
 * @param levelIds - One level ID or many. An empty array is a no-op.
 */
export async function removeFromWantToBeat(...) {}
```

**What a block must contain**

- A first line saying what the symbol does, in the present tense.
- `@param` for every parameter whose meaning is not obvious from its name and
  type. `levelId: string` needs no gloss; `initialStatus` does, because _when_ it
  applies is the whole point of the parameter.
- `@returns` whenever the return value is conditional, nullable, or a
  discriminated union — say what each case means, not just its type. "Returns
  `null` when the user has no entry for this level" is the useful half.
- `@throws {ErrorClass}` for every error class a caller is expected to catch or
  map. If a service throws it and a route maps it to a status, it is documented.
- `{@link OtherSymbol}` when the reader will need the other symbol to act on
  this one. IDEs turn these into navigable links.

**What a block must not become**

Do not restate the signature in prose. `@param userId - The user ID` earns
nothing and adds a line to maintain. Omit the tag instead.

**Invariants and hazards go in the doc block, not beside the code.** If calling a
function wrongly breaks a system invariant, that warning belongs where a caller
sees it on hover — not buried at the line that enforces it.

**Module header comments stay `//`.** The block at the top of a file explains
the module's role, its mount order, its relationship to siblings. Nothing hovers
over a file, so JSDoc buys nothing there, and `//` visually separates "about this
file" from "about this symbol". Do not duplicate a symbol's JSDoc into the
header — but do check which one you are writing. A one-export file's header is
usually describing that export, and belongs on it.

**Section dividers do not document functions.** A `// ─────` banner above a
function is a layout device that reads as documentation. If it contains prose
about the function beneath it, that prose belongs in that function's JSDoc.
`lib/api/me.ts` carried seven such banners, and the prose inside two of them was
the only written record of a real caveat — that the stored GDDL key is
write-only from the client's side, and why the wire types are hand-mirrored
rather than imported from `packages/core`.

**By surface**

- **Backend.** `@throws {ErrorClass}` for every error class a route module's
  `onError` maps to a status (Backend §1), and the `tx` caveat in Backend §4
  goes in the block rather than beside the code.
- **Frontend.** Components are documented like functions. The block says what
  the component _is_ on the surface it appears on, and `@param` earns its place
  for a prop whose meaning is not obvious from its name and type — a `variant`
  that changes semantics rather than pixels, a `value` that is `null` for a
  reason, a unit the type cannot express. `children: ReactNode` needs no gloss.
- **Frontend.** State units belong in the block. Ratings travel as internal
  0–100 in some places and display units in others; `RatingRow` and
  `lib/ratingScale.ts` say which, at the boundary, because the type is `number`
  either way. Before the 2026-08-10 pass the logging flow's rating row and the
  edit modals' spoke different units under the same name.
- **Frontend.** `src/routes/*` is exempt. Those files are TanStack Router glue
  whose only export is a `Route` from `createFileRoute`; a doc block on it says
  nothing the filename does not.

### 2. Duplication

**One fact expressed in several places is a bug waiting for its next copy.**

Each surface reached this rule on its own, from the same kind of incident.

The backend's was a field mapping. The RobTop→`Level` mapping had been
copy-pasted into five modules and had already drifted: three call sites stamped
`lastCheckedAt` and one did not, so levels upgraded through that path reported a
stale "frozen as of" date. The frontend's was a component. `ResultRow` had been
re-typed four times across three files — two of them identical apart from the
name and type of their one prop, a third grown `added`/`beaten`/`loading` that
the others lacked. `DifficultyOpinionSelect` existed twice byte-identical, each
copy dragging its own `DEMON_OPINIONS` table, one of them also carrying a
hand-written `DifficultyOpinion` union restating the one in `lib/api/logging.ts`.
Nobody introduced any of that deliberately — it is what copies do, and the drift
is the cost.

**Extract to one named thing and give it a JSDoc block saying what it owns.**
`services/levels/robtopMapping.ts` is the backend reference example;
`components/data/LevelResultRow.tsx` is the frontend one. **Express
per-call-site differences as a parameter or a prop** — `badge`, `loading`,
`disabled` — never as a second copy with an edit.

Where the extraction lands is surface-specific: Backend §4 for services and
their layering, Frontend §3 for shared components, Frontend §6 for shared
vocabulary.

**This is not a blanket ban on similar-looking code.** Two things that resemble
each other today but answer to different requirements should stay separate, and
each surface keeps a deliberate example:

- The `rebalance`/`neighbourIndex` pair in the ranking and collections services
  is duplicated on purpose, because unifying it across two Prisma delegates
  costs more clarity than the ~20 lines it saves.
- `SearchResultRow` looks like it belongs to the `LevelResultRow` family and
  deliberately does not: a shorter row with a different thumbnail treatment,
  meta format, and listbox semantics, answering to the search surface rather
  than to a "pick a level" prompt.

When you keep two, say in a comment why both exist. The rule targets one fact
written twice, not two facts that rhyme.

---

## Backend (`apps/api`)

Established by the backend tech-debt pass on 2026-08-07. Where a rule exists
because a specific failure happened, the failure is named — that context is the
rule's justification and should survive edits to it.

### 1. Error handling in routes

**One `onError` per route module. Handlers do not catch what they cannot
translate.**

Every route module registers a single error handler in its `index.ts`, built
with `createErrorHandler` from `middleware/errors.ts`:

```ts
app.onError(
  createErrorHandler('Ranking', (error, c) => {
    if (error instanceof RankingNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    return undefined // falls through to log + Sentry + 500
  })
)
```

The mapper returns `undefined` for anything it does not recognize; the shared
tail then logs against `c.req.routePath` (the matched pattern, so labels cannot
drift from the routes they name), reports to Sentry, and returns a generic 500.
Nothing beyond the status reaches the client.

Before this, ~30 handlers each carried the same four-line catch. They were not
identical — some logged, some didn't; labels had drifted from their routes; and
a handler that forgot the catch returned a Hono default instead.

**A `try/catch` in a handler must translate a specific, expected failure.**
Legitimate reasons: a Prisma `P2002` that means something concrete to the user
("that username is taken"), an upstream error class that maps to a status
(`GddlError` → 422 or 502), a race that is safe to swallow. Every one of them
rethrows anything it does not recognize.

**Scope the catch to the statement that can actually throw**, not the whole
handler. A handler-wide `try` around a single `P2002`-capable write hides which
line the case is about and silently swallows unrelated failures of the same
shape if the handler later grows.

```ts
// Right — the constraint lives on this write and nowhere else.
let updated
try {
  updated = await prisma.user.update({ ... })
} catch (error) {
  if (isUniqueViolation(error)) {
    return c.json({ error: 'Username is already taken' }, 409)
  }
  throw error
}
```

**Use `isUniqueViolation()` rather than open-coding the Prisma check.** Different
constraints deserve different messages, so it returns a boolean rather than a
response — the caller still writes the translation.

### 2. Logging

**Use the Pino logger from `utils/logger.ts`. Never `console.*`.**

`console` output is unstructured, unfiltered by level, and inconsistent with
everything else the API emits. Log structured context as the first argument and
a static message as the second — `logger.info({ userId, levelId }, 'Logged
completion')` — so lines aggregate rather than each being unique.

The one sanctioned exception is `triggers/postAuthentication.ts`, which is
intentionally noisy with `console.log` while the auth flow settles.

Never log secrets: not the plaintext GDDL API key, not its ciphertext, not a
request body that might contain either.

### 3. Request handling

**Parse bodies with `await c.req.json().catch(() => ({}))`.** The empty object
then fails the Zod schema and produces a 400. An unguarded `c.req.json()` throws
on malformed JSON, which reaches `onError` as a 500 — the wrong answer for a
client-side mistake.

**Validate with a schema from `packages/core` and return its error.** Mind the
Zod split documented in `CLAUDE.md`: parse with core schemas, never compose them
into locally-declared Zod 4 schemas. When surfacing a single message to a user,
use `error.issues[0].message` — `error.message` is a JSON dump of every issue.

**Take identity from `c.get('userId')`.** It is the internal UUID, never the
Cognito sub, and never a value from a path segment or payload. It is already
typed `string` via `HonoVariables`; `as string` on it is noise.

### 4. Layering

Routes are thin HTTP shells: parse, validate, delegate, shape the response.
Business logic lives in `services/`, and a service owns its own transaction
boundaries.

**Services signal failure with typed error classes**, exported from the service
module, which the route module's `onError` maps to statuses. Services do not
know about HTTP status codes; the one deliberate exception is `CollectionError`,
which carries a status because the client branches on a machine-readable code
that must stay paired with it.

**A function taking a `tx` must not open its own transaction.** Say so in the
JSDoc — it is the kind of thing a caller gets wrong exactly once, expensively.

---

## Frontend (`apps/web`)

Established by the frontend logic-extraction pass on 2026-08-09/10 and extended
by the frontend tech-debt pass on 2026-08-10, which settled the styling question
§5 now answers and adopted the JSDoc rule now in All surfaces §1. Same
convention as above: where a rule exists because a specific failure happened,
the failure is named.

### 1. Component files render; logic lives beside them

**Every component keeps its logic in a sibling file — one file per component.**

The component file holds JSX and nothing else: no queries, no mutations, no
`useState`/`useEffect`, no handlers, no derived values. All of it moves to a
sibling that the component calls once.

- Stateful logic → a hook named for the component: `useListPage.ts`,
  `useAddLevelsDialog.ts`, `useRatingConfigEditor.ts`.
- Pure logic → a plain module named for its content, no hook wrapper:
  `buildImportPayload.ts`, `timelineFormat.ts`, `editDateTime.ts`.

Pages count as components and follow the same rule. The naming exception is
worth knowing: the page hook cannot reuse a name already taken by its API
query hook, which is why the level pages use `useLevelDetailPage` /
`useGlobalLevelDetailPage` rather than shadowing `useLevelPage` /
`useGlobalLevelPage` from `lib/api/`.

This pass started at seventeen components over 400 lines, topping out at
`ImportWizard.tsx` at 2053 — a file whose step machine, commit-payload
construction, and seven steps' worth of markup all had to be held at once to
change any of it. The split is what makes the logic reachable by a test at all;
`buildImportPayload` is now a pure function taking an input object, where
before it was ~170 lines buried inside an async callback.

**A hook returns data, not JSX.** Loading and error branching stays in the
component — a hook cannot early-return markup, and pushing the branch inside
just means returning components from a logic file. Hooks expose a status
instead:

```ts
// useLevelDetailPage.ts
export type LevelDetailStatus =
  | 'loading'
  | 'private'
  | 'not-found'
  | 'error'
  | 'ready'
```

```tsx
// LevelPage.tsx — the component still picks the render.
if (status === 'loading') return <LevelPageSkeleton />
if (status === 'private') return <PrivateProfile />
```

**When a component splits on data availability, split the hook the same way.**
`CollectionDetail` renders a shell until its query resolves, then a `Loaded`
subtree — so its logic file exports `useCollectionDetailPage` (query, dialog
state, FAB) and `useLoadedCollection` (everything needing a resolved
collection). Merging them would mean seeding `displayEntries` empty and filling
it from an effect, which flashes the "No levels yet" empty state for a frame
before the rows land.

### 2. Multi-step flows: one component per step, plus a flow context

**A step is a component in `steps/`, never a branch of JSX in the parent.**

The logging flow is the reference example, and the import wizard was rebuilt to
match it. The shape:

- One file per step under `steps/`, including transient ones. A step that only
  shows a spinner still gets a file when it is the state that decides where the
  flow goes next — `ResolvingStep` and `CheckingConflictsStep` both exist for
  that reason.
- A `StepView` switch with exactly one line per step, and no other logic.
- A flow provider (`LoggingFlowProvider`, `ImportFlowProvider`) holding the step
  machine, so **steps take zero props** and read what they need via
  `useLoggingFlow()` / `useImportFlow()`. A step's own logic hook reads the
  context too, rather than accepting the flow as arguments.
- The parent file is then only a shell: chrome, step indicator, and whatever
  affordance is genuinely shared across steps.

Where a step owns an affordance the shell cannot explain, it keeps it. The
import wizard's `CommittingStep` renders its own Close button, because closing
there abandons the view and not the server-side job — that caveat belongs next
to the button, not in the shell's generic cancel row.

A provider does not have to be app-global. `LoggingFlowProvider` is mounted once
in the shell because the FAB opens it from anywhere; `ImportFlowProvider` is
mounted by `ImportWizard` itself, which scopes the flow's state to one open
wizard and makes close-then-reopen start clean without a reset path to
maintain.

### 3. Shared components live in `src/components/`

**A component used by two features belongs to neither.** All surfaces §2 has
the incidents that produced this rule and the deliberate exception to it; this
section is only about where a shared component goes once you have decided to
extract it.

`src/components/` is grouped by what a component is, not by which feature first
needed it — nothing sits loose at its root:

| Directory  | Holds                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `generic/` | Unstyled-by-domain primitives — the shadcn layer, plus `segmented`, `stepper-input`, `toast`                                       |
| `inputs/`  | Domain form controls and their labelling: `CoinPicker`, `DifficultyOpinionSelect`, `FieldLabel`, `SectionLabel`, `TwoPlayerPicker` |
| `data/`    | Components that render domain data: `LevelResultRow`, `DifficultyFace`, `RatingRow`, `CopyableId`, `EmptyState`                    |
| `shell/`   | App chrome — header, sidebar, mobile nav, FAB, sheets, `Shell` itself                                                              |
| `public/`  | Signed-out chrome: `PublicPageShell`, `LegalDocPage`                                                                               |

Before writing a row, picker, label, or dialog chrome, look in `inputs/` and
`data/` first. Express per-caller differences as props (`badge`, `loading`,
`disabled`, `variant`), not as a second copy.

### 4. Feature layout

Feature code lives under `src/features/<feature>/`, with the component, its
logic file, and its feature-local helpers together. Steps go in a `steps/`
subdirectory; anything shared across features moves to `src/components/` (see
§3) or `src/lib/`.

Files that are neither component nor hook are named for what they hold —
`filtering.ts`, `columns.ts`, `identity.ts`, `importWizardModel.ts` — and a
state machine's model (its step union, its shared transforms) belongs in one of
those rather than in the component that happens to render it first.

### 5. Styling: tokens, not values

**Color comes from `src/styles/tokens.css`, through a Tailwind utility.**

Tailwind v4 exposes every `@theme` token as a utility, so `bg-bg-surface` and
`bg-[var(--color-bg-surface)]` are the same class written two ways. Both were
in use — 134 `border-border` against 53 `border-[var(--color-border)]` — which
is enough spelling variation to defeat a grep when a color needs changing.
Use the utility form.

**No raw hex, and no raw Tailwind palette colours.** `text-[#212121]` is
`bg-elevated` with the token filed off; `text-amber-600` is `text-warning-soft`
with the design system bypassed. Three concrete failures came out of this:

- `text-[var(--color-main)]` named a token that does not exist, so that badge
  rendered with an inherited color.
- The import wizard styled itself entirely in raw `amber-*`/`red-*` with
  `dark:` variants. The app is dark-only and never sets a `dark` class, so in
  Tailwind v4 those variants keyed off the _viewer's OS preference_ — a user on
  a light OS got `amber-600` text on a near-black panel.
- Four badges used `bg-[rgba(34,197,94,0.1)]`-style literals that were, to the
  byte, the existing `--color-success-dim` and `--color-danger-dim`.

**One token name means one thing.** `index.css`'s shadcn compatibility layer
used to remap `--color-accent` onto its own "hover surface" value, shadowing
the brand amber that `tokens.css` defines under that name — so every
`text-accent`/`bg-accent`/`border-accent` in the app rendered dark grey. It
took out the completed-level name color, the "amber-tracked" slider's range,
and the GDDL accent button, each of which looked deliberate in source. shadcn's
`accent` was only ever the hover/focus surface, so the three components that
wanted it now say `bg-bg-elevated` outright and `--color-accent` is
unambiguously the brand. Do not add a shadcn alias whose name collides with a
`tokens.css` token.

When a value genuinely has no token and recurs, add one with a comment saying
what it is for — that pass added `--color-bg-inset`, `--color-text-body`, and
the `-soft` text family that pairs with the existing `-dim` backgrounds.

**A class string written three times wants a component or a variant.** Use
`cva` for a control with real axes (`Segmented`, `SectionLabel`) and a plain
component for a fixed shape (`EmptyState`, `Textarea`). The pill-button styling
behind every mutually-exclusive picker had been open-coded seven times in three
sizes before `segmentedItemVariants`; the small uppercase section heading
existed five times in five sizes and colours.

**Per-caller differences are props, not copies** — All surfaces §2, applied to
the class string rather than to the component.

### 6. Imports and shared vocabulary

**Cross-directory imports use the `@/` alias.** A relative path is for a
sibling or a file inside the same feature (`./sortMeta`, `../components`);
anything reaching into another top-level directory uses `@/`, so a moved file
does not rewrite a chain of `../../`.

**A domain enum is declared once, in `lib/api/wireEnums.ts`.** The wire enums
are mirrored from `packages/core` as string-literal unions rather than imported
— core pins zod@3 while the API validates on zod@4, and core's nominal `enum`
types do not narrow from the plain strings `JSON.parse` returns.
`packages/core/src/difficultyOpinion.ts` documents the same decision from the
other side. That mirroring is fine; doing it once per endpoint module was not.
`Device` had three declarations and `DifficultyOpinion` two, and a settings
screen and a logging step imported the same enum from different files.

**Two unrelated things must not share a name.** `SORT_OPTIONS` meant "List
columns" in one module and "level browse orderings" in another; they are now
`LIST_SORT_OPTIONS` and `LEVEL_SORT_OPTIONS`. Where two similar components
genuinely both earn their place — the settings toggle group beside
`components/ui/segmented` — rename one and say in a comment why both exist.

### Not covered yet

Deliberately unsettled, so nothing here is mistaken for a rule:

- **Data fetching** — query key shape, cache invalidation, and where a
  `lib/api/` hook ends and feature logic begins.
- **Testing.** `apps/web` has no test suite. The logic files above exist partly
  to make one possible; pure modules like `buildImportPayload` are the natural
  first targets.
