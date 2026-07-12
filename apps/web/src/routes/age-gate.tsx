import { createFileRoute } from '@tanstack/react-router'
import { AgeGate } from '@/features/onboarding/AgeGate'

export const Route = createFileRoute('/age-gate')({
  component: AgeGate,
})
