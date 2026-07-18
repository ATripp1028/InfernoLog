import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ReactNode } from 'react'

// Public acknowledgments page (route `/about`). Structure follows
// docs/ACKNOWLEDGMENTS_TEMPLATE.md. Entries the template still leaves as
// [PLACEHOLDER] are rendered through <Pending> so they read as visibly
// unfinished — they must be filled in (not invented) before launch.

function Pending({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[4px] bg-[var(--color-warning-dim)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-warning)]">
      PLACEHOLDER — {children}
    </span>
  )
}

function SectionLink({
  href,
  children,
}: {
  href: string | undefined
  children: ReactNode
}) {
  if (!href) {
    return <></>
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline"
    >
      {children}
    </a>
  )
}

function Section({
  title,
  intro,
  children,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {intro && (
        <p className="mt-2 text-sm italic leading-relaxed text-muted-foreground">
          {intro}
        </p>
      )}
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

function Entry({
  name,
  link,
  children,
}: {
  name: string
  link?: { label: string; href: string }
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="text-base font-medium text-foreground">{name}</h3>
      <p className="mt-1">{children}</p>
      <SectionLink href={link?.href}>{link?.label}</SectionLink>
    </div>
  )
}

export function AcknowledgmentsPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-foreground">
      <div className="mx-auto max-w-[720px] px-6 py-12">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to InfernoLog
        </Link>

        <h1 className="text-3xl font-semibold text-foreground">
          Acknowledgments
        </h1>

        {/* Hero */}
        <blockquote className="mt-6 border-l-2 border-primary pl-4 text-base italic leading-relaxed text-muted-foreground">
          “When I started logging my demon completions in a spreadsheet, I
          thought to myself, ‘man, there must be a better way to do this.’ I
          wasn't satisfied with the existing solutions, so I made my own.”
          <footer className="mt-2 text-sm not-italic text-foreground">
            — MrSp0rkMan (Alex)
          </footer>
        </blockquote>

        <Section
          title="Community Infrastructure"
          intro="These projects provide the APIs, data, and assets that power InfernoLog. None of them owe anyone their time or infrastructure — I'm grateful they exist, and InfernoLog wouldn't be possible without them."
        >
          <Entry
            name="Geometry Dash (RobTop Games)"
            link={{ label: 'robtopgames.com', href: 'https://robtopgames.com' }}
          >
            The official GD servers (boomlings.com) provide level metadata
            autofill — name, creator, song, difficulty, and more — for both
            rated and unrated levels.
          </Entry>
          <Entry
            name="GDBrowser"
            link={{ label: 'gdbrowser.com', href: 'https://gdbrowser.com' }}
          >
            Reference for how the community organizes GD's in-game sprite assets
            in web-friendly formats. While InfernoLog ultimately uses the
            official API for level metadata, GDBrowser was the inspiration for
            the level schema and data structure. Credit:{' '}
            <SectionLink href="https://gdcolon.com/">GDColon</SectionLink>
            .
          </Entry>
          <Entry name="GD Demon Ladder (GDDL)" link={{ label: 'gdladder.com', href: 'https://gdladder.com/' }}>
            Tier data autofill and optional record submission for rated demons.
            Credit: GDDL team / maintainers.
          </Entry>
          <Entry
            name="levelthumbs"
            link={{
              label: 'levelthumbs.prevter.me',
              href: 'https://levelthumbs.prevter.me',
            }}
          >
            Level thumbnail hosting used throughout the app. Credit: Prevter.
            License: Apache 2.0.
          </Entry>
          <Entry name="Song File Hub">
            NONG song database (v2). Credit: <Pending>Song File Hub team</Pending>
            . Link: songfilehub.com.
          </Entry>
          <Entry name="AREDL">
            Rank data for the All Rated Extreme Demons List. Credit:{' '}
            <Pending>AREDL maintainers</Pending>. Link:{' '}
            <Pending>AREDL URL</Pending>.
          </Entry>
          <Entry name="RobTop Games">
            Geometry Dash game assets used throughout the UI, including
            difficulty faces, portal sprites, and currency icons. Credit: Robert
            Topala (RobTop). Game assets are the property of RobTop Games.
            InfernoLog is an unofficial fan tool and is not affiliated with or
            endorsed by RobTop Games.
          </Entry>
        </Section>

        <Section
          title="Inspiration"
          intro="These community spreadsheets directly informed InfernoLog's feature set. Seeing what the community was already tracking — and how much care went into those sheets — made it clear that a proper tool was worth building."
        >
          <ul className="list-disc space-y-1 pl-6">
            <li><SectionLink href="https://docs.google.com/spreadsheets/d/1aGWCWgeoKXnaDhhg9k_P0Nqi5sKqRG3qPMTc75CLAGQ/edit?gid=1596056310#gid=1596056310">Technical's Extremes Log</SectionLink> (Inspiration for InfernoLog's ranking system)</li>
            <li><SectionLink href="https://docs.google.com/spreadsheets/d/14WoLCbAI0CJN0MrpPafY55rf8PVbq0zTiJ8_ne-293g/edit?gid=0#gid=0">Zeronium's Extreme Log</SectionLink> (Inspiration for data collected in logging)</li>
            <li><SectionLink href="https://docs.google.com/spreadsheets/d/1svB6vUigPyPwoYJ-AgaaBJWid3uR9P5BQEztWPXKzdU/edit?gid=1874848974#gid=1874848974">Sdslayer's Extreme Log</SectionLink> (Inspired decision to allow enjoyment to be included in ratings)</li>
            <li><SectionLink href="https://docs.google.com/spreadsheets/d/17u5h9qLrbxW0D8uqNQkPl4gKf0Iou3clFufzj8PtzP8/edit?gid=2091285025#gid=2091285025">Tride's Extreme Log</SectionLink> (Inspired decision to allow unrated levels)</li>
          </ul>
        </Section>

        {/* No Beta Testers Yet, will readd if I get any.
        <Section
          title="Beta Testers"
          intro="These players tested InfernoLog before it was ready and helped make it better. Their feedback shaped everything from the logging flow to the ranking system."
        >
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <Pending>beta tester handles — add as the beta progresses</Pending>
            </li>
          </ul>
        </Section> */}

        {/* No artists yet, will readd if I get any.
        <Section
          title="Community Artists"
          intro="These people contributed visual assets to InfernoLog."
        >
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <Pending>
                community artists who contributed icons, assets, or visual work
                (remove this section if none)
              </Pending>
            </li>
          </ul>
        </Section> */}

        <Section
          title="Open Source Libraries"
          intro="InfernoLog is built on these open source projects. Each of them represents enormous amounts of work by their contributors."
        >
          <p className="font-medium text-foreground">Frontend</p>
          <p>
            React, Vite, TanStack (Query, Table, Router, Form), Tailwind CSS,
            shadcn/ui, dnd-kit, Recharts, React Hook Form, Zod, date-fns,
            SheetJS, Lucide React.
          </p>
          <p className="font-medium text-foreground">Backend</p>
          <p>SST (Serverless Stack), Prisma, Node.js, Hono.</p>
          <p className="font-medium text-foreground">Infrastructure</p>
          <p>
            AWS (Lambda, API Gateway, S3, CloudFront, Cognito, EventBridge,
            Route 53, ACM, CloudWatch), Neon (PostgreSQL), Turborepo.
          </p>
          <p className="text-xs">
            <Pending>
              verify and list the exact license for each library before launch
            </Pending>
          </p>
        </Section>

        <Section title="A Note on InfernoLog">
          <p>
            InfernoLog is free to use and will remain free. It is not affiliated
            with RobTop Games, the GDDL, or any other community project listed
            here.
          </p>
          <p>
            The source code is available at{' '}
            <a
              href="https://github.com/infernolog/infernolog"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'underline' }}
            >
              GitHub
            </a>
            . Contributions, bug
            reports, and feature suggestions are welcome.
          </p>
        </Section>
      </div>
    </div>
  )
}
