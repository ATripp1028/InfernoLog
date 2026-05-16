import type { DateFormatPreference } from '@/lib/api/me'

export function formatDate(
  date: Date | string,
  preference: DateFormatPreference
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const yyyy = d.getFullYear().toString()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
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
