import { z } from 'zod'
import {
  LevelSchema,
  ProgressUpdateInputSchema,
  ListReferenceInputSchema,
  PublicUserProfileSchema,
} from './schemas'

export type Level = z.infer<typeof LevelSchema>
export type ProgressUpdateInput = z.infer<typeof ProgressUpdateInputSchema>
export type ListReferenceInput = z.infer<typeof ListReferenceInputSchema>
export type PublicUserProfile = z.infer<typeof PublicUserProfileSchema>