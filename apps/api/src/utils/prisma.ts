import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Node <22 has no global WebSocket; the Neon driver needs one for Pool connections.
neonConfig.webSocketConstructor = ws

// Route single (non-interactive) queries over Neon's stateless SQL-over-HTTP
// endpoint instead of the WebSocket pool. In Lambda the module-level Pool is
// reused across invocations, and its WebSocket connections get dropped while the
// container is frozen or by Neon's idle/auto-suspend — so the first plain query
// after a cold start (e.g. the /page level read) would fail with a connection
// error, which the API surfaces as a 500. Each HTTP query is a fresh stateless
// request, so there's no long-lived connection to go stale. Interactive
// transactions ($transaction(async (tx) => …)) still use the WebSocket pool via
// pool.connect() — this flag only affects Pool.query(), and only applies while
// no connect/acquire/release/remove listeners are set on the Pool (none are).
neonConfig.poolQueryViaFetch = true

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaNeon(pool)
const prisma = new PrismaClient({ adapter })

export default prisma
