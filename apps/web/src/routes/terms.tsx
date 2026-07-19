import { createFileRoute } from '@tanstack/react-router'
import termsAndConditions from '../../../../legal/TERMS_AND_CONDITIONS.md?raw'
import { LegalDocPage } from '@/components/LegalDocPage'

export const Route = createFileRoute('/terms')({
  component: () => (
    <LegalDocPage title="Terms & Conditions" content={termsAndConditions} />
  ),
})
