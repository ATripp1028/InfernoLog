# Web

This is the frontend for the InfernoLog application: a React single-page app that talks to the API in [`apps/api`](../api/README.md). In here, you can find every page, the logging flow, the spreadsheet import and export, and the end-to-end test suite.

## Tech Stack

### React 19 + TypeScript + Vite

The component framework and build tool.

### TanStack Router

File-based routing. Route files live in `src/routes/` and `routeTree.gen.ts` is generated from them — don't edit it by hand. A route under `_authenticated` requires a signed-in user.

### TanStack Query

Data fetching and caching. The cache is persisted between visits, so a returning user sees their data immediately. Every API call goes through `src/lib/api/`, which also owns which queries each write invalidates.

### TanStack Table + TanStack Virtual

The Log's table: sortable, filterable, and virtualized, since it holds every level a user has logged.

### TanStack Form + Zod

Form state and validation. The schemas come from `@infernolog/core`, so the frontend validates with the same rules the API enforces.

### Tailwind CSS + Radix UI

Styling uses Tailwind with design tokens (see [DESIGN_LANGUAGE.md](../../docs/DESIGN_LANGUAGE.md)). Interactive primitives — dialogs, popovers, selects, sliders — are Radix, wrapped as shadcn-style components in `src/components/generic/`.

### dnd-kit

Drag-and-drop for the demon list and ordered collections.

### Framer Motion

Animation.

### AWS Amplify

The Cognito client: sign-in, sign-out, and the session. Nothing else from Amplify is used.

### SheetJS (xlsx)

Reads and writes the import/export spreadsheet entirely in the browser. The API never sees a file. See [IMPORT_EXPORT.md](../../docs/IMPORT_EXPORT.md).

### date-fns

Date parsing and formatting.

### Sentry

Error reporting.

### Vitest + Playwright

Unit tests sit in a `tests/` directory beside what they cover. The end-to-end suite is in `e2e/` and has [its own README](./e2e/README.md).

## Pages

### Public

These sit outside the authenticated app shell.

| Route                                                 | What it is                                                                                                        |
| :---------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| `/`                                                   | Landing page. A signed-in user is sent to their Log instead                                                       |
| `/signin`, `/age-gate`, `/signup`, `/forgot-password` | The way in: an email and password, or Google. Sign up runs behind the age gate. See [AUTH.md](../../docs/AUTH.md) |
| `/terms`, `/privacy`, `/dmca`                         | Legal documents, rendered from the Markdown in [`/legal`](../../legal) through a shared `LegalDocPage`            |
| `/about`                                              | Acknowledgments and credits, also linked from Settings                                                            |

### Signed in

The navigation has six destinations:

| Page        | Route          | What it is                                                                 |
| :---------- | :------------- | :------------------------------------------------------------------------- |
| Search      | `/search`      | Browse and filter the shared level cache                                   |
| Log         | `/log`         | Every level the user has logged, with filters, sorts and saved presets     |
| Ranking     | `/ranking`     | The user's completions ordered by their own rating                         |
| Demon List  | `/demon-list`  | The user's completions ordered by difficulty, placed by hand               |
| Collections | `/collections` | Want to Beat, Favorites, Least Favorites and custom collections            |
| Events      | `/events`      | A feed of what the user did: logs, demon list moves, edits, config changes |

Beyond those:

- `/log/{levelId}` — the user's own page for a level they have logged.
- `/levels/{levelId}` — the shared page for any level in the cache.
- `/collections/{collectionId}` — one collection.
- `/settings` — account settings.
- `/onboarding` — the wizard a new account goes through before reaching the app.

Logging happens through the floating action button, available on every page. See [LOGGING_FLOW.md](../../docs/LOGGING_FLOW.md).

The navigation also shows four disabled placeholders with nothing behind them: Time Machine, Stats, Level Picker and Moderation.

## Source Layout

- `src/routes/`: route definitions. Thin — each points at a page.
- `src/pages/`: one component per page.
- `src/features/`: everything specific to one feature, grouped by feature (`logging`, `log`, `demon-list`, `import`, …).
- `src/components/`: components shared between features.
- `src/lib/`: shared logic, including the API client in `lib/api/`.
- `src/context/`: React context providers.

The rules for how these are organised are in [CODE_QUALITY.md](../../docs/CODE_QUALITY.md).

## Infrastructure

`sst.config.ts` deploys the built site as an `sst.aws.StaticSite`: an S3 bucket behind CloudFront. Production is served from `infernolog.com`. It reads the API's outputs (the API URL and Cognito ids) from SSM at deploy time, which is why the API always deploys first.
