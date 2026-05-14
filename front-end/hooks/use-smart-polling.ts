'use client'

import { useEffect, useRef } from 'react'

type SmartPollingOptions = {
  enabled?: boolean
  intervalMs: number
  maxRuns?: number
  poll: () => Promise<void> | void
  runOnFocus?: boolean
  runOnMount?: boolean
  runOnVisible?: boolean
  visibleOnly?: boolean
}

export function useSmartPolling({
  enabled = true,
  intervalMs,
  maxRuns,
  poll,
  runOnFocus = false,
  runOnMount = false,
  runOnVisible = true,
  visibleOnly = true,
}: SmartPollingOptions) {
  const pollRef = useRef(poll)
  const inFlightRef = useRef(false)

  useEffect(() => {
    pollRef.current = poll
  }, [poll])

  useEffect(() => {
    const maxAttempts = maxRuns === undefined ? undefined : Math.max(0, maxRuns)
    if (!enabled || intervalMs <= 0 || maxAttempts === 0 || typeof window === 'undefined') return

    let cancelled = false
    let stopped = false
    let attempts = 0
    let timer: number | null = null

    const clearTimer = () => {
      if (timer === null) return
      window.clearInterval(timer)
      timer = null
    }

    const canRun = () =>
      !cancelled &&
      !stopped &&
      (!visibleOnly || document.visibilityState === 'visible')

    const run = async () => {
      if (!canRun() || inFlightRef.current) return

      if (maxAttempts !== undefined && attempts >= maxAttempts) {
        stopped = true
        clearTimer()
        return
      }

      inFlightRef.current = true

      try {
        await pollRef.current()
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Polling request failed.', error)
        }
      } finally {
        attempts += 1
        inFlightRef.current = false

        if (maxAttempts !== undefined && attempts >= maxAttempts) {
          stopped = true
          clearTimer()
        }
      }
    }

    const startTimer = () => {
      if (stopped || timer !== null) return
      timer = window.setInterval(() => {
        void run()
      }, intervalMs)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (runOnVisible) {
          void run()
        }
        startTimer()
        return
      }

      if (visibleOnly) {
        clearTimer()
      }
    }

    const handleFocus = () => {
      if (runOnFocus) {
        void run()
      }
    }

    if (!visibleOnly || document.visibilityState === 'visible') {
      if (runOnMount) {
        void run()
      }
      startTimer()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      clearTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [enabled, intervalMs, maxRuns, runOnFocus, runOnMount, runOnVisible, visibleOnly])
}
