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
