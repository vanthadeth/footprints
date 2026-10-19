import { useIsWide } from '@/hooks/useIsDesktop'

/** A map's height: the phone's fixed height, or on desktop (lg) the space under the top bar and tabs, never under 480px. */
export function useMapHeight(phone: number): number | string {
  return useIsWide() ? 'max(480px, calc(100dvh - 18rem))' : phone
}
