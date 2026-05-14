'use client'

import { useEffect } from 'react'

const RELOAD_KEY = 'gerencia:last-chunk-reload'
const RELOAD_COOLDOWN_MS = 30_000

function readLastReload() {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY) || 0)
  } catch {
    return 0
  }
}

function writeLastReload(value: number) {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(value))
  } catch {
    // If storage is blocked, still allow a normal reload attempt.
  }
}

function getEventTargetUrl(target: EventTarget | null) {
  if (!target || !(target instanceof HTMLElement)) return ''

  if (target instanceof HTMLScriptElement) return target.src || ''
  if (target instanceof HTMLLinkElement) return target.href || ''

  return ''
}

function isChunkFailure(text: string, targetUrl = '') {
  const normalized = `${text} ${targetUrl}`.toLowerCase()

  return (
    normalized.includes('/_next/static/') ||
    normalized.includes('chunkloaderror') ||
    normalized.includes('loading chunk') ||
    normalized.includes('failed to fetch dynamically imported module') ||
    normalized.includes('dynamically imported module') ||
    normalized.includes('strict mime type') ||
    normalized.includes('mime type')
  )
}

function reloadWithFreshHtml(reason: string) {
  const now = Date.now()
  const lastReload = readLastReload()

  if (now - lastReload < RELOAD_COOLDOWN_MS) return

  writeLastReload(now)

  const url = new URL(window.location.href)
  url.searchParams.set('__fresh', String(now))
  url.searchParams.set('__reason', reason)
  window.location.replace(url.toString())
}

export function ChunkReloadGuard() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const targetUrl = getEventTargetUrl(event.target)
      const message = `${event.message || ''} ${event.error?.message || ''}`

      if (isChunkFailure(message, targetUrl)) {
        reloadWithFreshHtml('chunk-error')
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message =
        typeof reason === 'string'
          ? reason
          : `${reason?.message || ''} ${reason?.name || ''} ${reason?.stack || ''}`

      if (isChunkFailure(message)) {
        reloadWithFreshHtml('chunk-rejection')
      }
    }

    window.addEventListener('error', handleError, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
