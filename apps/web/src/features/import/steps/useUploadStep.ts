// Logic for UploadStep: parsing the chosen .xlsx into the wizard's
// ParseResult, and the drag-and-drop bookkeeping around the drop zone.

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseSpreadsheet } from '../parseSpreadsheet'
import { useImportFlow } from '../ImportFlowProvider'

export function useUploadStep() {
  const { dateFormat, setDateFormat, handleParsed: onParsed } = useImportFlow()
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  // dragenter/dragleave fire on every child the pointer crosses (per the
  // HTML5 DnD spec), not just when the pointer enters/exits the label as a
  // whole — count nesting depth instead of toggling on every event so the
  // highlight doesn't flicker while dragging across the label's own children.
  const dragDepth = useRef(0)

  // The drop zone handles its own dragover/drop, but a drop anywhere else on
  // the page (e.g. a few pixels outside the dashed box) would otherwise fall
  // through to the browser's default "navigate to file" behavior, discarding
  // the whole app session. Swallow it at the window level for as long as this
  // step is mounted.
  useEffect(() => {
    const preventDefault = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', preventDefault)
    return () => {
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setParsing(true)
      try {
        const buffer = await file.arrayBuffer()
        const result = parseSpreadsheet(buffer, dateFormat)

        onParsed(result, {
          completions: result.completions.flatMap((r) => r.flags),
          progress: result.progress.flatMap((r) => r.flags),
          dropped: result.dropped.flatMap((r) => r.flags),
          ranking: result.ranking.flatMap((r) => r.flags),
          lists: result.lists.flatMap((r) => r.flags),
          ratings: result.ratings.flatMap((r) => r.flags),
          duplicates: result.duplicateLevelIds,
        })
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to parse spreadsheet'
        )
      } finally {
        setParsing(false)
      }
    },
    [dateFormat, onParsed]
  )

  // Drop-zone handlers. Every one preventDefaults first — without it the
  // browser navigates away to the dropped file.
  const dropZone = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current += 1
      if (!parsing) setIsDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setIsDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setIsDragging(false)
      if (parsing) return
      const f = e.dataTransfer.files?.[0]
      if (f) void handleFile(f)
    },
  }

  return {
    dateFormat,
    setDateFormat,
    error,
    parsing,
    isDragging,
    dropZone,
    handleFile,
  }
}
