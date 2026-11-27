import type { CompletedMatchSummary } from '../types'

export function buildBackup(history: CompletedMatchSummary[]): string {
  return JSON.stringify({
    app: 'boxscore',
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    matches: history,
  })
}

export function parseBackup(
  text: string,
  existing: CompletedMatchSummary[],
): { ok: true; added: CompletedMatchSummary[]; skipped: number } | { ok: false; error: string } {
  if (new TextEncoder().encode(text).byteLength > 10 * 1024 * 1024) {
    return { ok: false, error: 'Backup file is larger than 10 MB' }
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Text is not valid JSON' }
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'Backup app must be boxscore' }
  const backup = data as Record<string, unknown>
  if (backup.app !== 'boxscore') return { ok: false, error: "Backup app is not 'boxscore'" }
  if (typeof backup.exportVersion !== 'number' || backup.exportVersion < 1 || backup.exportVersion > 1) {
    return { ok: false, error: 'Export version is missing or unsupported' }
  }
  if (!Array.isArray(backup.matches)) return { ok: false, error: 'Matches must be an array' }

  const existingIds = new Set(existing.map((match) => match.id))
  const added: CompletedMatchSummary[] = []
  let skipped = 0
  for (const entry of backup.matches) {
    if (!entry || typeof entry !== 'object') return { ok: false, error: 'A match is missing id, date, or team name' }
    const match = entry as Record<string, unknown>
    if (typeof match.id !== 'string' || !match.id || typeof match.date !== 'string' || !match.date ||
      typeof match.team1Name !== 'string' || !match.team1Name ||
      typeof match.team2Name !== 'string' || !match.team2Name) {
      return { ok: false, error: 'A match is missing id, date, or team name' }
    }
    if (existingIds.has(match.id)) skipped++
    else {
      added.push(match as unknown as CompletedMatchSummary)
      existingIds.add(match.id)
    }
  }
  return { ok: true, added, skipped }
}
