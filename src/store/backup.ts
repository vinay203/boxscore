import type { CompletedMatchSummary, PoolPlayer, PlayerRole } from '../types'

const PLAYER_ROLES: PlayerRole[] = ['batsman', 'bowler', 'allrounder', 'wicketkeeper']

export function buildBackup(history: CompletedMatchSummary[], players?: PoolPlayer[]): string {
  return JSON.stringify({
    app: 'boxscore',
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    matches: history,
    ...(players ? { players } : {}),
  })
}

export function parseBackup(
  text: string,
  existing: CompletedMatchSummary[],
  existingPlayers: PoolPlayer[] = [],
): { ok: true; added: CompletedMatchSummary[]; skipped: number; newPlayers: PoolPlayer[] } | { ok: false; error: string } {
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
    if (Number.isNaN(Date.parse(match.date))) return { ok: false, error: 'A match has an invalid date' }
    let matchData: Record<string, unknown> | undefined
    if (Object.prototype.hasOwnProperty.call(match, 'match')) {
      const candidate = match.match
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return { ok: false, error: 'A match has damaged data' }
      }
      const record = candidate as Record<string, unknown>
      const team1 = record.team1
      const team2 = record.team2
      if (typeof record.overs !== 'number' || !team1 || typeof team1 !== 'object' || Array.isArray(team1) ||
        !team2 || typeof team2 !== 'object' || Array.isArray(team2) ||
        !Array.isArray((team1 as Record<string, unknown>).players) ||
        !Array.isArray((team2 as Record<string, unknown>).players)) {
        return { ok: false, error: 'A match has damaged data' }
      }
      matchData = record
    }
    let inningsData: unknown[] | undefined
    if (Object.prototype.hasOwnProperty.call(match, 'innings')) {
      if (!Array.isArray(match.innings) || match.innings.some((innings) => !innings || typeof innings !== 'object' || Array.isArray(innings))) {
        return { ok: false, error: 'A match has damaged data' }
      }
      inningsData = match.innings
    }
    if (existingIds.has(match.id)) skipped++
    else {
      added.push({
        id: match.id,
        date: match.date,
        team1Name: match.team1Name,
        team2Name: match.team2Name,
        resultText: typeof match.resultText === 'string' ? match.resultText : '',
        winnerName: typeof match.winnerName === 'string' ? match.winnerName : '',
        team1Score: typeof match.team1Score === 'string' ? match.team1Score : '',
        team2Score: typeof match.team2Score === 'string' ? match.team2Score : '',
        ...(typeof match.title === 'string' ? { title: match.title } : {}),
        ...(matchData ? { match: matchData as unknown as CompletedMatchSummary['match'] } : {}),
        ...(inningsData ? { innings: inningsData as CompletedMatchSummary['innings'] } : {}),
        ...(match.potm && typeof match.potm === 'object' ? { potm: match.potm as CompletedMatchSummary['potm'] } : {}),
      })
      existingIds.add(match.id)
    }
  }

  let importedPlayers: PoolPlayer[] = []
  if (backup.players !== undefined) {
    if (!Array.isArray(backup.players)) return { ok: false, error: 'Players must be an array' }
    const poolIds = new Set(existingPlayers.map((player) => player.id))
    const poolNames = new Set(existingPlayers.map((player) => player.name.trim().toLocaleLowerCase()))
    for (const entry of backup.players) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { ok: false, error: 'A player has damaged data' }
      const player = entry as Record<string, unknown>
      if (typeof player.id !== 'string' || !player.id || typeof player.name !== 'string' || !player.name.trim() ||
        (player.role !== undefined && !PLAYER_ROLES.includes(player.role as PlayerRole))) {
        return { ok: false, error: 'A player has damaged data' }
      }
      const normalizedName = player.name.trim().toLocaleLowerCase()
      if (!poolIds.has(player.id) && !poolNames.has(normalizedName)) {
        importedPlayers.push({
          id: player.id,
          name: player.name,
          ...(player.role !== undefined ? { role: player.role as PlayerRole } : {}),
          createdAt: typeof player.createdAt === 'string' ? player.createdAt : new Date().toISOString(),
        })
      }
      poolIds.add(player.id)
      poolNames.add(normalizedName)
    }
  }
  return { ok: true, added, skipped, newPlayers: importedPlayers }
}
