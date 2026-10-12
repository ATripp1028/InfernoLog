# InfernoLog

This is the Repository for the InfernoLog Web Application and API. InfernoLog is a platform for Geometry Dash players to log their demon completions. Players can log their demons, rank their difficulty, rate their levels, create collections of levels, and more!

## Development

If you're interested in contributing to InfernoLog, please see [DEVELOPMENT.md](./DEVELOPMENT.md) for useful info.

## Monorepo Structure

This project is a monorepo for the InfernoLog webapp and the API it uses. Here's a bird's eye view:

```
├── LICENSE
├── README.md
├── SECURITY.md             # Security posture of the repo
├── DEVELOPMENT.md          # Guide for starting development in this repo
├── .github                 # Contains all GitHub actions flows
├── apps
│   ├── api                 # Backend
│   └── web                 # Frontend
├── docs
│   └── IMAGE_SOURCES.md    # Where images came from
├── eslint.credentials.mjs  # Rules that police credential exposure
├── legal                   # Same documents in the footer on the web
│   ├── DMCA.md
│   ├── PRIVACY_POLICY.md
│   └── TERMS_AND_CONDITIONS.md
├── package.json            # Repo-wide commands and package definition
├── packages                # Utilities shared between both apps
│   ├── core                # Core utilities
│   └── tsconfig            # TS rules for packages and apps
├── .env.example
├── .eslintrc.json          # ESLint config
├── .gitignore
├── .gitleaks.toml          # Gitleaks config
├── .prettierignore         # Files ignored for formatting
├── .prettierrc             # Prettier (formatting) config
├── pnpm-lock.yaml          # Single source of truth for dependency tree
├── pnpm-workspace.yaml     # Monorepo pnpm structure
├── scripts                 # Repo-wide scripts
└── turbo.json              # Turbo config
```

## Documentation

Per-area documentation:

- [API](./apps/api/README.md)
- [Web](./apps/web/README.md)
- [E2E Test Suite](./apps/web/e2e/README.md)
- [Core Utilities](./packages/core/README.md)

How the app works, in [`docs/`](./docs):

| Document                                            | Contents                                                                              |
| :-------------------------------------------------- | :------------------------------------------------------------------------------------ |
| [schema.prisma](./apps/api/prisma/schema.prisma)    | The data model. Its inline comments are the source of truth                           |
| [API_DESIGN.md](./docs/API_DESIGN.md)               | The API: auth, rate limits, response shape, pagination, every endpoint                |
| [AUTH.md](./docs/AUTH.md)                           | Cognito, sign-in methods, verification codes, username rules, account status          |
| [LEVEL_LOGGING.md](./docs/LEVEL_LOGGING.md)         | The progress entry model, its fields, and the rules for completions, drops and status |
| [LOGGING_FLOW.md](./docs/LOGGING_FLOW.md)           | The logging modal: completion, progress and drop paths                                |
| [DEMON_LIST.md](./docs/DEMON_LIST.md)               | The user's own demon list: manual placement, demon list events, rank history          |
| [RATING_SYSTEM.md](./docs/RATING_SYSTEM.md)         | Weighted-average rating and configurable categories                                   |
| [LIST_INTEGRATIONS.md](./docs/LIST_INTEGRATIONS.md) | The two GDDL tiers, community list placements, and the GDDL account integration       |
| [EXTERNAL_APIS.md](./docs/EXTERNAL_APIS.md)         | Every outside service, and the level-cache sync                                       |
| [EVENT_LOG.md](./docs/EVENT_LOG.md)                 | The event log: what is tracked, and what deliberately is not                          |
| [IMPORT_EXPORT.md](./docs/IMPORT_EXPORT.md)         | Spreadsheet import and export: tabs, columns, conflict resolution                     |
| [PRIVACY.md](./docs/PRIVACY.md)                     | Per-entry privacy and profile visibility                                              |
| [DESIGN_LANGUAGE.md](./docs/DESIGN_LANGUAGE.md)     | Visual identity, iconography, colour system and typography                            |
| [TERMINOLOGY.md](./docs/TERMINOLOGY.md)             | The canonical terms used in code, docs and UI                                         |
| [CODE_QUALITY.md](./docs/CODE_QUALITY.md)           | How code is written: conventions for the backend, the frontend and tests              |
| [COMMUNITY_POLICY.md](./docs/COMMUNITY_POLICY.md)   | Public-facing content rules                                                           |
| [IMAGE_SOURCES.md](./docs/IMAGE_SOURCES.md)         | Where the bundled Geometry Dash sprites come from                                     |

What is planned rather than built:

| Document                                  | Contents                                                 |
| :---------------------------------------- | :------------------------------------------------------- |
| [ROADMAP.md](./docs/ROADMAP.md)           | Everything not yet built, by version                     |
| [TIME_MACHINE.md](./docs/TIME_MACHINE.md) | Design for a historical view of the demon list           |
| [LEVEL_PICKER.md](./docs/LEVEL_PICKER.md) | Design for a guided level picker                         |
| [MODERATION.md](./docs/MODERATION.md)     | Internal moderation policy. No moderation tooling exists |

## Stack

- React + TypeScript + Vite (frontend)
- AWS Lambda + SST (backend)
- PostgreSQL via Neon
- Prisma (schema)
- AWS Cognito (auth)
- pnpm (package management)
- Turborepo (build system)
- Sentry (error logging)

## Status

Currently in active development. v1 not yet released.

## Contributing

Contributions are not yet open. Check back after v1 launch.
