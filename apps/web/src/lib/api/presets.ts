import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'
import type { FilterState, SortSpec } from '@/features/list/types'
import { normalizeFilterState } from '@/features/list/types'
import type { ColumnId, ColumnVisibility } from '@/features/list/columns'
import type { PresetColorId } from '@/features/list/presets'

/**
 * A saved List view: its sorts, filters, column set, and column order.
 *
 * Presets are stored as whole snapshots, so one saved before a filter field
 * existed comes back missing that field — {@link useListPresets} runs every
 * preset through `normalizeFilterState` on read for exactly that reason.
 */
export interface ListPreset {
  id: string
  userId: string
  name: string
  description: string | null
  color: PresetColorId
  sorts: SortSpec[]
  filters: FilterState
  columns: ColumnVisibility
  columnOrder: ColumnId[]
  hideTime: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Everything a new preset needs. Every view field is required — a preset always captures a complete view.
 */
export interface CreatePresetInput {
  name: string
  description?: string | null
  color: PresetColorId
  sorts: SortSpec[]
  filters: FilterState
  columns: ColumnVisibility
  columnOrder: ColumnId[]
  hideTime: boolean
}

/**
 * A partial preset update. Omitted fields keep their stored value.
 */
export interface UpdatePresetInput {
  name?: string
  description?: string | null
  color?: PresetColorId
  sorts?: SortSpec[]
  filters?: FilterState
  columns?: ColumnVisibility
  columnOrder?: ColumnId[]
  hideTime?: boolean
}

/**
 * Cache key for the user's saved List views.
 */
export const presetsQueryKey = ['list-presets'] as const

/**
 * The user's saved List views, with stored filters normalized against the current filter shape.
 */
export function useListPresets() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: presetsQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<ListPreset[]> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ListPreset[] }>(
        '/v1/me/list-presets',
        { token, method: 'GET' }
      )
      // Normalize stored filters so presets saved before a filter field was
      // added still have every field present (avoids undefined access crashes).
      // hideTime similarly defaults to false for presets saved before it existed.
      return data.map((p) => ({
        ...p,
        filters: normalizeFilterState(p.filters),
        hideTime: p.hideTime ?? false,
      }))
    },
  })
}

/**
 * Saves the current List view as a new preset.
 */
export function useCreatePreset() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreatePresetInput): Promise<ListPreset> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ListPreset }>(
        '/v1/me/list-presets',
        { token, method: 'POST', body: input }
      )
      return data
    },
    onSuccess: (preset) => {
      queryClient.setQueryData<ListPreset[]>(presetsQueryKey, (old) =>
        old ? [...old, preset] : [preset]
      )
    },
  })
}

/**
 * Mutation key for preset updates.
 *
 * Exported so the settings save-notifier can watch this mutation without
 * importing the hook — see `useMutationBurstNotifier`.
 */
export const updatePresetMutationKey = ['updatePreset'] as const

/**
 * Patches a saved preset. Tagged with {@link updatePresetMutationKey} so save indicators can observe it.
 */
export function useUpdatePreset() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: updatePresetMutationKey,
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: UpdatePresetInput
    }): Promise<ListPreset> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ListPreset }>(
        `/v1/me/list-presets/${id}`,
        { token, method: 'PATCH', body: input }
      )
      return data
    },
    onSuccess: (preset) => {
      queryClient.setQueryData<ListPreset[]>(presetsQueryKey, (old) =>
        old ? old.map((p) => (p.id === preset.id ? preset : p)) : [preset]
      )
    },
  })
}

/**
 * Deletes a saved preset.
 */
export function useDeletePreset() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/list-presets/${encodeURIComponent(id)}`, {
        token,
        method: 'DELETE',
      })
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<ListPreset[]>(presetsQueryKey, (old) =>
        old ? old.filter((p) => p.id !== id) : []
      )
    },
  })
}
