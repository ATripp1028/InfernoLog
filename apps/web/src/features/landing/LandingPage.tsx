import { Link, useNavigate } from '@tanstack/react-router'
import { ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { EmberBackground } from './EmberBackground'

// Unauthenticated marketing landing page (route `/`). Layout, copy, and image
// placement mirror the Figma "Landing — Desktop 1440" / "Landing — Mobile 390"
// frames. Screenshots are the real product captures committed under
// public/assets/infernolog/{desktop,mobile}/ (see docs/IMAGE_SOURCES.md).

const ASSETS = '/assets/infernolog'

function LandingHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[28px] font-bold leading-tight text-[#f5f5f5] md:text-[34px]">
      {children}
    </h2>
  )
}

function LandingBody({ children }: { children: ReactNode }) {
  return (
    <p className="text-[16px] leading-[1.55] text-[#a3a3a3] md:text-[18px]">
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
      className={`flex w-full flex-col gap-4 pt-3 sm:w-auto sm:flex-row ${
        align === 'center'
          ? 'items-stretch sm:items-center sm:justify-center'
          : 'items-stretch sm:items-start'
      }`}
    >
      <button
        type="button"
        onClick={() => navigate({ to: '/age-gate' })}
        className="rounded-md bg-[#e8390e] px-7 py-3 text-base font-semibold text-[#f5f5f5] transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        Sign up
      </button>
      <button
        type="button"
        onClick={signIn}
        className="rounded-md border border-[#333] px-7 py-3 text-base font-semibold text-[#a3a3a3] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[#f5f5f5]"
      >
        Sign in
      </button>
    </div>
  )
}

// Portrait screenshots are scaled down whole (no cropping) and capped so the
// heading + body + image fit together on mobile — a deliberate call to preserve
// the copy↔image pairing over image detail. See the landing prompt / Figma.
const portraitShot =
  'mx-auto max-h-[450px] w-auto rounded-lg lg:max-h-none lg:w-full'

export function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[#0d0d0d] text-[#f5f5f5]">
      <EmberBackground />

      <div className="relative z-10 mx-auto max-w-[1440px]">
        {/* Hero */}
        <section className="flex flex-col items-center justify-center gap-5 px-6 py-24 text-center md:px-20 lg:py-[120px]">
          <h1 className="text-[40px] font-bold text-[#f5f5f5] md:text-[56px]">
            InfernoLog
          </h1>
          <p className="max-w-[560px] text-[18px] text-[#a3a3a3] md:text-[20px]">
            Track your demon progress, one completion at a time.
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
              Not a form. A moment. Enter a level, and InfernoLog pulls the
              name, creator, song, and difficulty automatically — then gets out
              of your way so you can rate it, score the enjoyment, and log how
              hard it really was, your way.
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
              not the journey to get there. InfernoLog remembers the whole climb
              — every logged percentage, every run, every drop — so your history
              actually looks like what happened.
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

        {/* Section 3 — The List (full-width, centered copy above image) */}
        <section className="flex flex-col items-center gap-10 px-6 py-16 text-center md:px-16 lg:p-[100px]">
          <div className="flex max-w-[720px] flex-col gap-4">
            <LandingHeading>Your whole log, sorted your way</LandingHeading>
            <LandingBody>
              Every demon you've touched, in one place. Sort by rating, tier,
              date, attempts — whatever tells the story you want to see.
            </LandingBody>
          </div>
          <picture className="w-full">
            <source
              media="(max-width: 767px)"
              srcSet={`${ASSETS}/mobile/list-page.png`}
            />
            <img
              src={`${ASSETS}/desktop/list-page.png`}
              alt="The List page showing tracked demons"
              className="mx-auto max-h-[450px] w-auto rounded-lg md:max-h-none md:w-full"
            />
          </picture>
        </section>

        {/* Section 4 — The Ranking (full-width, centered copy above image) */}
        <section className="flex flex-col items-center gap-10 px-6 py-16 text-center md:px-16 lg:p-[100px]">
          <div className="flex max-w-[720px] flex-col gap-4">
            <LandingHeading>
              Rank them the way you actually feel about them
            </LandingHeading>
            <LandingBody>
              Official lists disagree with you sometimes. That's fine — drag and
              drop your own personal difficulty order, independent of any
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
              alt="The Ranking page with the Unplaced panel visible"
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
          <div className="w-full max-w-[640px] overflow-hidden rounded-lg border border-[#333]">
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
          <h2 className="text-[32px] font-bold text-[#f5f5f5] md:text-[40px]">
            Your log starts here
          </h2>
          <p className="text-[16px] text-[#a3a3a3] md:text-[18px]">
            Bring your history or start fresh. Either way, it's free.
          </p>
          <CtaRow align="center" />
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[#a3a3a3]">
            <Link to="/" className="hover:text-[#f5f5f5]">
              Home
            </Link>
            <Link to="/about" className="hover:text-[#f5f5f5]">
              Acknowledgments
            </Link>
            <Link to="/terms" className="hover:text-[#f5f5f5]">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-[#f5f5f5]">
              Privacy
            </Link>
            <Link to="/dmca" className="hover:text-[#f5f5f5]">
              DMCA
            </Link>
          </nav>
          <p className="max-w-[652px] text-xs text-[#666666]">
            Site made by MrSp0rkMan (Alex). InfernoLog is an unofficial fan
            project, not affiliated with RobTop Games.
          </p>
        </footer>
      </div>
    </div>
  )
}
