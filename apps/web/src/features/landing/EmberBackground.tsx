import { useEffect, useRef } from 'react'

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

const EMBER_COLORS = ['#e8390e', '#ff9f1c', '#ff6b35', '#ff4d1f']

// Background interpolation endpoints (RGB channels lerped by scroll fraction).
const BG_BASE = { r: 0x0d, g: 0x0d, b: 0x0d } // #0d0d0d
const BG_WARM = { r: 0x3a, g: 0x15, b: 0x08 } // #3a1508

const COUNT_MIN = 20
const COUNT_MAX_DESKTOP = 70
const COUNT_MAX_MOBILE = 35
const SPEED_MIN = 1
const SPEED_MAX = 2.2
const MOBILE_BREAKPOINT = 768

interface Ember {
  x: number
  y: number
  size: number
  drift: number // horizontal wander amplitude (px)
  driftPhase: number
  driftSpeed: number
  rise: number // base upward speed (px/frame at 1x)
  baseOpacity: number
  flickerPhase: number
  flickerSpeed: number
  color: string
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

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

    function spawn(atBottom: boolean): Ember {
      return {
        x: Math.random() * width,
        y: atBottom ? height + Math.random() * 40 : Math.random() * height,
        size: 1 + Math.random() * 2.5,
        drift: 8 + Math.random() * 22,
        driftPhase: Math.random() * Math.PI * 2,
        driftSpeed: 0.005 + Math.random() * 0.02,
        rise: 0.3 + Math.random() * 0.8,
        baseOpacity: 0.3 + Math.random() * 0.5,
        flickerPhase: Math.random() * Math.PI * 2,
        flickerSpeed: 0.02 + Math.random() * 0.06,
        color:
          EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)] ??
          '#ff6b35',
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = Math.floor(width * dpr)
      canvas!.height = Math.floor(height * dpr)
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ceiling = width < MOBILE_BREAKPOINT ? COUNT_MAX_MOBILE : COUNT_MAX_DESKTOP
    }

    function paintBackground(fraction: number) {
      const r = Math.round(lerp(BG_BASE.r, BG_WARM.r, fraction))
      const g = Math.round(lerp(BG_BASE.g, BG_WARM.g, fraction))
      const b = Math.round(lerp(BG_BASE.b, BG_WARM.b, fraction))
      ctx!.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx!.fillRect(0, 0, width, height)
    }

    function drawEmber(e: Ember, opacity: number) {
      ctx!.globalAlpha = Math.max(0, Math.min(1, opacity))
      ctx!.fillStyle = e.color
      const wobble = Math.sin(e.driftPhase) * e.drift
      ctx!.beginPath()
      ctx!.arc(e.x + wobble, e.y, e.size, 0, Math.PI * 2)
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
          const max = doc.scrollHeight - doc.clientHeight
          scrollFraction =
            max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0
          ticking = false
        })
      }
      animatedResizeHandler = () => resize()
      window.addEventListener('scroll', scrollHandler, { passive: true })
      window.addEventListener('resize', animatedResizeHandler)
      scrollHandler()

      function frame() {
        const speed = lerp(SPEED_MIN, SPEED_MAX, scrollFraction)
        const target = Math.round(lerp(COUNT_MIN, ceiling, scrollFraction))

        while (embers.length < target) embers.push(spawn(true))
        if (embers.length > target) embers.length = target

        paintBackground(scrollFraction)

        for (const e of embers) {
          e.y -= e.rise * speed
          e.driftPhase += e.driftSpeed
          e.flickerPhase += e.flickerSpeed
          if (e.y < -10) {
            e.y = height + Math.random() * 40
            e.x = Math.random() * width
          }
          const flicker = 0.65 + 0.35 * Math.sin(e.flickerPhase)
          drawEmber(e, e.baseOpacity * flicker)
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
