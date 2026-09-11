import { useState, type SyntheticEvent } from 'react'
import { isYouTubePlaceholder, youTubePosterUrls } from './videoEmbed'

/**
 * Walks a YouTube video's poster sizes until one turns out to be real.
 *
 * A missing size can't be told apart until it has loaded (see
 * `isYouTubePlaceholder`), so each candidate stays hidden until its load
 * confirms it, and a stand-in is swapped for the next size down. Mount the
 * caller under `key={videoId}` so a new video starts again from the top.
 *
 * @returns The `src` to render, or `null` once every size has failed, in which
 * case the caller renders no poster. Also returns `ready`, which is true once
 * that `src` is confirmed real and may be shown, and the `<img>`'s load and
 * error handlers.
 */
export function useYouTubePoster(videoId: string) {
  const candidates = youTubePosterUrls(videoId)
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)

  const advance = () => setAttempt((a) => a + 1)

  return {
    src: candidates[attempt] ?? null,
    ready,
    onLoad: (e: SyntheticEvent<HTMLImageElement>) => {
      if (isYouTubePlaceholder(e.currentTarget.naturalWidth)) advance()
      else setReady(true)
    },
    onError: advance,
  }
}
