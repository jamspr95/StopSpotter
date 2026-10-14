import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendParcelsToTiles, cellIdForPoint, cellIdsForRings, CELL_SIZE_DEG } from './titleTiles.mjs'

assert.equal(CELL_SIZE_DEG, 0.1)

// A point and its cell id must agree with where a ring containing that
// point gets filed — this is the one invariant the whole lookup depends
// on (the build script and the edge function must bucket the same point
// into the same cell id).
const exeterPoint = [-3.5339, 50.7184] // [lng, lat]
const exeterCellId = cellIdForPoint(exeterPoint[1], exeterPoint[0])
assert.equal(exeterCellId, `${Math.floor(50.7184 / 0.1)}_${Math.floor(-3.5339 / 0.1)}`)

// A small square ring entirely inside one cell should map to exactly that
// one cell.
const tinyRing = [
  [-3.54, 50.71],
  [-3.53, 50.71],
  [-3.53, 50.72],
  [-3.54, 50.72],
  [-3.54, 50.71],
]
const tinyCells = cellIdsForRings([tinyRing])
assert.deepEqual(tinyCells, [cellIdForPoint(50.715, -3.535)])

// A ring spanning two cells' worth of longitude must appear in both.
const wideRing = [
  [-3.65, 50.71],
  [-3.45, 50.71],
  [-3.45, 50.72],
  [-3.65, 50.72],
  [-3.65, 50.71],
]
const wideCells = cellIdsForRings([wideRing])
assert.ok(wideCells.length >= 2, `expected >=2 cells for a wide ring, got ${wideCells.length}`)

// appendParcelsToTiles: write once, then append a second parcel to the
// same cell and confirm both survive (no accidental overwrite), and that
// re-appending the SAME title_number replaces rather than duplicates it.
const outDir = await mkdtemp(join(tmpdir(), 'title-tiles-test-'))
try {
  await appendParcelsToTiles(outDir, 'england_wales', [
    { titleNumber: 'DN1', tenure: 'freehold', polygons: [tinyRing] },
  ])
  await appendParcelsToTiles(outDir, 'england_wales', [
    { titleNumber: 'DN2', tenure: 'freehold', polygons: [tinyRing] },
    // Re-send DN1 with a different tenure value — should replace, not duplicate.
    { titleNumber: 'DN1', tenure: 'leasehold', polygons: [tinyRing] },
  ])

  const cellId = cellIdForPoint(50.715, -3.535)
  const filePath = join(outDir, 'england_wales', `${cellId}.json`)
  const written = JSON.parse(await readFile(filePath, 'utf8'))

  assert.equal(written.features.length, 2, `expected exactly 2 features (DN1, DN2), got ${written.features.length}`)
  const dn1 = written.features.find((f) => f.properties.title_number === 'DN1')
  assert.equal(dn1.properties.tenure, 'leasehold', 'DN1 should have been replaced, not duplicated')
  assert.equal(dn1.geometry.type, 'MultiPolygon')
  assert.deepEqual(dn1.geometry.coordinates, [[tinyRing]])

  console.log('PASS: cell id math is consistent, and appendParcelsToTiles merges/replaces by title_number correctly.')
} finally {
  await rm(outDir, { recursive: true, force: true })
}
