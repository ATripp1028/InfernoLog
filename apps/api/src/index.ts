import './sentry'
import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { logger } from './utils/logger'
import { authMiddleware } from './middleware/auth'
import usersRoutes from './routes/users'
import accountRoutes from './routes/account'
import levelsRoutes from './routes/levels'
import progressRoutes from './routes/progress'
import rankingRoutes from './routes/ranking'
import collectionsRoutes from './routes/collections'
import presetsRoutes from './routes/presets'
import importExportRoutes from './routes/importExport'
import {
  discordCallbackRoutes,
  onboardingRoutes,
} from './routes/auth'
import type { HonoVariables } from './types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// Log every request
app.use('*', async (c, next) => {
  logger.info({ method: c.req.method, path: c.req.path }, 'Incoming Request')
  await next()
})

// Public routes
app.get('/health', (c) => c.json({ status: 'ok', app: 'InfernoLog' }))
app.route('/auth', discordCallbackRoutes)

// Public user routes — registered before authMiddleware so they stay reachable
// without a token.
app.route('/v1', usersRoutes)

// Claims-only routes (verified Cognito identity, no User row required) —
// registered before authMiddleware so they never hit its Prisma-lookup-or-404.
app.route('/v1', onboardingRoutes)

// Authenticated routes
app.use('/v1/*', authMiddleware)
app.route('/v1', accountRoutes)
app.route('/v1', levelsRoutes)
app.route('/v1', progressRoutes)
app.route('/v1', rankingRoutes)
app.route('/v1', collectionsRoutes)
app.route('/v1', presetsRoutes)
app.route('/v1', importExportRoutes)

// Catch-all for unmatched routes
app.all('*', (c) => {
  logger.warn({ method: c.req.method, path: c.req.path }, 'No route matched')
  return c.json({ error: 'Not found', path: c.req.path }, 404)
})

export const handler = handle(app)
