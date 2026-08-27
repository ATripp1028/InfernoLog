import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/generic/button'
import { cn } from '@/lib/utils'
import { backOriginState } from '@/lib/backOrigin'
import { EmberBackground } from './EmberBackground'

// Unauthenticated marketing landing page (route `/`). Layout, copy, and image
// placement mirror the Figma "Landing — Desktop 1440" / "Landing — Mobile 390"
// frames. Screenshots are the real product captures committed under
// public/assets/infernolog/{desktop,mobile}/ (see docs/IMAGE_SOURCES.md).

const ASSETS = '/assets/infernolog'

function LandingHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[28px] font-bold leading-tight text-foreground md:text-[34px]">
      {children}
    </h2>
  )
}

function LandingBody({ children }: { children: ReactNode }) {
  return (
    <p className="text-[16px] leading-[1.55] text-muted-foreground md:text-[18px]">
      {children}
    </p>
  )
}

// Sign up and Sign in are deliberately separate entry points (COPPA — the age
// gate must precede OAuth for new accounts). Sign up → /age-gate → OAuth →
// onboarding; Sign in → OAuth → List. See docs/AUTH.md.
function CtaRow({ align = 'start' }: { align?: 'start' | 'center' }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4 pt-3 sm:w-auto sm:flex-row',
        align === 'center'
          ? 'items-stretch sm:items-center sm:justify-center'
          : 'items-stretch sm:items-start'
      )}
    >
      <Button
        size="lg"
        onClick={() => navigate({ to: '/age-gate' })}
        className="h-auto rounded-md px-7 py-3 text-base"
      >
        Sign up
      </Button>
      <Button
        variant="outline"
        size="lg"
        onClick={signIn}
        className="h-auto rounded-md px-7 py-3 text-base"
      >
        Sign in
      </Button>
    </div>
  )
}

// Portrait screenshots are scaled down whole (no cropping) and capped so the
// heading + body + image fit together on mobile — a deliberate call to preserve
// the copy↔image pairing over image detail. See the landing prompt / Figma.
const portraitShot =
  'mx-auto max-h-[450px] w-auto rounded-lg lg:max-h-none lg:w-full'

/**
 * The signed-out marketing page and its sign-in / sign-up entry points.
 */
export function LandingPage() {
  const location = useLocation()
  return (
    <div className="relative min-h-screen bg-bg-base text-foreground">
      <EmberBackground />

      <div className="relative z-10 mx-auto max-w-[1440px]">
        {/* Hero */}
        <section className="flex flex-col items-center justify-center gap-5 px-6 py-24 text-center md:px-20 lg:py-[120px]">
          <h1 className="text-[40px] font-bold text-foreground md:text-[56px]">
            InfernoLog
          </h1>
          <p className="max-w-[560px] text-[18px] text-muted-foreground md:text-[20px]">
            Own your demon log in a way a spreadsheet can't provide.
          </p>
          <CtaRow align="center" />
        </section>

        {/* Section 1 — Logging flow (copy left, image right) */}
        <section className="flex flex-col items-center gap-10 px-6 py-16 md:px-16 lg:flex-row lg:gap-16 lg:p-[100px]">
          <div className="flex flex-1 flex-col gap-4">
            <LandingHeading>
              Log a completion the way it actually felt
            </LandingHeading>
            <LandingBody>
              Enter a level, and InfernoLog pulls the name, creator, song, and
              difficulty automatically - allowing you to focus on the details
              that matter: your rating, attempts, and the date you beat it while
              still retaining metadata to allow for sorting and filtering.
            </LandingBody>
          </div>
          <div className="w-full shrink-0 lg:w-[600px]">
            <img
              src={`${ASSETS}/desktop/completion-logging-modal.png`}
              alt="The completion logging modal, with level metadata filled in automatically"
              className="w-full rounded-lg"
            />
          </div>
        </section>

        {/* Section 2 — Progress (image left, copy right) */}
        <section className="flex flex-col items-center gap-10 px-6 py-16 md:px-16 lg:flex-row-reverse lg:gap-16 lg:p-[100px]">
          <div className="flex flex-1 flex-col gap-4">
            <LandingHeading>Every attempt is part of the record</LandingHeading>
            <LandingBody>
              Your spreadsheet probably remembers the day you beat a level, but
              not the journey to get there. InfernoLog lets you track every part
              of the journey.
            </LandingBody>
          </div>
          <div className="w-full shrink-0 lg:w-[307px]">
            <img
              src={`${ASSETS}/desktop/progress-timeline.png`}
              alt="A progress timeline showing logged attempts and runs over time"
              className={portraitShot}
            />
          </div>
        </section>

        {/* Section 3 — The Log (full-width, centered copy above image) */}
        <section className="flex flex-col items-center gap-10 px-6 py-16 text-center md:px-16 lg:p-[100px]">
          <div className="flex max-w-[720px] flex-col gap-4">
            <LandingHeading>Your whole log, sorted your way</LandingHeading>
            <LandingBody>
              All your demons in one place, sortable and filterable by any of
              the metadata you care about without wrestling with spreadsheet
              formulas and semantics. Furthermore, you can save these
              configurations as presets to quickly switch between different
              views of your log.
            </LandingBody>
          </div>
          <picture className="w-full">
            <source
              media="(max-width: 767px)"
              srcSet={`${ASSETS}/mobile/list-page.png`}
            />
            <img
              src={`${ASSETS}/desktop/list-page.png`}
              alt="The Log page showing tracked demons"
              className="mx-auto max-h-[450px] w-auto rounded-lg md:max-h-none md:w-full"
            />
          </picture>
        </section>

        {/* Section 4 — The demon list (full-width, centered copy above image) */}
        <section className="flex flex-col items-center gap-10 px-6 py-16 text-center md:px-16 lg:p-[100px]">
          <div className="flex max-w-[720px] flex-col gap-4">
            <LandingHeading>
              Rank them the way you actually feel about them
            </LandingHeading>
            <LandingBody>
              Difficulty is, to an extent, subjective. InfernoLog lets you drag
              and drop your own personal difficulty order, independent of any
              community list.
            </LandingBody>
          </div>
          <picture className="w-full">
            <source
              media="(max-width: 767px)"
              srcSet={`${ASSETS}/mobile/ranking-page.png`}
            />
            <img
              src={`${ASSETS}/desktop/ranking-page.png`}
              alt="The demon list page with the Unplaced panel visible"
              className="mx-auto max-h-[450px] w-auto rounded-lg md:max-h-none md:w-full"
            />
          </picture>
        </section>

        {/* Section 5 — Import (copy left, image right) */}
        <section className="flex flex-col items-center gap-10 px-6 py-16 md:px-16 lg:flex-row lg:gap-16 lg:p-[100px]">
          <div className="flex flex-1 flex-col gap-4">
            <LandingHeading>
              Bring your spreadsheet. Keep every row.
            </LandingHeading>
            <LandingBody>
              Years of history in a spreadsheet? Import it directly — InfernoLog
              shows you exactly what's coming in and lets you decide what
              happens to anything that conflicts, before a single row is
              committed.
            </LandingBody>
          </div>
          <div className="w-full shrink-0 lg:w-[299px]">
            <img
              src={`${ASSETS}/desktop/import-conflict.png`}
              alt="The import review screen showing rows ready to commit and conflicts to resolve"
              className={portraitShot}
            />
          </div>
        </section>

        {/* Section 6 — Privacy (centered copy above bordered detail card) */}
        <section className="flex flex-col items-center gap-8 px-6 py-16 text-center md:px-16 lg:p-[100px]">
          <div className="flex max-w-[680px] flex-col gap-3">
            <LandingHeading>Your record, on your terms</LandingHeading>
            <LandingBody>
              Verified a level but holding the video for later? Hide that one
              completion without hiding your whole profile. Every entry has its
              own privacy toggle.
            </LandingBody>
          </div>
          <div className="w-full max-w-[640px] overflow-hidden rounded-lg border border-border">
            <picture>
              <source
                media="(max-width: 767px)"
                srcSet={`${ASSETS}/mobile/privacy-toggle.png`}
              />
              <img
                src={`${ASSETS}/desktop/completion-privacy.png`}
                alt="A per-completion privacy toggle"
                className="w-full"
              />
            </picture>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="flex flex-col items-center gap-4 px-6 py-20 text-center md:px-16">
          <h2 className="text-[32px] font-bold text-foreground md:text-[40px]">
            Your log starts here
          </h2>
          <p className="text-[16px] text-muted-foreground md:text-[18px]">
            Bring your history or start fresh. Either way, it's free.
          </p>
          <CtaRow align="center" />
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
            <Link
              to="/about"
              state={backOriginState(location.href)}
              className="hover:text-foreground"
            >
              Acknowledgments
            </Link>
            <Link
              to="/terms"
              state={backOriginState(location.href)}
              className="hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              state={backOriginState(location.href)}
              className="hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              to="/dmca"
              state={backOriginState(location.href)}
              className="hover:text-foreground"
            >
              DMCA
            </Link>
          </nav>
          <p className="max-w-[652px] text-xs text-text-tertiary">
            Site made by MrSp0rkMan (Alex). InfernoLog is an unofficial fan
            project, not affiliated with RobTop Games.
          </p>
        </footer>
      </div>
    </div>
  )
}
