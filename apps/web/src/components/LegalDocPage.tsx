import Markdown from 'react-markdown'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

// Shared renderer for the standalone legal documents (/terms, /privacy, /dmca).
// Single-column, capped line width, no app chrome — just the document and a way
// back to the landing page. Source markdown lives in /legal/*.md.
export function LegalDocPage({
  title,
  content,
}: {
  title: string
  content: string
}) {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-foreground">
      <div className="mx-auto max-w-[680px] px-6 py-12">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to InfernoLog
        </Link>

        <h1 className="mb-6 text-3xl font-semibold text-foreground">{title}</h1>

        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-4 [&_h3]:font-medium [&_h3]:text-foreground [&_hr]:my-6 [&_hr]:border-[var(--color-border)] [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-6">
          <Markdown>{content}</Markdown>
        </div>
      </div>
    </div>
  )
}
