import { syncInnings } from '../engine/adapter'
import type { DeliveryKind, InningsEvent, Wicket, WicketKind } from '../engine/types'
import type { CompletedMatchSummary, Innings, Match, MatchState } from '../types'

export const CURRENT_MATCH_KEY = 'boxscore_current_match'
export const MATCH_HISTORY_KEY = 'boxscore_match_history'
export const MAX_HISTORY = 25

export function saveCurrentMatch(state: MatchState): void {
  try {
    localStorage.setItem(CURRENT_MATCH_KEY, JSON.stringify(state))
  } catch {
    // storage full or unavailable
  }
}

export function migrateLegacyInnings(
  innings: Innings,
  match: Match,
  allInnings: Innings[] = [innings],
  inningsIndex: number = 0,
): Innings {
  if (Array.isArray(innings.events)) {
    return innings
  }

  const battingTeam =
    match.team1.id === innings.battingTeamId ? match.team1 : match.team2
  const squad = battingTeam.players

  let strikerId: string
  let nonStrikerId: string

  if (innings.balls && innings.balls.length > 0) {
    strikerId = innings.balls[0].batsmanId
    const nextPlayer = squad.find((p) => p.id !== strikerId)
    nonStrikerId = nextPlayer ? nextPlayer.id : strikerId
  } else if (
    innings.currentBatsmanIds &&
    innings.currentBatsmanIds.length === 2 &&
    (innings.currentBatsmanIds[0] || innings.currentBatsmanIds[1])
  ) {
    strikerId = innings.currentBatsmanIds[0] || squad[0]?.id || 'p1'
    nonStrikerId =
      innings.currentBatsmanIds[1] ||
      squad.find((p) => p.id !== strikerId)?.id ||
      'p2'
  } else {
    strikerId = squad[0]?.id || 'p1'
    nonStrikerId =
      squad.find((p) => p.id !== strikerId)?.id || squad[1]?.id || 'p2'
  }

  const events: InningsEvent[] = [
    {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `mig-openers-${Date.now()}`,
      type: 'openers',
      strikerId,
      nonStrikerId,
    },
  ]

  const outIds = new Set<string>()
  let currentStriker = strikerId
  let currentNonStriker = nonStrikerId

  const balls = innings.balls || []
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i]
    let delivery: DeliveryKind
    let batRuns = 0
    let byeRuns = 0
    let legByeRuns = 0
    let wideExtraRuns = 0

    if (b.extraType === 'wide') {
      delivery = 'wide'
      wideExtraRuns = b.runs
    } else if (b.extraType === 'noBall') {
      delivery = 'noBall'
      batRuns = b.runs
    } else if (b.extraType === 'bye') {
      delivery = 'legal'
      byeRuns = b.runs
    } else if (b.extraType === 'legBye') {
      delivery = 'legal'
      legByeRuns = b.runs
    } else {
      delivery = 'legal'
      batRuns = b.runs
    }

    let wicket: Wicket | undefined = undefined
    if (b.isWicket) {
      const outId = b.outBatsmanId || b.batsmanId
      outIds.add(outId)
      const availablePlayer = squad.find(
        (p) =>
          !outIds.has(p.id) &&
          p.id !== currentStriker &&
          p.id !== currentNonStriker,
      )
      const newBatterId = availablePlayer?.id

      wicket = {
        kind: (b.wicketType as WicketKind) || 'bowled',
        outId,
        newBatterId,
      }

      if (outId === currentStriker) {
        currentStriker = newBatterId || ''
      } else if (outId === currentNonStriker) {
        currentNonStriker = newBatterId || ''
      }
    }

    events.push({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `mig-ball-${i}-${Date.now()}`,
      type: 'ball',
      bowlerId: b.bowlerId,
      delivery,
      batRuns,
      byeRuns,
      legByeRuns,
      wideExtraRuns,
      wicket,
    })

    const physicallyRun = batRuns + byeRuns + legByeRuns + wideExtraRuns
    if (physicallyRun % 2 === 1) {
      const temp = currentStriker
      currentStriker = currentNonStriker
      currentNonStriker = temp
    }
  }

  const interim: Innings = {
    ...innings,
    events,
  }

  return syncInnings(interim, match, allInnings, inningsIndex)
}

export function loadCurrentMatch(): MatchState | null {
  try {
    const raw = localStorage.getItem(CURRENT_MATCH_KEY)
    if (!raw) return null
    const state = JSON.parse(raw) as MatchState
    if (!state || !state.match || !Array.isArray(state.innings)) return state

    const needsMigration = state.innings.some((inn) => !Array.isArray(inn.events))
    if (!needsMigration) {
      return state
    }

    try {
      const migratedInnings = state.innings.map((inn, idx) =>
        migrateLegacyInnings(inn, state.match!, state.innings, idx),
      )
      return {
        ...state,
        innings: migratedInnings,
      }
    } catch (migErr) {
      console.warn('Failed to migrate legacy match innings:', migErr)
      return null
    }
  } catch {
    return null
  }
}

export function clearCurrentMatch(): void {
  localStorage.removeItem(CURRENT_MATCH_KEY)
}

export function saveToHistory(summary: CompletedMatchSummary): void {
  try {
    const raw = localStorage.getItem(MATCH_HISTORY_KEY)
    const history: CompletedMatchSummary[] = raw ? JSON.parse(raw) : []
    // Remove if already exists with same id
    const filtered = history.filter((m) => m.id !== summary.id)
    filtered.unshift(summary)
    if (filtered.length > MAX_HISTORY) {
      filtered.splice(MAX_HISTORY)
    }
    localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(filtered))
  } catch {
    // ignore
  }
}

export function deleteFromHistory(id: string): void {
  try {
    const raw = localStorage.getItem(MATCH_HISTORY_KEY)
    if (!raw) return
    const history: CompletedMatchSummary[] = JSON.parse(raw)
    const filtered = history.filter((m) => m.id !== id)
    localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(filtered))
  } catch {
    // ignore
  }
}

export function clearMatchHistory(): void {
  try {
    localStorage.removeItem(MATCH_HISTORY_KEY)
  } catch {
    // ignore
  }
}

export function loadMatchHistory(): CompletedMatchSummary[] {
  try {
    const raw = localStorage.getItem(MATCH_HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CompletedMatchSummary[]
  } catch {
    return []
  }
}

export function hasResumableMatch(): boolean {
  const saved = loadCurrentMatch()
  if (!saved || !saved.match) return false
  return saved.matchStatus !== 'complete' && saved.matchStatus !== 'setup'
}
