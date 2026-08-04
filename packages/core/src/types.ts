import { z } from 'zod'
import {
  LevelSchema,
  PublicUserProfileSchema,
  CompletionInputSchema,
  ProgressInputSchema,
  DropInputSchema,
  EditProgressInputSchema,
  ManualLevelInputSchema,
  RatingScoreInputSchema,
  LevelSearchResultSchema,
  GdSearchResponseSchema,
  LevelDifficultySchema,
  LevelRateStatusSchema,
  LevelLengthSchema,
  LevelSongTypeSchema,
  LevelTypeFilterSchema,
  LevelSearchBySchema,
  LevelSortSchema,
  LevelSortDirSchema,
  LevelSearchFiltersSchema,
  LevelBrowseQuerySchema,
  LevelBrowseResultSchema,
  LevelBrowseResponseSchema,
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
export type PublicUserProfile = z.infer<typeof PublicUserProfileSchema>

export type CompletionInput = z.infer<typeof CompletionInputSchema>
export type ProgressInput = z.infer<typeof ProgressInputSchema>
export type DropInput = z.infer<typeof DropInputSchema>
export type EditProgressInput = z.infer<typeof EditProgressInputSchema>
export type ManualLevelInput = z.infer<typeof ManualLevelInputSchema>
export type RatingScoreInput = z.infer<typeof RatingScoreInputSchema>
export type LevelSearchResult = z.infer<typeof LevelSearchResultSchema>
export type GdSearchResponse = z.infer<typeof GdSearchResponseSchema>

export type LevelDifficulty = z.infer<typeof LevelDifficultySchema>
export type LevelRateStatus = z.infer<typeof LevelRateStatusSchema>
export type LevelLength = z.infer<typeof LevelLengthSchema>
export type LevelSongType = z.infer<typeof LevelSongTypeSchema>
export type LevelTypeFilter = z.infer<typeof LevelTypeFilterSchema>
export type LevelSearchBy = z.infer<typeof LevelSearchBySchema>
export type LevelSort = z.infer<typeof LevelSortSchema>
export type LevelSortDir = z.infer<typeof LevelSortDirSchema>
export type LevelSearchFilters = z.infer<typeof LevelSearchFiltersSchema>
export type LevelBrowseQuery = z.infer<typeof LevelBrowseQuerySchema>
export type LevelBrowseResult = z.infer<typeof LevelBrowseResultSchema>
export type LevelBrowseResponse = z.infer<typeof LevelBrowseResponseSchema>
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
