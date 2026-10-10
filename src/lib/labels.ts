import type { NominationStatus } from '../types'

export const STATUS_LABEL: Record<NominationStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  live: 'Live',
  not_suitable: 'Not suitable',
}

export const STATUS_ORDER: NominationStatus[] = [
  'submitted',
  'under_review',
  'shortlisted',
  'live',
  'not_suitable',
]

export const SOURCE_LABEL: Record<'user' | 'site_finder' | 'both', string> = {
  user: 'Nominated',
  site_finder: 'Suggested by AireStop',
  both: 'Nominated + AireStop match',
}

/**
 * A source='site_finder' nomination has several form-specific answers as
 * null (supabase/migrations/0013_site_finder_integration.sql) — SiteFinder's
 * pipeline never asks a human question like "would you stay here?". Every
 * display spot that used to call `value.replace(/_/g, ' ')` directly on one
 * of those fields needs this instead, or a null crashes the screen.
 */
export function formatEnumLabel(value: string | null | undefined, fallback = 'Not answered'): string {
  return value ? value.replace(/_/g, ' ') : fallback
}
