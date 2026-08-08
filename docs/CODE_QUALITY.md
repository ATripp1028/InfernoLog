# Code Quality

Conventions that apply to how InfernoLog code is written, as distinct from what
it does. Everything here is enforced by review, not by a linter, unless a rule
says otherwise.

The document is split by surface. A rule stated under **Backend** governs
`apps/api` only; the **Frontend** section is a placeholder until the equivalent
pass lands for `apps/web`. Rules that would genuinely apply everywhere still
belong to a surface section for now — promote them to a shared section only when
a second surface has actually adopted them, not in anticipation.

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

Not yet established. The frontend has not had an equivalent pass, and no rule
above should be assumed to apply to it by default — several are specific to
Hono, Prisma, or Lambda.

When that pass happens, mirror this structure here rather than editing the
backend rules to be surface-neutral.
