'use client'

import { useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function useBackgroundRefresh() {
  const router = useRouter()
  const [isRefreshPending, startRefreshTransition] = useTransition()

  const refreshInBackground = useCallback(() => {
    startRefreshTransition(() => {
      router.refresh()
    })
  }, [router, startRefreshTransition])

  return {
    isRefreshPending,
    refreshInBackground,
  }
}
