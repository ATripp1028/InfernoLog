// List preset CRUD:
//
//   GET    /v1/me/list-presets         — the authed user's saved presets
//   POST   /v1/me/list-presets         — create a new preset
//   PATCH  /v1/me/list-presets/:id     — overwrite / rename a preset
//   DELETE /v1/me/list-presets/:id     — delete a preset
//
// The four view-config fields (sorts, filters, columns, columnOrder) are opaque
// JSON blobs — the API stores and returns them verbatim without deep validation.
// hideTime is a plain boolean display preference, validated normally.

import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { ListPresetInputSchema, ListPresetUpdateSchema } from '@infernolog/core'
import prisma from '../utils/prisma'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// ─────────────────────────────────────────────
// GET /v1/me/list-presets
// ─────────────────────────────────────────────

app.get('/me/list-presets', async (c) => {
  const userId = c.get('userId') as string
  try {
    const presets = await prisma.listPreset.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
    return c.json({ data: presets })
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─────────────────────────────────────────────
// POST /v1/me/list-presets
// ─────────────────────────────────────────────

app.post('/me/list-presets', async (c) => {
  const userId = c.get('userId') as string
  try {
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
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─────────────────────────────────────────────
// PATCH /v1/me/list-presets/:id
// ─────────────────────────────────────────────

app.patch('/me/list-presets/:id', async (c) => {
  const userId = c.get('userId') as string
  const id = c.req.param('id')
  try {
    const existing = await prisma.listPreset.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) {
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
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─────────────────────────────────────────────
// DELETE /v1/me/list-presets/:id
// ─────────────────────────────────────────────

app.delete('/me/list-presets/:id', async (c) => {
  const userId = c.get('userId') as string
  const id = c.req.param('id')
  try {
    const existing = await prisma.listPreset.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) {
      return c.json({ error: 'Not found' }, 404)
    }
    await prisma.listPreset.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
