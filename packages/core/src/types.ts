import { z } from 'zod'
import {
  LevelSchema,
  ProgressUpdateInputSchema,
  ListReferenceInputSchema,
  PublicUserProfileSchema,
  CompletionInputSchema,
  ProgressInputSchema,
  DropInputSchema,
  ManualLevelInputSchema,
  RatingScoreInputSchema,
  CompletionListReferenceSchema,
  LevelSearchResultSchema,
  ResolveLevelResponseSchema,
  ExistingCompletionSchema,
  LevelListSummarySchema,
  LevelProgressListEntrySchema,
  LevelProgressListItemSchema,
  LevelProgressListResponseSchema,
  RankingBadgeSchema,
  ClassicRankingEntrySchema,
  UnplacedRankingEntrySchema,
  ClassicRankingResponseSchema,
  PlaceRankingInputSchema,
  ReorderRankingInputSchema,
} from './schemas'

export type Level = z.infer<typeof LevelSchema>
export type ProgressUpdateInput = z.infer<typeof ProgressUpdateInputSchema>
export type ListReferenceInput = z.infer<typeof ListReferenceInputSchema>
export type PublicUserProfile = z.infer<typeof PublicUserProfileSchema>

export type CompletionInput = z.infer<typeof CompletionInputSchema>
export type ProgressInput = z.infer<typeof ProgressInputSchema>
export type DropInput = z.infer<typeof DropInputSchema>
export type ManualLevelInput = z.infer<typeof ManualLevelInputSchema>
export type RatingScoreInput = z.infer<typeof RatingScoreInputSchema>
export type CompletionListReferenceInput = z.infer<
  typeof CompletionListReferenceSchema
>
export type LevelSearchResult = z.infer<typeof LevelSearchResultSchema>
export type ResolveLevelResponse = z.infer<typeof ResolveLevelResponseSchema>
export type ExistingCompletion = z.infer<typeof ExistingCompletionSchema>

export type LevelListSummary = z.infer<typeof LevelListSummarySchema>
export type LevelProgressListEntry = z.infer<
  typeof LevelProgressListEntrySchema
>
export type LevelProgressListItem = z.infer<typeof LevelProgressListItemSchema>
export type LevelProgressListResponse = z.infer<
  typeof LevelProgressListResponseSchema
>

export type RankingBadge = z.infer<typeof RankingBadgeSchema>
export type ClassicRankingEntry = z.infer<typeof ClassicRankingEntrySchema>
export type UnplacedRankingEntry = z.infer<typeof UnplacedRankingEntrySchema>
export type ClassicRankingResponse = z.infer<
  typeof ClassicRankingResponseSchema
>
export type PlaceRankingInput = z.infer<typeof PlaceRankingInputSchema>
export type ReorderRankingInput = z.infer<typeof ReorderRankingInputSchema>
