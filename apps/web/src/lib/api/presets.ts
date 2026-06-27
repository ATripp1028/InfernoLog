import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from './client'
import type { FilterState, SortSpec } from '../../features/list/types'
import type { ColumnId, ColumnVisibility } from '../../features/list/columns'
import type { PresetColorId } from '../../features/list/presets'

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
  createdAt: string
  updatedAt: string
}

export interface CreatePresetInput {
  name: string
  description?: string | null
  color: PresetColorId
  sorts: SortSpec[]
  filters: FilterState
  columns: ColumnVisibility
  columnOrder: ColumnId[]
}

export interface UpdatePresetInput {
  name?: string
  description?: string | null
  color?: PresetColorId
  sorts?: SortSpec[]
  filters?: FilterState
  columns?: ColumnVisibility
  columnOrder?: ColumnId[]
}

export const presetsQueryKey = ['list-presets'] as const

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
      return data
    },
  })
}

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

export function useUpdatePreset() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
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

export function useDeletePreset() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/list-presets/${id}`, { token, method: 'DELETE' })
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<ListPreset[]>(presetsQueryKey, (old) =>
        old ? old.filter((p) => p.id !== id) : []
      )
    },
  })
}
