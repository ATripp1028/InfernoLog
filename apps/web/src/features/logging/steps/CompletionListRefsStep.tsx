import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldHint,
  FieldLabel,
  LevelHeader,
  SectionLabel,
  StepBody,
  StepFooter,
} from '../components'

export function CompletionListRefsStep() {
  const { level, draft, suggestedGddlTier, patchDraft, setStep } =
    useLoggingFlow()
  const me = useMe()
  if (!level) return null

  const hasGddlKey = me.data?.hasGddlApiKey ?? false

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <p className="text-sm text-text-secondary">
          Tier and rank data you want on record. They also help pre-place the
          level in your ranking, but they&apos;re real data worth logging in
          their own right.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="gddl-tier">GDDL tier</FieldLabel>
            <Input
              id="gddl-tier"
              value={draft.gddlTier}
              onChange={(e) => patchDraft({ gddlTier: e.target.value })}
            />
            {suggestedGddlTier != null && (
              <FieldHint>Suggested: {suggestedGddlTier}</FieldHint>
            )}
          </div>
          <div>
            <FieldLabel htmlFor="nlw-tier">NLW tier</FieldLabel>
            <Input
              id="nlw-tier"
              value={draft.nlwTier}
              onChange={(e) => patchDraft({ nlwTier: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="aredl-tier">AREDL placement</FieldLabel>
            <Input
              id="aredl-tier"
              value={draft.aredlTier}
              onChange={(e) => patchDraft({ aredlTier: e.target.value })}
              placeholder="#"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border-subtle pt-4">
          <SectionLabel>GDDL record</SectionLabel>
          {!hasGddlKey && (
            <FieldHint>
              Connect your GDDL API key in Settings to submit records from
              InfernoLog.
            </FieldHint>
          )}
          <ToggleRow
            title="Submit this completion to GDDL"
            subtitle="Uses your connected GDDL key. Optional."
            checked={draft.submitToGddl}
            disabled={!hasGddlKey}
            onChange={(v) => patchDraft({ submitToGddl: v })}
          />
          <ToggleRow
            title="Mark record as accepted"
            subtitle="Self-reported — flip once GDDL accepts it."
            checked={draft.gddlRecordAccepted}
            disabled={!hasGddlKey}
            onChange={(v) => patchDraft({ gddlRecordAccepted: v })}
          />
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('c_rating')}>
          Back
        </Button>
        <Button onClick={() => setStep('c_session')}>Continue</Button>
      </StepFooter>
    </>
  )
}

function ToggleRow({
  title,
  subtitle,
  checked,
  disabled,
  onChange,
}: {
  title: string
  subtitle: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className={disabled ? 'opacity-50' : undefined}>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-tertiary">{subtitle}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
