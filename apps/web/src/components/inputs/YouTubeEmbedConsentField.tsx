import { SettingRow } from '@/components/generic/settings-section'
import { Switch } from '@/components/generic/switch'
import type { MeData } from '@/lib/api/me'
import { useYouTubeEmbedConsentField } from './useYouTubeEmbedConsentField'

/**
 * Whether completion and showcase videos load YouTube's player with the page.
 *
 * This is consent rather than a display preference, so it stays off until the
 * user turns it on, and its description has to say what turning it on does.
 * The onboarding step and the Privacy section of Settings both render this
 * one field, so the two can never describe it differently.
 */
export function YouTubeEmbedConsentField({ me }: { me: MeData }) {
  const { allowed, onAllowedChange } = useYouTubeEmbedConsentField(me)

  return (
    <SettingRow
      label="Load YouTube videos automatically"
      description={
        <>
          Completion and showcase videos load in YouTube’s player as soon as a
          level page opens, so they play in one tap. YouTube (Google) may then
          store data on your device. When this is off, nothing loads from
          YouTube until you press play on a video. See the{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-primary-light hover:underline"
          >
            Privacy Policy
          </a>
          .
        </>
      }
      control={<Switch checked={allowed} onCheckedChange={onAllowedChange} />}
    />
  )
}
