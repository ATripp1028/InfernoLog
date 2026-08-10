# Code Quality

Conventions that apply to how InfernoLog code is written, as distinct from what
it does. Everything here is enforced by review, not by a linter, unless a rule
says otherwise.

The document is split by surface. A rule stated under **Backend** governs
`apps/api` only, and one stated under **Frontend** governs `apps/web` only —
neither surface's rules should be assumed to apply to the other, since several
on each side are specific to its stack. Rules that would genuinely apply
everywhere still belong to a surface section for now — promote them to a shared
section only when a second surface has actually adopted them, not in
anticipation.

---

## Backend (`apps/api`)

Established by the backend tech-debt pass on 2026-08-07. Where a rule exists
because a specific failure happened, the failure is named — that context is the
rule's justification and should survive edits to it.

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
header.

**Section dividers do not document functions.** A `// ─────` banner above a
function is a layout device that reads as documentation. If it contains prose
about the function beneath it, that prose belongs in that function's JSDoc.

### 2. Error handling in routes

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

### 3. Logging

**Use the Pino logger from `utils/logger.ts`. Never `console.*`.**

`console` output is unstructured, unfiltered by level, and inconsistent with
everything else the API emits. Log structured context as the first argument and
a static message as the second — `logger.info({ userId, levelId }, 'Logged
completion')` — so lines aggregate rather than each being unique.

The one sanctioned exception is `triggers/postAuthentication.ts`, which is
intentionally noisy with `console.log` while the auth flow settles.

Never log secrets: not the plaintext GDDL API key, not its ciphertext, not a
request body that might contain either.

### 4. Duplication

**A field mapping written twice is a bug waiting for its third copy.**

The RobTop→`Level` mapping had been copy-pasted into five modules. It had
already drifted: three call sites stamped `lastCheckedAt` and one did not, so
levels upgraded through that path reported a stale "frozen as of" date. Nobody
introduced that bug deliberately — it is what copies do.

When the same shape is built in more than one place, extract it to a named
builder and give it a JSDoc block explaining what it owns
(`services/levels/robtopMapping.ts` is the reference example). Where call sites
differ slightly, express the difference as a parameter or a second exported
builder — not as a second copy with an edit.

This is not a blanket ban on similar-looking code. Two functions that resemble
each other today but answer to different requirements should stay separate; the
`rebalance`/`neighbourIndex` pair in the ranking and collections services is
deliberately duplicated, because unifying it across two Prisma delegates costs
more clarity than the ~20 lines it saves. The rule targets **one fact expressed
in several places**, which is what the column list was.

### 5. Request handling

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

### 6. Layering

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

Established by the frontend logic-extraction pass on 2026-08-09/10 and
extended by the frontend tech-debt pass on 2026-08-10, which settled the
documentation-comment and styling questions §1 and §6 now answer. Same
convention as above: where a rule exists because a specific failure happened,
the failure is named.

### 1. Documentation comments

**Every exported symbol carries a JSDoc block, not `//` comments.** Same rule
as the backend's §1, adopted here by the 2026-08-10 pass, and for the same
reason: a `//` comment above an export is invisible on IDE hover, which is the
one moment a reader needs it. Read that section for what a block must contain
and what it must not become — none of it is backend-specific.

Frontend-specific points:

- **Components are documented like functions.** The block says what the
  component _is_ on the surface it appears on, and `@param` earns its place for
  a prop whose meaning is not obvious from its name and type — a `variant` that
  changes semantics rather than pixels, a `value` that is `null` for a reason, a
  unit the type cannot express. `children: ReactNode` needs no gloss.
- **State units belong in the block.** Ratings travel as internal 0–100 in some
  places and display units in others; `RatingRow` and `lib/ratingScale.ts` say
  which, at the boundary, because the type is `number` either way. Before this
  pass the logging flow's rating row and the edit modals' spoke different units
  under the same name.
- **Module headers stay `//`.** A file's header explains its role and its
  relationship to siblings; nothing hovers over a file. Where a single-export
  file's header was really describing that export, it became the export's JSDoc
  — check which one you are writing.
- **Section-divider banners are gone.** A `// ─────` rule above a group of
  exports is a layout device that reads as documentation. `lib/api/me.ts` had
  seven of them, and the prose inside two was the only place a real caveat was
  written down. That prose now lives on the symbol it warns about.
- **`src/routes/*` is exempt.** Those files are TanStack Router glue whose only
  export is a `Route` from `createFileRoute`; a doc block on it says nothing the
  filename does not.

### 2. Component files render; logic lives beside them

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

### 3. Multi-step flows: one component per step, plus a flow context

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

### 4. Shared components live in `src/components/`

**A component used by two features belongs to neither.**

`ResultRow` had been re-typed four times across three files — twice in the
logging flow's `FindLevelStep`, once in each collections dialog. Two of the four
were identical apart from the name and type of their one prop; a third had grown
`added`/`beaten`/`loading` while the others had not. The same happened to
`DifficultyOpinionSelect`, which existed twice byte-identical (comments aside),
each copy dragging its own `DEMON_OPINIONS` table, and one of them also carrying
a hand-written `DifficultyOpinion` union that restated the one in
`lib/api/logging.ts`. Nobody duplicated those deliberately — it is what copies
do, and the drift is the cost.

Both now live in `src/components/` with the per-caller differences expressed as
props (`badge`, `loading`, `disabled`), not as separate copies. Before writing a
row, picker, or dialog chrome, check there.

This is not a blanket ban on similar-looking components. `SearchResultRow` looks
like it belongs to the `LevelResultRow` family and deliberately does not: it is
a shorter row with a different thumbnail treatment, meta format, and listbox
semantics, answering to the search surface rather than to a "pick a level"
prompt. The rule targets **one component re-typed**, which is what the four
result rows were.

### 6. Styling: tokens, not values

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

**Per-caller differences are props, not copies** — the same rule as §4, applied
to the class string rather than the component.

### 7. Feature layout

Feature code lives under `src/features/<feature>/`, with the component, its
logic file, and its feature-local helpers together. Steps go in a `steps/`
subdirectory; anything shared across features moves to `src/components/` (see
§4) or `src/lib/`.

Files that are neither component nor hook are named for what they hold —
`filtering.ts`, `columns.ts`, `identity.ts`, `importWizardModel.ts` — and a
state machine's model (its step union, its shared transforms) belongs in one of
those rather than in the component that happens to render it first.

### 8. Imports and shared vocabulary

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
