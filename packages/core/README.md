# Core Utilities

This package is dedicated to utilities used across both the Web Application and API. This includes zod schemas, types, functions, and constants. To import something from here, use the following syntax: 
```typescript
import { <insert-utilities-here> } from '@infernolog/core'
```
If you need a type, remember to include 'type' in your import as follows:
```typescript
import type { <insert-types-here> } from '@infernolog/core'
```
It is preferable to avoid mixing type imports with functional imports.

`index.ts`: The entry file. You can ignore this unless you create a new file, in which case you would add it here to expose it to the other apps.

## Important Notes

**The zod 3 / zod 4 split**: This package is on zod 3, `apps/api` is on zod 4, and `apps/web` uses this package's zod. You can `.safeParse()` a cor schema from the API, but composing one into a locally-declared zod 4 schema (.extend(), z.object({...Schema.shape})) breaks type inference. This is why some parts of the apps (eg. [requestBody.ts](../../apps/api/src/utils/requestBody.ts)) declare their schema param structurally instead of importing a zod type.

**There is no build step**: There is nothing to compile in this package, as both apps consume this package via the pnpm workspace symlink.

## Auth

Both of these files handle authentication utilities. **Never print or log passwords, codes, or other authentication items under any circumstance**. Ideally, these things would be handled entirely by cognito, but due to constraints surrounding sending emails through cognito, we are forced to use the backend to handle certain authentication operations. They are currently the only files in the package to carry tests due to their importance.

`auth.ts`: Contains request bodies and error codes for email and password authentication, including verification codes.   

`credentials.ts`: Password rules, such as permitted characters and lengths. Also provides scrubbing utilities to Pino and Sentry. If you need to add a sensitive field name, this is where you would look. The password rules mirror the Cognito pool policy. Also contains EmailSchema, including validation.

## Data Shape

These files define reoccurring shapes used for data across both apps.

`schemas.ts`: This is the largest file in the package by a longshot. It contains almost every request and response shape used in the app and some other shapes used in the frontend. The file also contains variable constraints that are typically enforced at call site, such as length and nullability.

`enums.ts`: This file contains every TypeScript enum used across both apps in the repo. Mirrors the enums in [schema.prisma](../../apps/api/prisma/schema.prisma), so if you change something here, you need to change it there and write a migration. Doesn't contain all enums, as some prisma enums are mirrored in `schemas.ts` instead. Types derived from const arrays stay beside their const, not in here.

`types.ts`: Derives types from schemas declared in `schemas.ts` (and `auth.ts`) via `z.infer` syntax. No unique schemas are declared here, so you shouldn't need to dig into here unless you add a schema and need to derive types from it.

## "Business" Logic

These files contain shared logic that drives the app operations. Everything here is user-facing and has a wide reach, so be careful when changing it.

`rating.ts`: Contains overall rating computation, using a user's categories and weights to compute a weighted average.

`ratingOrder.ts`: Handles comparing ratings for levels, including how to break ties and how category priority is determined, and ranking all a user's levels.

`sheetTier.ts`: Handles NLW and LW spreadsheet tiers, including deriving tier names and origins. Never use a truthiness check for sheet tiers, as tier 0 ("Fuck") is a real tier.

`extremeDemon.ts`: Contains one function that returns true if a level is an extreme demon, which is used to decide if a level uses the GDDL or the EDEL as a source for enjoyment.