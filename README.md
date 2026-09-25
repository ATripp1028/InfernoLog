# InfernoLog

This is the Repository for the InfernoLog Web Application and API. InfernoLog is a platform for Geometry Dash players to log their demon completions. Players can log their demons, rank their difficulty, rate their levels, create collections of levels, and more!

## Development

If you're interested in contributing to InfernoLog, please see [DEVELOPMENT.md](./DEVELOPMENT.md) for useful info.

## Monorepo Structure

This project is a monorepo for the InfernoLog webapp and the API it uses. Here's a bird's eye view:
```
├── LICENSE
├── README.md
├── SECURITY.md             # Handling discovered vulnerabilities
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
- [E2E Test Suite](./apps/web/e2e/README.md)
- [Core Utilities](./packages/core/README.md)

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
