import type { DateFormatPreference } from '@/lib/api/me'

export function formatDate(
  date: Date | string,
  preference: DateFormatPreference
): string {
  let yyyy: string
  let mm: string
  let dd: string
  // Calendar dates (Prisma `@db.Date`, e.g. a completion date) arrive as either
  // a bare `yyyy-MM-dd` string or a UTC-midnight ISO string. Read the calendar
  // parts straight from the string so they don't shift a day in a negative-UTC
  // timezone. Real timestamps (Date objects, or ISO strings with a real time)
  // fall through to local components.
  const calendar =
    typeof date === 'string'
      ? date.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/)
      : null
  if (calendar) {
    yyyy = calendar[1]!
    mm = calendar[2]!
    dd = calendar[3]!
  } else {
    const d = typeof date === 'string' ? new Date(date) : date
    yyyy = d.getFullYear().toString()
    mm = String(d.getMonth() + 1).padStart(2, '0')
    dd = String(d.getDate()).padStart(2, '0')
  }
  switch (preference) {
    case 'MDY':
      return `${mm}/${dd}/${yyyy}`
    case 'DMY':
      return `${dd}/${mm}/${yyyy}`
    case 'ISO':
      return `${yyyy}-${mm}-${dd}`
    case 'YMD':
      return `${yyyy}/${mm}/${dd}`
    default:
      return `${mm}/${dd}/${yyyy}`
  }
}
