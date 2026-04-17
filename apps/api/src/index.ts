import { handle } from 'hono/aws-lambda'
import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => {
  return c.json({ status: 'ok', app: 'InfernoLog' })
})

export const handler = handle(app)