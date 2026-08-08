// GET /v1/me/export?section=&offset=&limit= — one paginated section of the
// account's data in a faithful domain form.
//
// NOT a file download. The client fetches every section to completion and
// stitches the import-compatible spreadsheet itself, which keeps the round trip
// an identity (export → import reproduces the account) and keeps XLSX
// generation out of Lambda. See docs/IMPORT_EXPORT.md.
//
// Offset-paginated rather than keyset like the rest of the API: this is a full
// drain of a stable snapshot, so the ordering-shift problem keyset solves
// doesn't apply.

import { Hono } from 'hono'
import { EXPORT_SECTIONS, type ExportSection } from '@infernolog/core'
import type { HonoVariables } from '../../types/hono'
import {
  exportSection,
  EXPORT_DEFAULT_LIMIT,
  EXPORT_MAX_LIMIT,
} from '../../services/importExport/export'

const app = new Hono<{ Variables: HonoVariables }>()

app.get('/me/export', async (c) => {
  const userId = c.get('userId')

  const section = c.req.query('section')
  if (!section || !(EXPORT_SECTIONS as readonly string[]).includes(section)) {
    return c.json(
      { error: `section must be one of: ${EXPORT_SECTIONS.join(', ')}` },
      400
    )
  }

  const rawOffset = Number(c.req.query('offset') ?? '0')
  const rawLimit = Number(c.req.query('limit') ?? String(EXPORT_DEFAULT_LIMIT))
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.trunc(rawOffset))
    : 0
  const limit = Number.isFinite(rawLimit)
    ? Math.min(EXPORT_MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
    : EXPORT_DEFAULT_LIMIT

  const page = await exportSection(
    userId,
    section as ExportSection,
    offset,
    limit
  )
  return c.json(page, 200)
})

export default app
