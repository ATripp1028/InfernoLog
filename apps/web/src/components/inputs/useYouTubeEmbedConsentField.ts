// Logic for YouTubeEmbedConsentField: the one switch deciding whether
// HeroVideo may load YouTube's player with the page.

import { toast } from '@/components/generic/sonner'
import { useUpdateMe, type MeData } from '@/lib/api/me'

/**
 * The YouTube consent switch's value and writer.
 *
 * Saves on change, like every settings row, and a failed write toasts. The
 * value reads straight through from `me`, so the optimistic update moves the
 * switch without a sync effect.
 */
export function useYouTubeEmbedConsentField(me: MeData) {
  const update = useUpdateMe()

  const save = async (next: boolean) => {
    try {
      await update.mutateAsync({ youtubeEmbedConsent: next })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return {
    allowed: me.youtubeEmbedConsent,
    onAllowedChange: (next: boolean) => void save(next),
  }
}
