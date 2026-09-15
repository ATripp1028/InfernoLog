import { Button } from '@/components/generic/button'
import { GoogleIcon } from '@/components/data/providerIcons'
import { useReconfirmStep } from './useReconfirmStep'

/**
 * Adding a password, step one: confirm it's you with Google.
 */
export function ReconfirmStep() {
  const { pending, error, reconfirm } = useReconfirmStep()
  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-sm text-muted-foreground">
        For your security, confirm it's you before adding a password. You'll
        have 5 minutes to finish afterwards.
      </p>
      <Button
        type="button"
        variant="outline"
        className="gap-3"
        onClick={reconfirm}
        disabled={pending}
      >
        <GoogleIcon />
        {pending ? 'Opening Google…' : 'Re-confirm with Google'}
      </Button>
    </div>
  )
}
