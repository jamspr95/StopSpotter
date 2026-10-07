import { scoreNomination } from '../lib/scoring'
import { snapToPublicGrid } from '../lib/geo'
import type { Nomination, NominationAnswers, PayBand, Vote } from '../types'

/** Rough centre for demo purposes only — not a real AireStop target area. */
export const MAP_CENTRE = { lat: 52.486, lng: -1.8904 }

function makeAnswers(partial: Partial<NominationAnswers>): NominationAnswers {
  return {
    placeType: 'grass_field',
    ownerType: 'dont_know',
    nearestHouse: 'over_50m',
    slope: 'flat',
    roomForFive: 'yes',
    nearby: ['pub'],
    water: 'dont_know',
    ...partial,
  }
}

function seedNomination(
  id: string,
  offset: { lat: number; lng: number },
  whyHere: string,
  answers: NominationAnswers,
  payBand: Nomination['payBand'],
  status: Nomination['status'],
): Nomination {
  const exact = { lat: MAP_CENTRE.lat + offset.lat, lng: MAP_CENTRE.lng + offset.lng }
  return {
    id,
    userId: null,
    exact,
    public: snapToPublicGrid(exact),
    councilArea: 'Council area — to be confirmed (needs ONS boundary data, Milestone 2)',
    answers,
    whyHere,
    payBand,
    criteria: scoreNomination(answers),
    ownershipHint: 'Demo seed data',
    status,
    verified: true,
    source: 'user',
    createdAt: new Date('2026-09-20T09:00:00Z').toISOString(),
  }
}

export const seedNominations: Nomination[] = [
  seedNomination(
    'seed-1',
    { lat: 0.04, lng: 0.06 },
    'Flat field behind the pub, farmer said walkers already use the gate.',
    makeAnswers({ placeType: 'grass_field', nearby: ['pub', 'shop'], water: 'water_tap' }),
    'up_to_10',
    'live',
  ),
  seedNomination(
    'seed-2',
    { lat: -0.03, lng: 0.09 },
    'Old lay-by on the edge of the village, room for a few vans.',
    makeAnswers({ placeType: 'lay_by', nearby: ['none'], roomForFive: 'not_sure' }),
    'free_only',
    'under_review',
  ),
  seedNomination(
    'seed-3',
    { lat: 0.07, lng: -0.05 },
    'Council-owned car park that empties out after 6pm.',
    makeAnswers({ placeType: 'car_park', ownerType: 'council', nearby: ['town_centre', 'shop'] }),
    '10_15',
    'shortlisted',
  ),
  seedNomination(
    'seed-4',
    { lat: -0.06, lng: -0.04 },
    "Farmer's own paddock, right by the river trail.",
    makeAnswers({
      placeType: 'unused_land',
      ownerType: 'i_own_it',
      nearby: ['beach_or_trail'],
      water: 'both',
    }),
    '15_20',
    'submitted',
  ),
]

/** The demo "stops spotted" baseline already counts the markers above — see MapScreen's totalSpotted. */
export const SEED_TOTAL_SPOTTED = 412
export const SEED_NOMINATION_COUNT = seedNominations.length

function seedVote(id: string, nominationId: string, payBand: PayBand, daysAgo: number): Vote {
  return {
    id,
    userId: `seed-voter-${id}`,
    nominationId,
    payBand,
    verified: true,
    createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  }
}

/** A handful of pre-existing votes so the prototype's stop cards don't all read "0 votes". */
export const seedVotes: Vote[] = [
  seedVote('sv-1', 'seed-1', 'up_to_10', 6),
  seedVote('sv-2', 'seed-1', 'free_only', 5),
  seedVote('sv-3', 'seed-1', '10_15', 3),
  seedVote('sv-4', 'seed-3', '10_15', 4),
  seedVote('sv-5', 'seed-3', '15_20', 2),
  seedVote('sv-6', 'seed-4', '15_20', 1),
]
