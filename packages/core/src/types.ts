import { z } from 'zod'
import {
  LevelSchema,
  ProgressUpdateInputSchema,
  PublicUserProfileSchema,
  CompletionInputSchema,
  ProgressInputSchema,
  DropInputSchema,
  EditProgressInputSchema,
  ManualLevelInputSchema,
  RatingScoreInputSchema,
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
  ListPresetInputSchema,
  ListPresetUpdateSchema,
  ListPresetSchema,
  CreateCollectionInputSchema,
  UpdateCollectionInputSchema,
  CollectionSummarySchema,
  CollectionsResponseSchema,
  CollectionEntrySchema,
  CollectionDetailSchema,
  AddCollectionEntryInputSchema,
  ReorderCollectionEntryInputSchema,
} from './schemas'

export type Level = z.infer<typeof LevelSchema>
export type ProgressUpdateInput = z.infer<typeof ProgressUpdateInputSchema>
export type PublicUserProfile = z.infer<typeof PublicUserProfileSchema>

export type CompletionInput = z.infer<typeof CompletionInputSchema>
export type ProgressInput = z.infer<typeof ProgressInputSchema>
export type DropInput = z.infer<typeof DropInputSchema>
export type EditProgressInput = z.infer<typeof EditProgressInputSchema>
export type ManualLevelInput = z.infer<typeof ManualLevelInputSchema>
export type RatingScoreInput = z.infer<typeof RatingScoreInputSchema>
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

export type ListPresetInput = z.infer<typeof ListPresetInputSchema>
export type ListPresetUpdate = z.infer<typeof ListPresetUpdateSchema>
export type ListPresetRecord = z.infer<typeof ListPresetSchema>

export type CreateCollectionInput = z.infer<typeof CreateCollectionInputSchema>
export type UpdateCollectionInput = z.infer<typeof UpdateCollectionInputSchema>
export type CollectionSummary = z.infer<typeof CollectionSummarySchema>
export type CollectionsResponse = z.infer<typeof CollectionsResponseSchema>
export type CollectionEntry = z.infer<typeof CollectionEntrySchema>
export type CollectionDetail = z.infer<typeof CollectionDetailSchema>
export type AddCollectionEntryInput = z.infer<
  typeof AddCollectionEntryInputSchema
>
export type ReorderCollectionEntryInput = z.infer<
  typeof ReorderCollectionEntryInputSchema
>
