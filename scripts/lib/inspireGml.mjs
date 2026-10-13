// Shared INSPIRE Cadastral Parcels GML parsing, used by both the
// England/Wales (HMLR) and Scotland (Registers of Scotland) sync scripts.
// Both datasets are published under the same EU INSPIRE Cadastral Parcels
// schema, so the extraction logic is identical — only how each script
// discovers its list of per-area GML downloads differs.

import { gunzipSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'
import { unzipSync } from 'fflate'
import { bngToWgs84 } from './bngToWgs84.mjs'

/** A manually-downloaded file might be gzipped (common for INSPIRE Atom links) or plain — detect by magic bytes, not the file extension, and decompress either way. */
export function decompressIfGzip(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer).toString('utf8')
  }
  return buffer.toString('utf8')
}

function isZip(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04
}

const GML_ENTRY_EXTENSIONS = ['.gml', '.xml']

/**
 * A downloaded file's bytes might be a .zip (confirmed: HMLR's England/
 * Wales download links are .zip archives containing one .gml each, not
 * raw .gml as originally assumed — see this repo's git history), gzip, or
 * plain GML text. Detects by magic bytes, not the file extension or
 * Content-Type, and returns every GML-ish text found inside — more than
 * one for a zip with multiple entries, exactly one otherwise.
 */
export function extractGmlTexts(buffer) {
  if (isZip(buffer)) {
    const entries = unzipSync(buffer)
    const gmlEntries = Object.entries(entries).filter(([name]) =>
      GML_ENTRY_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)),
    )
    if (gmlEntries.length === 0) {
      throw new Error(
        `Zip archive had no .gml/.xml entry — found: ${Object.keys(entries).join(', ') || '(empty archive)'}.`,
      )
    }
    return gmlEntries.map(([, data]) => Buffer.from(data).toString('utf8'))
  }
  return [decompressIfGzip(buffer)]
}

/** Recursively finds every object in a parsed-XML tree whose tag name (ignoring a namespace prefix) matches `localName`. */
export function findByLocalName(node, localName, results = []) {
  if (node == null || typeof node !== 'object') return results
  for (const [key, value] of Object.entries(node)) {
    const bareName = key.includes(':') ? key.split(':').pop() : key
    if (bareName === localName) {
      for (const v of Array.isArray(value) ? value : [value]) results.push(v)
    }
    for (const v of Array.isArray(value) ? value : [value]) findByLocalName(v, localName, results)
  }
  return results
}

const TITLE_NUMBER_KEYS = ['nationalCadastralReference', 'label', 'INSPIREID', 'inspireId', 'title_number', 'TITLE_NO']

function extractTitleNumber(parcelNode) {
  for (const key of TITLE_NUMBER_KEYS) {
    const found = findByLocalName(parcelNode, key)
    for (const v of found) {
      const text = typeof v === 'string' ? v : (v?.['#text'] ?? v?.localId ?? null)
      if (typeof text === 'string' && text.trim()) return text.trim()
    }
  }
  return null
}

/** One posList's text ("E1 N1 E2 N2 ...") -> one ring of [lng, lat] pairs. */
function posListToRing(posListText) {
  const nums = posListText.trim().split(/\s+/).map(Number)
  const ring = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const { lat, lng } = bngToWgs84(nums[i], nums[i + 1])
    ring.push([lng, lat])
  }
  return ring
}

/** Parses one GML document's text into [{ titleNumber, polygons }], polygons each a ring of [lng, lat] pairs. */
export function extractParcels(gmlText) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' })
  const doc = parser.parse(gmlText)
  const parcelNodes = findByLocalName(doc, 'CadastralParcel')
  const parcels = []
  for (const node of parcelNodes) {
    const titleNumber = extractTitleNumber(node)
    const posLists = findByLocalName(node, 'posList')
    const rings = posLists
      .map((p) => (typeof p === 'string' ? p : p?.['#text']))
      .filter((t) => typeof t === 'string')
      .map(posListToRing)
      .filter((ring) => ring.length >= 4) // a closed ring needs at least 4 points (3 distinct + closing)
    if (titleNumber && rings.length > 0) {
      parcels.push({ titleNumber, polygons: rings })
    }
  }
  return parcels
}
