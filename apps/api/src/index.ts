import './sentry'
import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { authMiddleware } from './middleware/auth'
import meRoutes from './routes/me'
import type { HonoVariables } from './types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// Log every request
app.use('*', async (c, next) => {
  console.log(`${c.req.method} ${c.req.path}`)
  await next()
})

// Public routes
app.get('/health', (c) => c.json({ status: 'ok', app: 'InfernoLog' }))

// Public user routes
app.get('/v1/users/check-username', async (c) => {
  const username = c.req.query('username')
  if (!username) return c.json({ error: 'Username is required' }, 400)

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL!,
  })

  try {
    const existing = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    })
    return c.json({ available: !existing })
  } finally {
    await prisma.$disconnect()
  }
})

// Authenticated routes
app.use('/v1/*', authMiddleware)
app.route('/v1', meRoutes)

// Catch-all for unmatched routes
app.all('*', (c) => {
  console.log(`No route matched: ${c.req.method} ${c.req.path}`)
  return c.json({ error: 'Not found', path: c.req.path }, 404)
})

export const handler = handle(app)