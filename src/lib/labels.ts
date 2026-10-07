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
