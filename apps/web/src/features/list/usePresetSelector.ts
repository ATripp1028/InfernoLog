// Logic for PresetSelector: dropdown + inline-delete-confirm state, the
// hover-card timing (a short grace period so moving the pointer between rows
// doesn't flicker the card), and the writers that wrap the callbacks the
// toolbar passes in.

import { useCallback, useEffect, useRef, useState } from 'react'
import { getPresetColor } from './presets'
import type { ListPreset } from '@/lib/api/presets'

export function usePresetSelector({
  presets,
  selectedPresetId,
  deletingPresetId,
  overwritingPresetIds,
  onSelect,
  onOverwrite,
  onDelete,
  onEdit,
}: {
  presets: ListPreset[]
  selectedPresetId: string | null
  deletingPresetId: string | null
  overwritingPresetIds: string[]
  onSelect: (id: string | null) => void
  onOverwrite: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (preset: ListPreset) => void
}) {
  const isOverwriting =
    selectedPresetId != null && overwritingPresetIds.includes(selectedPresetId)
  const [open, setOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // Hover card state
  const [hoveredId, setHoveredId] = useState<string | 'default' | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  // Track when a deletion is in-flight so we can auto-close when it finishes.
  const pendingDeleteRef = useRef<string | null>(null)

  const scheduleHide = useCallback(() => {
    hideTimeout.current = setTimeout(() => {
      setHoveredId(null)
      setHoverRect(null)
    }, 120)
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current)
  }, [])

  function handleOptionEnter(e: React.MouseEvent, id: string | 'default') {
    cancelHide()
    setHoveredId(id)
    setHoverRect((e.currentTarget as HTMLElement).getBoundingClientRect())
  }

  function handleOptionLeave() {
    scheduleHide()
  }

  // When deletingPresetId transitions from non-null → null, close the dropdown.
  useEffect(() => {
    if (!deletingPresetId && pendingDeleteRef.current) {
      pendingDeleteRef.current = null
      setPendingDeleteId(null)
      setOpen(false)
    }
  }, [deletingPresetId])

  // Clear hover on close.
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      cancelHide()
      setHoveredId(null)
      setHoverRect(null)
      if (!deletingPresetId) setPendingDeleteId(null)
    }
  }

  const selectedPreset = presets.find((p) => p.id === selectedPresetId)
  const triggerLabel = selectedPreset?.name ?? 'Default'
  const triggerColor = selectedPreset
    ? getPresetColor(selectedPreset.color)
    : null

  function handleSelect(id: string | null) {
    onSelect(id)
    setOpen(false)
    setPendingDeleteId(null)
  }

  function handleOverwrite() {
    if (selectedPresetId) {
      onOverwrite(selectedPresetId)
      setOpen(false)
    }
  }

  function handleDeleteClick(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setPendingDeleteId(id)
    setHoveredId(null)
  }

  function handleEditClick(preset: ListPreset, e: React.MouseEvent) {
    e.stopPropagation()
    setOpen(false)
    onEdit(preset)
  }

  function handleConfirmDelete(id: string) {
    pendingDeleteRef.current = id
    onDelete(id)
    // Dropdown stays open; useEffect closes it when deletion finishes.
  }

  const hoveredPreset =
    hoveredId && hoveredId !== 'default'
      ? presets.find((p) => p.id === hoveredId)
      : null

  return {
    open,
    handleOpenChange,
    isOverwriting,

    // Trigger
    selectedPreset,
    triggerLabel,
    triggerColor,

    // Rows
    handleSelect,
    handleOverwrite,
    handleEditClick,

    // Inline delete confirm
    pendingDeleteId,
    handleDeleteClick,
    handleConfirmDelete,
    cancelDelete: () => setPendingDeleteId(null),
    close: () => setOpen(false),

    // Hover card
    hoveredId,
    hoveredPreset,
    hoverRect,
    handleOptionEnter,
    handleOptionLeave,
    cancelHide,
    scheduleHide,
  }
}
