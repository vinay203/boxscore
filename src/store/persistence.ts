import type { CompletedMatchSummary, MatchState } from '../types'

export const CURRENT_MATCH_KEY = 'boxscore_current_match'
export const MATCH_HISTORY_KEY = 'boxscore_match_history'
export const MAX_HISTORY = 10

export function saveCurrentMatch(state: MatchState): void {
  try {
    localStorage.setItem(CURRENT_MATCH_KEY, JSON.stringify(state))
  } catch {
    // storage full or unavailable
  }
}

export function loadCurrentMatch(): MatchState | null {
  try {
    const raw = localStorage.getItem(CURRENT_MATCH_KEY)
    if (!raw) return null
    return JSON.parse(raw) as MatchState
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
    history.unshift(summary)
    if (history.length > MAX_HISTORY) {
      history.splice(MAX_HISTORY)
    }
    localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(history))
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
