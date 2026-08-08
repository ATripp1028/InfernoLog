// List preset CRUD:
//
//   GET    /v1/me/list-presets       — the authed user's saved presets
//   POST   /v1/me/list-presets       — create a new preset
//   PATCH  /v1/me/list-presets/:id   — overwrite / rename a preset
//   DELETE /v1/me/list-presets/:id   — delete a preset
//
// The four view-config fields (sorts, filters, columns, columnOrder) are opaque
// JSON blobs — the API stores and returns them verbatim without deep validation.
// hideTime is a plain boolean display preference, validated normally.

import { Hono } from 'hono'
import { ListPresetInputSchema, ListPresetUpdateSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// ListPreset.id is a bare UUID, not scoped to the user, so every by-id route
// must confirm ownership before touching the row. A preset belonging to
// someone else is reported as 404 rather than 403 — a stranger's preset id
// should be indistinguishable from a nonexistent one.
async function ownsPreset(userId: string, id: string): Promise<boolean> {
  const existing = await prisma.listPreset.findUnique({
    where: { id },
    select: { userId: true },
  })
  return existing?.userId === userId
}

app.get('/me/list-presets', async (c) => {
  const userId = c.get('userId')
  const presets = await prisma.listPreset.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  return c.json({ data: presets })
})

app.post('/me/list-presets', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const parsed = ListPresetInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }
  const {
    name,
    description,
    color,
    sorts,
    filters,
    columns,
    columnOrder,
    hideTime,
  } = parsed.data
  const preset = await prisma.listPreset.create({
    data: {
      userId,
      name,
      description: description ?? null,
      color,
      sorts: sorts as object,
      filters: filters as object,
      columns: columns as object,
      columnOrder: columnOrder as object,
      hideTime,
    },
  })
  return c.json({ data: preset }, 201)
})

app.patch('/me/list-presets/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await ownsPreset(userId, id))) {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const parsed = ListPresetUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }

  const {
    name,
    description,
    color,
    sorts,
    filters,
    columns,
    columnOrder,
    hideTime,
  } = parsed.data
  const preset = await prisma.listPreset.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(color !== undefined && { color }),
      ...(sorts !== undefined && { sorts: sorts as object }),
      ...(filters !== undefined && { filters: filters as object }),
      ...(columns !== undefined && { columns: columns as object }),
      ...(columnOrder !== undefined && {
        columnOrder: columnOrder as object,
      }),
      ...(hideTime !== undefined && { hideTime }),
    },
  })
  return c.json({ data: preset })
})

app.delete('/me/list-presets/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!(await ownsPreset(userId, id))) {
    return c.json({ error: 'Not found' }, 404)
  }
  await prisma.listPreset.delete({ where: { id } })
  return c.body(null, 204)
})

export default app
