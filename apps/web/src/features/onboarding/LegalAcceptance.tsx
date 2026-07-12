import { useState } from 'react'
import Markdown from 'react-markdown'
import termsAndConditions from '../../../../../legal/TERMS_AND_CONDITIONS.md?raw'
import privacyPolicy from '../../../../../legal/PRIVACY_POLICY.md?raw'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface LegalAcceptanceProps {
  onContinue: () => void
  pending?: boolean
}

// Combined ToS + Privacy Policy view, per spec: a single scrollable
// markdown-rendered document rather than two separate pages, with Continue
// disabled until the checkbox is checked.
export function LegalAcceptance({ onContinue, pending }: LegalAcceptanceProps) {
  const [agreed, setAgreed] = useState(false)

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Terms &amp; Privacy</h1>
        <p className="text-sm text-muted-foreground">
          Please review and accept our Terms and Conditions and Privacy Policy
          to continue.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-4">
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:font-medium [&_h2]:text-foreground [&_hr]:my-4 [&_hr]:border-[var(--color-border)]">
          <Markdown>{termsAndConditions}</Markdown>
          <hr />
          <Markdown>{privacyPolicy}</Markdown>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="legal-agree"
          checked={agreed}
          onCheckedChange={(v) => setAgreed(v)}
        />
        <Label htmlFor="legal-agree" className="cursor-pointer font-normal">
          I agree to the Terms and Conditions and Privacy Policy
        </Label>
      </div>

      <Button disabled={!agreed || pending} onClick={onContinue}>
        Continue
      </Button>
    </div>
  )
}
