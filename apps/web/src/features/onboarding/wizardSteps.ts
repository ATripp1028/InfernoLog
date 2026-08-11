// The onboarding wizard's step vocabulary, the rule for where a returning
// user picks back up, and how the sequence advances.
//
// Extracted from OnboardingWizard so the sequencing can be exercised without
// rendering the wizard; the rest of that component is JSX.

/**
 * The wizard's steps, in order.
 */
export const STEPS = [
  'legal',
  'username',
  'logging',
  'rating',
  'import',
  'gddl',
] as const

/** One step of first-run setup. See {@link STEPS}. */
export type Step = (typeof STEPS)[number]

/**
 * The progress-indicator label for each step.
 */
export const STEP_LABELS: Record<Step, string> = {
  legal: 'Terms',
  username: 'Username',
  logging: 'Logging',
  rating: 'Rating',
  import: 'Import',
  gddl: 'GDDL',
}

/**
 * Whether a username is still the placeholder the signup trigger seeded.
 *
 * That placeholder is `<email-localpart>_<8 hex chars>`. Used only to decide
 * whether a returning (mid-onboarding) user still needs the Username step, so
 * a tab closed mid-wizard resumes where it left off rather than redoing
 * completed steps.
 */
export function isPlaceholderUsername(
  username: string,
  email: string
): boolean {
  const localPart = email.split('@')[0]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${localPart}_[0-9a-f]{8}$`).test(username)
}

/**
 * Where a returning user picks the wizard back up: the first step they have
 * not yet completed.
 *
 * Only the first three steps are resumable — the rest (rating, import, GDDL)
 * are all optional, so there is nothing to detect and the wizard just runs
 * forward from `logging`.
 */
export function initialStep(user: {
  legalAcceptedAt: string | null
  username: string
  email: string
}): Step {
  if (!user.legalAcceptedAt) return 'legal'
  if (isPlaceholderUsername(user.username, user.email)) return 'username'
  return 'logging'
}

/**
 * The step after this one, or `null` when it is the last — which is what
 * tells the wizard to finish and mark onboarding complete.
 */
export function nextStep(step: Step): Step | null {
  return STEPS[STEPS.indexOf(step) + 1] ?? null
}
