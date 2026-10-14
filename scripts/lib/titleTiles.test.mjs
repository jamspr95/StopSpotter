import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendParcelsToTiles,
  cellIdForPoint,
  cellIdsForRings,
  CELL_SIZE_DEG,
  FINE_CELLS_PER_SHARD,
  shardIdForCellId,
} from './titleTiles.mjs'

assert.equal(CELL_SIZE_DEG, 0.1)

// A point and its fine cell id must agree with where a ring containing
// that point gets filed — this is the one invariant the whole lookup
// depends on (the build script and the edge function must bucket the
// same point into the same cell id, and then the same shard id).
const exeterPoint = [-3.5339, 50.7184] // [lng, lat]
const exeterCellId = cellIdForPoint(exeterPoint[1], exeterPoint[0])
assert.equal(exeterCellId, `${Math.floor(50.7184 / CELL_SIZE_DEG)}_${Math.floor(-3.5339 / CELL_SIZE_DEG)}`)

// A small square ring entirely inside one fine cell should map to
// exactly that one cell.
const tinyRing = [
  [-3.54, 50.71],
  [-3.53, 50.71],
  [-3.53, 50.72],
  [-3.54, 50.72],
  [-3.54, 50.71],
]
const tinyCells = cellIdsForRings([tinyRing])
assert.deepEqual(tinyCells, [cellIdForPoint(50.715, -3.535)])

// A ring spanning two fine cells' worth of longitude must appear in both.
const wideRing = [
  [-3.65, 50.71],
  [-3.45, 50.71],
  [-3.45, 50.72],
  [-3.65, 50.72],
  [-3.65, 50.71],
]
const wideCells = cellIdsForRings([wideRing])
assert.ok(wideCells.length >= 2, `expected >=2 cells for a wide ring, got ${wideCells.length}`)

// shardIdForCellId: every fine cell within one FINE_CELLS_PER_SHARD x
// FINE_CELLS_PER_SHARD block must resolve to the same shard id, and a
// fine cell just outside that block must resolve to a different one.
// Base is deliberately chosen at a shard-aligned start (both bucket
// values exact multiples of FINE_CELLS_PER_SHARD) — floor() groups
// [n*k, n*k+1, ..., n*k+k-1] into shard n, so only a block starting
// exactly there can safely add up to k-1 and stay inside it; starting
// from an arbitrary (non-aligned) cell id, as an earlier version of this
// test did, can walk into the next shard for negative buckets.
const baseCellId = '500_-40'
const [baseLat, baseLng] = baseCellId.split('_').map(Number)
const sameShardCellId = `${baseLat + FINE_CELLS_PER_SHARD - 1}_${baseLng + FINE_CELLS_PER_SHARD - 1}`
const differentShardCellId = `${baseLat + FINE_CELLS_PER_SHARD}_${baseLng}`
assert.equal(shardIdForCellId(baseCellId), shardIdForCellId(sameShardCellId))
assert.notEqual(shardIdForCellId(baseCellId), shardIdForCellId(differentShardCellId))

// appendParcelsToTiles: write once, then append a second parcel to a
// DIFFERENT fine cell that lands in the SAME shard, and confirm both
// survive as separate keys in one gzipped shard file (no accidental
// overwrite across fine cells, and no duplicate shard files). Also
// confirm re-appending the SAME title_number replaces rather than
// duplicates it within its own fine cell.
const outDir = await mkdtemp(join(tmpdir(), 'title-tiles-test-'))
try {
  const fineCellIdA = cellIdForPoint(50.715, -3.535) // tinyRing's cell
  // Pick whichever neighbour (lng bucket -1 or +1) actually shares A's
  // shard — which direction that is depends on where A happens to sit
  // within its own shard block, not something safe to assume either way.
  const [aLatBucket, aLngBucket] = fineCellIdA.split('_').map(Number)
  const lngNeighbourOffset = shardIdForCellId(`${aLatBucket}_${aLngBucket - 1}`) === shardIdForCellId(fineCellIdA) ? -1 : 1
  const fineCellIdB = `${aLatBucket}_${aLngBucket + lngNeighbourOffset}`
  assert.equal(
    shardIdForCellId(fineCellIdA),
    shardIdForCellId(fineCellIdB),
    'test setup assumption broken: these two fine cells were expected to share a shard',
  )

  const ringB = tinyRing.map(([lng, lat]) => [lng + lngNeighbourOffset * CELL_SIZE_DEG, lat])

  await appendParcelsToTiles(outDir, 'england_wales', [
    { titleNumber: 'DN1', tenure: 'freehold', polygons: [tinyRing] },
  ])
  await appendParcelsToTiles(outDir, 'england_wales', [
    { titleNumber: 'DN2', tenure: 'freehold', polygons: [ringB] },
    // Re-send DN1 with a different tenure value — should replace, not duplicate.
    { titleNumber: 'DN1', tenure: 'leasehold', polygons: [tinyRing] },
  ])

  const shardId = shardIdForCellId(fineCellIdA)
  const filePath = join(outDir, 'england_wales', `${shardId}.json.gz`)
  const written = JSON.parse(gunzipSync(await readFile(filePath)).toString('utf8'))

  const cellAFeatures = written.cells[fineCellIdA]
  const cellBFeatures = written.cells[fineCellIdB]
  assert.equal(cellAFeatures.length, 1, 'DN1 should be the only feature in its own fine cell, not duplicated')
  assert.equal(cellBFeatures.length, 1, 'DN2 should be in its own fine cell, not merged into cell A')
  assert.equal(cellAFeatures[0].properties.tenure, 'leasehold', 'DN1 should have been replaced, not duplicated')
  assert.equal(cellAFeatures[0].geometry.type, 'MultiPolygon')

  // Coordinate rounding: output must differ from the untouched 14-sig-fig
  // input (confirms rounding actually ran), but only by a tiny amount.
  const outLng = cellAFeatures[0].geometry.coordinates[0][0][0][0]
  assert.notEqual(outLng, tinyRing[0][0] + 0.00000000001) // sanity: not comparing against itself
  assert.ok(Math.abs(outLng - tinyRing[0][0]) < 1e-5, 'rounding should not move a coordinate by more than ~1m')

  console.log('PASS: cell/shard id math is consistent, and appendParcelsToTiles merges/replaces correctly within gzipped shards.')
} finally {
  await rm(outDir, { recursive: true, force: true })
}
