import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { authMiddleware } from './middleware/auth'
import meRoutes from './routes/me'
import type { HonoVariables } from './types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// Public routes
app.get('/health', (c) => c.json({ status: 'ok', app: 'InfernoLog' }))

// Public user routes (no auth needed)
app.get('/v1/users/check-username', async (c) => {
  const username = c.req.query('username')

  if (!username) {
    return c.json({ error: 'Username is required' }, 400)
  }

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL!,
  })

  try {
    const existing = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
      },
    })
    return c.json({ available: !existing })
  } finally {
    await prisma.$disconnect()
  }
})

// Authenticated routes
app.use('/v1/*', authMiddleware)
app.route('/v1', meRoutes)

export const handler = handle(app)