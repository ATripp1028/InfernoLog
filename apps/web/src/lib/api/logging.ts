import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from './client'
import type { ListSource } from './me'

// ─────────────────────────────────────────────
// Logging flow — wire types. We mirror packages/core's Zod schemas as plain TS
// here rather than importing them: apps/web pins zod@3 while core is on zod@4,
// and the server is the source of truth for validation. (Same convention as
// lib/api/me.ts.)
// ─────────────────────────────────────────────

export type DifficultyOpinion =
  | 'NOT_DEMON_WORTHY'
  | 'EASY'
  | 'MEDIUM'
  | 'HARD'
  | 'INSANE'
  | 'EXTREME'

export type EntryVisibility = 'PUBLIC' | 'PRIVATE'

export interface Level {
  inGameId: string
  levelType: 'CLASSIC' | 'PLATFORMER'
  isRated: boolean
  isDemon: boolean
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  length: string | null
  songName: string | null
  songAuthor: string | null
  isNong: boolean
  nongSongTitle: string | null
  nongArtist: string | null
  nongSourceUrl: string | null
  peakMusicBpm: number | null
  // Extended RobTop level metadata snapshot (all nullable; see schema.prisma).
  description: string | null
  creatorPlayerId: string | null
  creatorAccountId: string | null
  creatorPoints: number | null
  stars: number | null
  starsRequested: number | null
  partialDiff: string | null
  difficultyFace: string | null
  downloads: number | null
  likes: number | null
  disliked: boolean | null
  objectCount: number | null
  largeLevel: boolean | null
  coins: number | null
  coinsVerified: boolean | null
  orbs: number | null
  diamonds: number | null
  featured: boolean | null
  featureScore: number | null
  epicValue: number | null
  twoPlayer: boolean | null
  lowDetailMode: boolean | null
  copiedFromId: string | null
  levelVersion: number | null
  gameVersion: string | null
  editorSeconds: number | null
  editorSecondsTotal: number | null
  officialSongId: number | null
  songId: string | null
  songLink: string | null
  songSize: string | null
  dataSource: string
  verified: boolean
}

export interface LevelSearchResult {
  inGameId: string
  name: string | null
  creator: string | null
  songName: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
}

export interface ExistingCompletion {
  progressUpdateId: string
  date: string | null
  dateUncertain: boolean
  attempts: number | null
  difficultyOpinion: DifficultyOpinion | null
  difficultyOpinionStars: number | null
  enjoyment: number | null
  simpleRating: number | null
  worstFail: number | null
  fps: number | null
  onStream: boolean
  videoUrl: string | null
  highlightUrl: string | null
  notes: string | null
  visibility: EntryVisibility
  ratingScores: Array<{ categoryId: string; score: number }>
  listReferences: Array<{
    listSource: ListSource
    tierOrRank: string
    atTimeOfLogging: boolean
  }>
}

export interface ResolveLevelResponse {
  level: Level | null
  fallbackToManual: boolean
  suggestedGddlTier: number | null
  existingCompletion: ExistingCompletion | null
}

export interface ManualLevelInput {
  inGameId: string
  name: string
  creator: string
  difficulty: string
  isDemon?: boolean
  isRated?: boolean
  songName?: string | null
  songAuthor?: string | null
  length?: string | null
}

export interface CompletionListReference {
  listSource: ListSource
  tierOrRank: string
  atTimeOfLogging?: boolean
}

export interface CompletionInput {
  levelId: string
  date?: string | null
  dateUncertain?: boolean
  attempts?: number | null
  worstFail?: number | null
  fps?: number | null
  onStream?: boolean
  highlightUrl?: string | null
  notes?: string | null
  visibility?: EntryVisibility
  videoUrl?: string | null
  difficultyOpinion?: DifficultyOpinion | null
  difficultyOpinionStars?: number | null
  enjoyment?: number | null
  simpleRating?: number | null
  ratingScores?: Array<{ categoryId: string; score: number }>
  listReferences?: CompletionListReference[]
  submitToGddl?: boolean
}

export type ProgressInput = { levelId: string } & (
  | { mode: 'from_zero'; percentage: number }
  | { mode: 'from_run'; runFrom: number; runTo: number }
) & {
    enjoyment?: number | null
    date?: string | null
    dateUncertain?: boolean
    attempts?: number | null
    fps?: number | null
    onStream?: boolean
    highlightUrl?: string | null
    notes?: string | null
    visibility?: EntryVisibility
  }

export interface DropInput {
  levelId: string
  droppedAt?: string | null
  attemptsAtDrop?: number | null
  worstFail?: number | null
  droppedReason?: string | null
  visibility?: EntryVisibility
}

// The write endpoints echo back the resulting records; the flow only needs to
// know the call succeeded, so the result shape is intentionally loose.
export interface LogResult {
  levelProgress: { id: string; status: string }
  progressUpdate: { id: string } | null
}

// Placeholder query keys the Log/List/Ranking pages will adopt; invalidated on
// every write so those views refetch once they're built.
const INVALIDATE_ON_WRITE: ReadonlyArray<readonly string[]> = [
  ['log'],
  ['list'],
  ['ranking'],
]

// ─────────────────────────────────────────────
// Level entry support
// ─────────────────────────────────────────────

// Fuzzy name search. Enabled only for text queries of length >= 2 — numeric
// inputs are level IDs and resolve directly, never search.
export function useLevelSearch(query: string) {
  const { getIdToken } = useAuth()
  const q = query.trim()
  const enabled = q.length >= 2 && !/^\d+$/.test(q)
  return useQuery({
    queryKey: ['levels', 'search', q],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<LevelSearchResult[]> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LevelSearchResult[] }>(
        `/v1/levels/search?q=${encodeURIComponent(q)}`,
        { token, method: 'GET' }
      )
      return data
    },
  })
}

export function useResolveLevel() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (levelId: string): Promise<ResolveLevelResponse> => {
      const token = await getIdToken()
      return apiFetch<ResolveLevelResponse>(
        `/v1/levels/${encodeURIComponent(levelId)}/resolve`,
        { token, method: 'GET' }
      )
    },
  })
}

export function useCreateManualLevel() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (input: ManualLevelInput): Promise<Level> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: Level }>('/v1/levels', {
        token,
        method: 'POST',
        body: input,
      })
      return data
    },
  })
}

// ─────────────────────────────────────────────
// Logging writes
// ─────────────────────────────────────────────

function useInvalidateOnWrite() {
  const queryClient = useQueryClient()
  return () => {
    for (const key of INVALIDATE_ON_WRITE) {
      void queryClient.invalidateQueries({ queryKey: key as unknown[] })
    }
  }
}

export function useLogCompletion() {
  const { getIdToken } = useAuth()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationFn: async (input: CompletionInput): Promise<LogResult> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LogResult }>(
        '/v1/me/completions',
        { token, method: 'POST', body: input }
      )
      return data
    },
    onSuccess: invalidate,
  })
}

export function useLogProgress() {
  const { getIdToken } = useAuth()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationFn: async (input: ProgressInput): Promise<LogResult> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LogResult }>('/v1/me/progress', {
        token,
        method: 'POST',
        body: input,
      })
      return data
    },
    onSuccess: invalidate,
  })
}

export function useLogDrop() {
  const { getIdToken } = useAuth()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationFn: async (input: DropInput): Promise<LogResult> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LogResult }>('/v1/me/drops', {
        token,
        method: 'POST',
        body: input,
      })
      return data
    },
    onSuccess: invalidate,
  })
}

export function useSubmitGddlRecord() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (levelId: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/gddl-records/${encodeURIComponent(levelId)}`, {
        token,
        method: 'POST',
      })
    },
  })
}
