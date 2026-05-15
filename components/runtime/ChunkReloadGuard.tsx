'use client'

import { useEffect } from 'react'

const RELOAD_KEY = 'gerencia:last-chunk-reload'
const RELOAD_COOLDOWN_MS = 45_000

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
    normalized.includes('loading css chunk') ||
    normalized.includes('css_chunk_load_failed') ||
    normalized.includes('failed to fetch dynamically imported module') ||
    normalized.includes('dynamically imported module') ||
    normalized.includes('importing a module script failed') ||
    normalized.includes('module script') ||
    normalized.includes('networkerror when attempting to fetch resource') ||
    normalized.includes('strict mime type') ||
    normalized.includes('mime type')
  )
}

async function clearBrowserRuntimeState() {
  const jobs: Array<Promise<unknown>> = []

  if ('caches' in window) {
    jobs.push(
      window.caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key)))),
    )
  }

  if ('serviceWorker' in navigator) {
    jobs.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))),
    )
  }

  await Promise.allSettled(jobs)
}

function removeRecoveryQueryParams() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('__fresh') && !url.searchParams.has('__reason')) return
    url.searchParams.delete('__fresh')
    url.searchParams.delete('__reason')
    window.history.replaceState(window.history.state, '', url.toString())
  } catch {
    // Query cleanup is best-effort only.
  }
}

async function reloadWithFreshHtml(reason: string) {
  const now = Date.now()
  const lastReload = readLastReload()

  if (now - lastReload < RELOAD_COOLDOWN_MS) return

  writeLastReload(now)
  await clearBrowserRuntimeState().catch(() => undefined)

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
        void reloadWithFreshHtml('chunk-error')
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message =
        typeof reason === 'string'
          ? reason
          : `${reason?.message || ''} ${reason?.name || ''} ${reason?.stack || ''}`

      if (isChunkFailure(message)) {
        event.preventDefault()
        void reloadWithFreshHtml('chunk-rejection')
      }
    }

    removeRecoveryQueryParams()
    window.addEventListener('error', handleError, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
