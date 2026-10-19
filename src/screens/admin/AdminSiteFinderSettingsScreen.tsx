import { useEffect, useMemo, useState } from 'react'
import { useAdminStore } from '../../store/useAdminStore'
import type { SiteFinderSetting } from '../../types'

/**
 * Edits site_finder_settings (supabase/migrations/0023_site_finder_settings.sql).
 * Saving here does NOT change anything SiteFinder's pipeline does right
 * now - a value saved only takes effect once someone runs that repo's
 * scripts/sync_config_from_stopspotter.py before the next pipeline run,
 * which pulls these values down into its own config/*.yaml files. There
 * is no live connection between this screen and a running pipeline.
 */
function SettingRow({
  setting,
  onSave,
}: {
  setting: SiteFinderSetting
  onSave: (key: string, value: number) => Promise<void>
}) {
  // Keyed by `${key}:${value}` in the parent below, so when `value`
  // changes externally (after a save round-trips through the store, or a
  // reload) this remounts with a fresh initial draft instead of needing
  // an effect to resync local state with a changing prop.
  const [draft, setDraft] = useState(String(setting.value))
  const [saving, setSaving] = useState(false)
  const [savedJustNow, setSavedJustNow] = useState(false)

  const draftNumber = Number(draft)
  const isValid = draft.trim() !== '' && Number.isFinite(draftNumber)
  const isDirty = isValid && draftNumber !== setting.value
  const isDefault = setting.value === setting.defaultValue

  async function save() {
    if (!isValid || !isDirty) return
    setSaving(true)
    try {
      await onSave(setting.key, draftNumber)
      setSavedJustNow(true)
      setTimeout(() => setSavedJustNow(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{setting.label}</p>
        {setting.description && (
          <p className="mt-0.5 text-xs text-slate-500">{setting.description}</p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          Default {setting.defaultValue}
          {setting.unit ? ` ${setting.unit}` : ''}
          {!isDefault && ' · changed from default'}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 sm:w-56">
        <input
          type="number"
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
          }}
          className={`w-24 rounded-lg border p-2 text-sm ${
            isValid ? 'border-slate-200' : 'border-red-300 bg-red-50'
          }`}
        />
        {setting.unit && <span className="text-xs text-slate-400">{setting.unit}</span>}
        <button
          type="button"
          disabled={!isDirty || saving}
          onClick={() => setDraft(String(setting.defaultValue))}
          className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-brand-700 underline disabled:opacity-0"
        >
          Reset
        </button>
        {saving && <span className="text-xs text-slate-400">Saving…</span>}
        {savedJustNow && !saving && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
    </li>
  )
}

type SyncState = 'idle' | 'syncing' | 'dispatched' | 'failed'

export function AdminSiteFinderSettingsScreen() {
  const settings = useAdminStore((s) => s.siteFinderSettings)
  const loading = useAdminStore((s) => s.siteFinderSettingsLoading)
  const error = useAdminStore((s) => s.error)
  const loadSiteFinderSettings = useAdminStore((s) => s.loadSiteFinderSettings)
  const updateSiteFinderSetting = useAdminStore((s) => s.updateSiteFinderSetting)
  const syncSiteFinderNow = useAdminStore((s) => s.syncSiteFinderNow)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    void loadSiteFinderSettings()
  }, [loadSiteFinderSettings])

  async function handleSyncNow() {
    setSyncState('syncing')
    setSyncError(null)
    try {
      await syncSiteFinderNow()
      setSyncState('dispatched')
    } catch (err) {
      setSyncState('failed')
      setSyncError(err instanceof Error ? err.message : 'Could not start the sync.')
    }
  }

  const groups = useMemo(() => {
    const byGroup = new Map<string, SiteFinderSetting[]>()
    for (const setting of settings) {
      const list = byGroup.get(setting.groupName) ?? []
      list.push(setting)
      byGroup.set(setting.groupName, list)
    }
    return Array.from(byGroup.entries())
  }, [settings])

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-slate-900">SiteFinder settings</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        The pass/fail thresholds and scoring weights SiteFinder's pipeline uses. Each value below
        saves itself as soon as you leave the box — but that alone doesn't change anything in
        SiteFinder yet. Use the button below to actually send your changes over, or wait — it
        happens automatically every 6 hours anyway.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSyncNow()}
          disabled={syncState === 'syncing'}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {syncState === 'syncing' ? 'Starting…' : 'Sync to SiteFinder now'}
        </button>
        {syncState === 'dispatched' && (
          <p className="text-sm text-emerald-700">
            Started. This usually takes a minute or two to finish — there's no progress bar to
            watch, so check SiteFinder's repo (the Actions tab, or a fresh <code>git pull</code>)
            in a bit to confirm it landed.
          </p>
        )}
        {syncState === 'failed' && (
          <p className="text-sm text-red-700">{syncError}</p>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {!loading && (
        <div className="mt-4 flex flex-col gap-4">
          {groups.map(([groupName, groupSettings]) => (
            <div key={groupName} className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">{groupName}</h3>
              <ul className="mt-1">
                {groupSettings.map((setting) => (
                  <SettingRow
                    key={`${setting.key}:${setting.value}`}
                    setting={setting}
                    onSave={updateSiteFinderSetting}
                  />
                ))}
              </ul>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
              No settings found — has supabase/migrations/0023_site_finder_settings.sql been
              applied?
            </p>
          )}
        </div>
      )}
    </div>
  )
}
