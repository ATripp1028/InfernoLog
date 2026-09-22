import { z } from 'zod'
import {
  LevelSchema,
  PublicUserProfileSchema,
  CompletionInputSchema,
  ProgressInputSchema,
  DropInputSchema,
  EditProgressInputSchema,
  ManualLevelDifficultySchema,
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
  NotADemonResponseSchema,
  ExistingCompletionSchema,
  LevelListSummarySchema,
  LevelProgressListEntrySchema,
  LevelProgressListItemSchema,
  LevelProgressListResponseSchema,
  DemonListBadgeSchema,
  CommunityTiersSchema,
  ClassicDemonListEntrySchema,
  UnplacedDemonListEntrySchema,
  ClassicDemonListResponseSchema,
  PlaceOnDemonListInputSchema,
  ReorderDemonListInputSchema,
  LogPresetInputSchema,
  LogPresetUpdateSchema,
  LogPresetSchema,
  CreateCollectionInputSchema,
  UpdateCollectionInputSchema,
  CollectionSummarySchema,
  CollectionsResponseSchema,
  CollectionEntrySchema,
  CollectionDetailSchema,
  AddCollectionEntryInputSchema,
  ReorderCollectionEntryInputSchema,
  SetCollectionOrderingInputSchema,
  CopyCollectionEntriesInputSchema,
  CopyCollectionEntriesResultSchema,
  CollectionBrowseResultSchema,
  CollectionBrowseResponseSchema,
  ActivityFieldChangeSchema,
  ActivityLevelImpactSchema,
  ActivityFeedEventSchema,
  ActivityFeedProgressSchema,
  ActivityFeedItemSchema,
  ActivityFeedQuerySchema,
  ActivityFeedKindSchema,
  ActivityFeedResponseSchema,
  FeedEventTypeSchema,
  ActivityFieldCategorySchema,
  ActivityImpactRoleSchema,
  RankHistoryEntryKindSchema,
  RankHistoryEntrySchema,
  RankHistoryResponseSchema,
  ExportPageResponseSchema,
  ExportResponseSchema,
  ExportRatingSchema,
  ExportCollectionSchema,
  ExportRankingSchema,
  ExportDroppedSchema,
  ExportProgressSchema,
  ExportCompletionSchema,
  ImportStatusResponseSchema,
  ImportFlaggedRowSchema,
  ImportStartResponseSchema,
  ImportStartRequestSchema,
  ImportRatingsResponseSchema,
  ImportRatingsRequestSchema,
  ImportRatingEntrySchema,
  ImportCollectionsResponseSchema,
  ImportCollectionsRequestSchema,
  ImportCollectionEntrySchema,
  ImportRankingResponseSchema,
  ImportRankingRequestSchema,
  ImportRankingEntrySchema,
  ImportCommitRowSchema,
  ImportCommitResponseSchema,
  ImportCommitRequestSchema,
  ImportCheckResponseSchema,
  ImportCheckRequestSchema,
  ImportListMergeSchema,
  ImportListEntrySchema,
  ImportRatingConflictSchema,
  ImportDuplicateRowSchema,
  ImportRowConflictSchema,
  ImportFieldDiffSchema,
  ImportConflictActionSchema,
  ImportCompletionRowSchema,
  ImportProgressRowSchema,
  ImportDroppedRowSchema
} from './schemas'

export type Level = z.infer<typeof LevelSchema>
export type PublicUserProfile = z.infer<typeof PublicUserProfileSchema>

export type CompletionInput = z.infer<typeof CompletionInputSchema>
export type ProgressInput = z.infer<typeof ProgressInputSchema>
export type DropInput = z.infer<typeof DropInputSchema>
export type EditProgressInput = z.infer<typeof EditProgressInputSchema>
export type ManualLevelDifficulty = z.infer<typeof ManualLevelDifficultySchema>
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
export type NotADemonResponse = z.infer<typeof NotADemonResponseSchema>
export type ExistingCompletion = z.infer<typeof ExistingCompletionSchema>

export type LevelListSummary = z.infer<typeof LevelListSummarySchema>
export type LevelProgressListEntry = z.infer<
  typeof LevelProgressListEntrySchema
>
export type LevelProgressListItem = z.infer<typeof LevelProgressListItemSchema>
export type LevelProgressListResponse = z.infer<
  typeof LevelProgressListResponseSchema
>

export type DemonListBadge = z.infer<typeof DemonListBadgeSchema>
export type CommunityTiers = z.infer<typeof CommunityTiersSchema>
export type ClassicDemonListEntry = z.infer<typeof ClassicDemonListEntrySchema>
export type UnplacedDemonListEntry = z.infer<
  typeof UnplacedDemonListEntrySchema
>
export type ClassicDemonListResponse = z.infer<
  typeof ClassicDemonListResponseSchema
>
export type PlaceOnDemonListInput = z.infer<typeof PlaceOnDemonListInputSchema>
export type ReorderDemonListInput = z.infer<typeof ReorderDemonListInputSchema>

export type LogPresetInput = z.infer<typeof LogPresetInputSchema>
export type LogPresetUpdate = z.infer<typeof LogPresetUpdateSchema>
export type LogPresetRecord = z.infer<typeof LogPresetSchema>

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
export type SetCollectionOrderingInput = z.infer<
  typeof SetCollectionOrderingInputSchema
>
export type CopyCollectionEntriesInput = z.infer<
  typeof CopyCollectionEntriesInputSchema
>
export type CopyCollectionEntriesResult = z.infer<
  typeof CopyCollectionEntriesResultSchema
>
export type CollectionBrowseResult = z.infer<
  typeof CollectionBrowseResultSchema
>
export type CollectionBrowseResponse = z.infer<
  typeof CollectionBrowseResponseSchema
>

export type ImportCompletionRow = z.infer<typeof ImportCompletionRowSchema>
export type ImportProgressRow = z.infer<typeof ImportProgressRowSchema>
export type ImportDroppedRow = z.infer<typeof ImportDroppedRowSchema>
export type ImportConflictAction = z.infer<typeof ImportConflictActionSchema>
export type ImportFieldDiff = z.infer<typeof ImportFieldDiffSchema>
export type ImportRowConflict = z.infer<typeof ImportRowConflictSchema>
export type ImportDuplicateRow = z.infer<typeof ImportDuplicateRowSchema>
export type ImportRatingConflict = z.infer<typeof ImportRatingConflictSchema>
export type ImportListEntry = z.infer<typeof ImportListEntrySchema>
export type ImportListMerge = z.infer<typeof ImportListMergeSchema>
export type ImportCheckRequest = z.infer<typeof ImportCheckRequestSchema>
export type ImportCheckResponse = z.infer<typeof ImportCheckResponseSchema>
export type ImportCommitRequest = z.infer<typeof ImportCommitRequestSchema>
export type ImportCommitResponse = z.infer<typeof ImportCommitResponseSchema>
export type ImportCommitRow = z.infer<typeof ImportCommitRowSchema>
export type ImportRankingEntry = z.infer<typeof ImportRankingEntrySchema>
export type ImportRankingRequest = z.infer<typeof ImportRankingRequestSchema>
export type ImportRankingResponse = z.infer<typeof ImportRankingResponseSchema>
export type ImportCollectionEntry = z.infer<typeof ImportCollectionEntrySchema>
export type ImportCollectionsRequest = z.infer<
  typeof ImportCollectionsRequestSchema
>
export type ImportCollectionsResponse = z.infer<
  typeof ImportCollectionsResponseSchema
>
export type ImportRatingEntry = z.infer<typeof ImportRatingEntrySchema>
export type ImportRatingsRequest = z.infer<typeof ImportRatingsRequestSchema>
export type ImportRatingsResponse = z.infer<typeof ImportRatingsResponseSchema>
export type ImportStartRequest = z.infer<typeof ImportStartRequestSchema>
export type ImportStartResponse = z.infer<typeof ImportStartResponseSchema>
export type ImportFlaggedRow = z.infer<typeof ImportFlaggedRowSchema>
export type ImportStatusResponse = z.infer<typeof ImportStatusResponseSchema>
export type ExportCompletion = z.infer<typeof ExportCompletionSchema>
export type ExportProgress = z.infer<typeof ExportProgressSchema>
export type ExportDropped = z.infer<typeof ExportDroppedSchema>
export type ExportRanking = z.infer<typeof ExportRankingSchema>
export type ExportCollection = z.infer<typeof ExportCollectionSchema>
export type ExportRating = z.infer<typeof ExportRatingSchema>
export type ExportResponse = z.infer<typeof ExportResponseSchema>
export type ExportPageResponse = z.infer<typeof ExportPageResponseSchema>

export type ActivityFieldChange = z.infer<typeof ActivityFieldChangeSchema>
export type ActivityLevelImpact = z.infer<typeof ActivityLevelImpactSchema>
export type ActivityFeedEvent = z.infer<typeof ActivityFeedEventSchema>
export type ActivityFeedProgress = z.infer<typeof ActivityFeedProgressSchema>
export type ActivityFeedItem = z.infer<typeof ActivityFeedItemSchema>
export type ActivityFeedKind = z.infer<typeof ActivityFeedKindSchema>
export type ActivityFeedQuery = z.infer<typeof ActivityFeedQuerySchema>
export type ActivityFeedResponse = z.infer<typeof ActivityFeedResponseSchema>
export type FeedEventType = z.infer<typeof FeedEventTypeSchema>
export type ActivityFieldCategory = z.infer<typeof ActivityFieldCategorySchema>
export type ActivityImpactRole = z.infer<typeof ActivityImpactRoleSchema>
export type RankHistoryEntryKind = z.infer<typeof RankHistoryEntryKindSchema>
export type RankHistoryEntry = z.infer<typeof RankHistoryEntrySchema>
export type RankHistoryResponse = z.infer<typeof RankHistoryResponseSchema>
