import type { CriteriaResult, NominationAnswers } from '../types'

/**
 * Criteria scoring from docs/BUILD_PLAN.md "Nomination form (8 questions +
 * scoring)". A "fails" answer still saves the site (flagged, not rejected) —
 * nominators may be wrong about ground conditions from a phone photo.
 */
export function scoreNomination(answers: NominationAnswers): CriteriaResult {
  let score = 0
  const flags: string[] = []

  switch (answers.placeType) {
    case 'unused_land':
    case 'grass_field':
      score += 2
      break
    case 'car_park':
      score -= 2
      flags.push('Car park — often blocked by parking services')
      break
    default:
      break
  }

  if (answers.ownerType === 'i_own_it') {
    flags.push('Priority lead — nominator says they own the land')
  }

  switch (answers.nearestHouse) {
    case 'under_20m':
      flags.push('Fails: under 20m from the nearest house')
      break
    case 'over_50m':
      score += 1
      break
    default:
      break
  }

  switch (answers.slope) {
    case 'flat':
      score += 1
      break
    case 'steep':
      flags.push('Fails: ground is steep (over ~5% slope)')
      break
    default:
      break
  }

  if (answers.roomForFive === 'no') {
    flags.push('Fails: not enough room for five motorhomes')
  }

  const nearbyCount = answers.nearby.filter((item) => item !== 'none').length
  score += Math.min(nearbyCount, 3)

  switch (answers.water) {
    case 'both':
      score += 2
      break
    case 'toilet_block':
    case 'water_tap':
      score += 1
      break
    default:
      break
  }

  return { score, flags }
}
