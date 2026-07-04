import './sentry'
import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { logger } from './utils/logger'
import { authMiddleware } from './middleware/auth'
import meRoutes from './routes/me'
import loggingRoutes from './routes/logging'
import levelsRoutes from './routes/levels'
import progressRoutes from './routes/progress'
import rankingRoutes from './routes/ranking'
import collectionsRoutes from './routes/collections'
import presetsRoutes from './routes/presets'
import gddlRecordsRoutes from './routes/gddlRecords'
import importRoutes from './routes/import'
import authRoutes from './routes/auth'
import type { HonoVariables } from './types/hono'
import prisma from './utils/prisma'

const app = new Hono<{ Variables: HonoVariables }>()

// Log every request
app.use('*', async (c, next) => {
  logger.info({ method: c.req.method, path: c.req.path }, 'Incoming Request')
  await next()
})

// Public routes
app.get('/health', (c) => c.json({ status: 'ok', app: 'InfernoLog' }))
app.route('/auth', authRoutes)

// Public user routes
app.get('/v1/users/check-username', async (c) => {
  const username = c.req.query('username')
  if (!username) return c.json({ error: 'Username is required' }, 400)
  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  })
  return c.json({ available: !existing })
})

// Authenticated routes
app.use('/v1/*', authMiddleware)
app.route('/v1', meRoutes)
app.route('/v1', loggingRoutes)
app.route('/v1', levelsRoutes)
app.route('/v1', progressRoutes)
app.route('/v1', rankingRoutes)
app.route('/v1', collectionsRoutes)
app.route('/v1', presetsRoutes)
app.route('/v1', gddlRecordsRoutes)
app.route('/v1', importRoutes)

// Catch-all for unmatched routes
app.all('*', (c) => {
  logger.warn({ method: c.req.method, path: c.req.path }, 'No route matched')
  return c.json({ error: 'Not found', path: c.req.path }, 404)
})

export const handler = handle(app)
