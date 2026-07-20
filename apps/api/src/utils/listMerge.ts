// Git-like merge of two orderings (an existing DB order vs. an imported
// sheet order) for Collections/Ranking. Pure and DB-free — see
// services/importCollections.ts's checkCollectionsMerge / importRanking.ts's
// checkRankingMerge for how the DB-facing callers use this.
//
// The mental model is git's: a pure insertion (an entry unique to one side
// whose position relative to the entries both sides agree on is unambiguous)
// auto-resolves with no user interaction. A genuine conflict is specifically
// an ORDER DISAGREEMENT among entries present on both sides — existing
// [A,B,C] vs imported [A,C,D,B] disagrees about B-vs-C (imported puts C
// before B), so the backbone is only [A,B] (C is excluded because its
// position relative to B is contested), and BOTH C and D end up needing
// manual placement — D too, even though D itself has no counterpart on the
// existing side, because D sits adjacent to the contested C in imported's
// sequence and its safe insertion point can't be established independently
// of where C ends up. A pure omission (an existing entry the sheet doesn't
// mention at all) is never auto-included either — see hasConflict below.

export interface ListMergeResult {
  // The backbone (LCS of the two orderings) with every unambiguous
  // imported-only run already spliced in. When hasConflict is false this
  // array is provably identical to importedIds — nothing left to merge.
  mergedSeed: string[]
  // Entries present in both orderings but excluded from the backbone because
  // their relative position is disputed, PLUS any imported-only entries
  // whose safe position couldn't be established independently of that
  // dispute (see the module comment) — in imported's order.
  importedRemainder: string[]
  // The disputed shared entries (in existing's order) UNIONED with entries
  // that exist only in the existing ordering. A levelId appearing in both
  // importedRemainder and existingRemainder is ONE contested entry, not two.
  existingRemainder: string[]
  // True iff importedRemainder or existingRemainder is non-empty.
  hasConflict: boolean
}

// Standard two-sequence LCS (rolling-free — full table, cost is bounded by
// the caller restricting inputs to the id-set intersection first). Tie-break
// on reconstruction: when both directions are equally long, prefer advancing
// the `a` (existing) pointer — this is what makes existing [A,B,C] vs
// imported-restricted-to-shared [A,C,B] resolve to backbone [A,B] rather
// than [A,C], matching a "prefer preserving existing's order" intuition.
function lcs(a: string[], b: string[]): string[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  )
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]! + 1
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
    }
  }

  const result: string[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push(a[i - 1]!)
      i--
      j--
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--
    } else {
      j--
    }
  }
  return result.reverse()
}

export function computeListMerge(
  existingIds: string[],
  importedIds: string[]
): ListMergeResult {
  const existingSet = new Set(existingIds)
  const importedSet = new Set(importedIds)

  // Restrict the LCS to the shared subsequence on each side — a non-shared
  // id can never contribute to the backbone, and this keeps the DP table
  // bounded by the actual overlap rather than the full list sizes.
  const sharedExisting = existingIds.filter((id) => importedSet.has(id))
  const sharedImported = importedIds.filter((id) => existingSet.has(id))
  const agreed = lcs(sharedExisting, sharedImported)
  const agreedSet = new Set(agreed)

  // Walk importedIds once, grouping the non-agreed ids between consecutive
  // agreed anchors into runs. A run containing any conflicting-shared id
  // (present in both orderings, but excluded from the backbone) is entirely
  // undecided — including any pure imported-only ids mixed into that same
  // run, since their position can't be pinned down independently of where
  // the contested id(s) end up. A run with ONLY imported-only ids is safe to
  // splice into the backbone as-is.
  const mergedSeed: string[] = []
  const importedRemainder: string[] = []
  let run: string[] = []
  const flushRun = () => {
    if (run.length === 0) return
    const hasConflictingShared = run.some(
      (id) => existingSet.has(id) && !agreedSet.has(id)
    )
    if (hasConflictingShared) importedRemainder.push(...run)
    else mergedSeed.push(...run)
    run = []
  }
  for (const id of importedIds) {
    if (agreedSet.has(id)) {
      flushRun()
      mergedSeed.push(id)
    } else {
      run.push(id)
    }
  }
  flushRun()

  const existingRemainder = existingIds.filter((id) => !agreedSet.has(id))
  const hasConflict = importedRemainder.length > 0 || existingRemainder.length > 0

  return { mergedSeed, importedRemainder, existingRemainder, hasConflict }
}
