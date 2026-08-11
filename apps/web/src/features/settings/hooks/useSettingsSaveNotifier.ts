import { useMutationBurstNotifier } from '@/hooks/useMutationBurstNotifier'
import { SETTINGS_SAVE_MUTATION_KEYS } from '@/lib/api/me'

/**
 * One "Saved" toast per burst of settings mutations — see
 * useMutationBurstNotifier for the mechanism. The settings page fires many
 * small mutations as the user pokes at it (every toggle, every select,
 * every drag); showing a toast per mutation would be noisy and tell the
 * user nothing they couldn't see by looking at the control.
 *
 * Mount this once at the top of the settings page.
 */
export function useSettingsSaveNotifier() {
  useMutationBurstNotifier(SETTINGS_SAVE_MUTATION_KEYS, 'Saved')
}
