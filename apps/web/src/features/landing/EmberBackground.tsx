import { useEffect, useRef } from 'react'
import {
  COUNT_MAX_DESKTOP,
  COUNT_MIN,
  backgroundColor,
  emberCeiling,
  emberCount,
  emberOpacity,
  emberSpeed,
  emberX,
  scrollFraction as scrollFractionOf,
  spawnEmber,
  stepEmber,
  type Ember,
} from './emberField'

// Scroll-linked ember background. Landing-page only — never mount on
// authenticated app pages. See docs/DESIGN_LANGUAGE.md § Ember Background System.
//
// A single fixed, viewport-sized canvas paints an interpolated background
// color plus a field of drifting embers, all behind the page content (which
// is transparent so this reads through). As the visitor scrolls 0 → 1:
//   - background lerps #0d0d0d (base) → #3a1508 (warm dark, "fire intensifying")
//   - active ember count grows (BASE → CEILING, halved on mobile)
//   - ember speed grows (1x → 2.2x)
// prefers-reduced-motion freezes a static low field and drops all
// scroll-linked changes. The preference is watched live (not just read once
// at mount) so toggling it in OS settings takes effect immediately.

/**
 * The landing page's drifting ember canvas. Purely decorative and `aria-hidden`.
 */
export function EmberBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    let ceiling = COUNT_MAX_DESKTOP
    const embers: Ember[] = []

    // scrollFraction is updated by a passive listener but only consumed inside
    // the rAF loop (never do layout-reading work in the scroll handler itself).
    let scrollFraction = 0

    const spawn = (atBottom: boolean): Ember =>
      spawnEmber(width, height, atBottom)

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = Math.floor(width * dpr)
      canvas!.height = Math.floor(height * dpr)
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ceiling = emberCeiling(width)
    }

    function paintBackground(fraction: number) {
      ctx!.fillStyle = backgroundColor(fraction)
      ctx!.fillRect(0, 0, width, height)
    }

    function drawEmber(e: Ember, opacity: number) {
      ctx!.globalAlpha = Math.max(0, Math.min(1, opacity))
      ctx!.fillStyle = e.color
      ctx!.beginPath()
      ctx!.arc(emberX(e), e.y, e.size, 0, Math.PI * 2)
      ctx!.fill()
    }

    // Static, frozen field for reduced-motion — no animation, no scroll link.
    function renderStatic() {
      resize()
      paintBackground(0)
      for (let i = 0; i < COUNT_MIN; i++) {
        const e = spawn(false)
        drawEmber(e, e.baseOpacity * 0.8)
      }
      ctx!.globalAlpha = 1
    }

    // ── Static mode ───────────────────────────────────────────────────────
    let staticResizeHandler: (() => void) | null = null
    function startStatic() {
      renderStatic()
      staticResizeHandler = () => renderStatic()
      window.addEventListener('resize', staticResizeHandler)
    }
    function stopStatic() {
      if (staticResizeHandler) {
        window.removeEventListener('resize', staticResizeHandler)
        staticResizeHandler = null
      }
    }

    // ── Animated mode ─────────────────────────────────────────────────────
    let rafId = 0
    let ticking = false
    let scrollHandler: (() => void) | null = null
    let animatedResizeHandler: (() => void) | null = null

    function startAnimated() {
      resize()

      scrollHandler = () => {
        if (ticking) return
        ticking = true
        // Read scroll position inside rAF, not in the passive handler.
        requestAnimationFrame(() => {
          const doc = document.documentElement
          scrollFraction = scrollFractionOf(
            doc.scrollTop,
            doc.scrollHeight,
            doc.clientHeight
          )
          ticking = false
        })
      }
      animatedResizeHandler = () => resize()
      window.addEventListener('scroll', scrollHandler, { passive: true })
      window.addEventListener('resize', animatedResizeHandler)
      scrollHandler()

      function frame() {
        const speed = emberSpeed(scrollFraction)
        const target = emberCount(scrollFraction, ceiling)

        while (embers.length < target) embers.push(spawn(true))
        if (embers.length > target) embers.length = target

        paintBackground(scrollFraction)

        for (const e of embers) {
          stepEmber(e, speed, width, height)
          drawEmber(e, emberOpacity(e))
        }
        ctx!.globalAlpha = 1

        rafId = requestAnimationFrame(frame)
      }
      rafId = requestAnimationFrame(frame)
    }

    function stopAnimated() {
      cancelAnimationFrame(rafId)
      if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler)
        scrollHandler = null
      }
      if (animatedResizeHandler) {
        window.removeEventListener('resize', animatedResizeHandler)
        animatedResizeHandler = null
      }
    }

    // ── Live prefers-reduced-motion switch ──────────────────────────────────
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (motionQuery.matches) {
      startStatic()
    } else {
      startAnimated()
    }

    const onMotionPreferenceChange = () => {
      if (motionQuery.matches) {
        stopAnimated()
        startStatic()
      } else {
        stopStatic()
        startAnimated()
      }
    }
    motionQuery.addEventListener('change', onMotionPreferenceChange)

    return () => {
      motionQuery.removeEventListener('change', onMotionPreferenceChange)
      stopAnimated()
      stopStatic()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  )
}
