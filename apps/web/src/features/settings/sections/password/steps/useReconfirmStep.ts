import { useSetPasswordFlow } from '../SetPasswordFlowProvider'

/**
 * The first step: leaving to confirm with Google.
 */
export function useReconfirmStep() {
  const flow = useSetPasswordFlow()
  return {
    pending: flow.pending,
    error: flow.error,
    reconfirm: () => void flow.reconfirm(),
  }
}
