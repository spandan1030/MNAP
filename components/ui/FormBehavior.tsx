'use client'
import { useEffect } from 'react'

export function FormBehavior() {
  useEffect(() => {
    function onWheel() {
      if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
        document.activeElement.blur()
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return
      const target = e.target as HTMLElement
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
      if ((target as HTMLInputElement).type === 'submit') return
      e.preventDefault()
      const focusable = Array.from(document.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]):not([type="submit"]), select:not([disabled]), textarea:not([disabled]), button[type="submit"]:not([disabled])'
      ))
      const idx = focusable.indexOf(target)
      if (idx >= 0 && idx < focusable.length - 1) focusable[idx + 1].focus()
    }

    document.addEventListener('wheel', onWheel, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
  return null
}
