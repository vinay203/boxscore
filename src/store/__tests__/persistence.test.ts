import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackup, parseBackup } from '../backup'
import {
  CURRENT_MATCH_KEY,
  MATCH_HISTORY_KEY,
  PLAYER_POOL_KEY,
  SAVED_TEAMS_KEY,
  loadCurrentMatch,
  loadMatchHistory,
  loadPlayerPool,
  loadSavedTeams,
  saveCurrentMatch,
  savePlayerPool,
  saveSavedTeams,
  saveToHistory,
} from '../persistence'
import type { CompletedMatchSummary, PoolPlayer, SavedTeam } from '../../types'

const data: Record<string, string> = {}
let throwOnSet = false

globalThis.localStorage = {
  getItem: (key) => data[key] ?? null,
  setItem: (key, value) => {
    if (throwOnSet) throw new Error('quota exceeded')
    data[key] = value
  },
  removeItem: (key) => { delete data[key] },
  clear: () => Object.keys(data).forEach((key) => delete data[key]),
  key: (index) => Object.keys(data)[index] ?? null,
  get length() { return Object.keys(data).length },
} as Storage

function summary(id: string, date = '2026-01-01T00:00:00.000Z'): CompletedMatchSummary {
  return {
    id, date, team1Name: 'Team A', team2Name: 'Team B', winnerName: 'Team A',
    resultText: 'Team A won', team1Score: '1 / 0', team2Score: '0 / 0',
  }
}

function backup(matches: unknown, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ app: 'boxscore', exportVersion: 1, matches, ...overrides })
}

beforeEach(() => {
  Object.keys(data).forEach((key) => delete data[key])
  throwOnSet = false
})

describe('storage persistence', () => {
  it('keeps all 60 history entries and writes the versioned envelope', () => {
    for (let i = 0; i < 60; i++) expect(saveToHistory(summary(`match-${i}`))).toBe(true)
    expect(loadMatchHistory()).toHaveLength(60)
    expect(JSON.parse(data[MATCH_HISTORY_KEY]!).schemaVersion).toBe(1)
  })

  it('loads a legacy history array and writes an envelope on the next save', () => {
    data[MATCH_HISTORY_KEY] = JSON.stringify([summary('old')])
    expect(loadMatchHistory()).toEqual([summary('old')])
    saveToHistory(summary('new'))
    expect(JSON.parse(data[MATCH_HISTORY_KEY]!)).toEqual({
      schemaVersion: 1, matches: [summary('new'), summary('old')],
    })
  })

  it('recovers corrupted history and current match raw text under recovery keys', () => {
    data[MATCH_HISTORY_KEY] = '{broken history'
    data[CURRENT_MATCH_KEY] = '{broken current'
    expect(loadMatchHistory()).toEqual([])
    expect(loadCurrentMatch()).toBeNull()
    expect(Object.entries(data).some(([key, value]) => key.startsWith(`${MATCH_HISTORY_KEY}_corrupt_`) && value === '{broken history')).toBe(true)
    expect(Object.entries(data).some(([key, value]) => key.startsWith(`${CURRENT_MATCH_KEY}_corrupt_`) && value === '{broken current')).toBe(true)
  })

  it('returns false rather than throwing when localStorage writes fail', () => {
    throwOnSet = true
    expect(() => saveToHistory(summary('failed'))).not.toThrow()
    expect(saveToHistory(summary('failed'))).toBe(false)
    expect(saveCurrentMatch({} as never)).toBe(false)
  })
})

describe('backup format', () => {
  it('round-trips all entries in order and with the same content', () => {
    const matches = [summary('one'), summary('two')]
    const parsed = parseBackup(buildBackup(matches), [])
    expect(parsed).toEqual({ ok: true, added: matches, skipped: 0, newPlayers: [], players: [], teams: [] })
  })

  it('skips ids already present and validates malformed backups', () => {
    const one = summary('one')
    expect(parseBackup(backup([one, summary('two')]), [one])).toEqual({
      ok: true, added: [summary('two')], skipped: 1, newPlayers: [], players: [], teams: [],
    })
    const invalid = [
      ['', 'Text is not valid JSON'],
      [backup([], { app: 'other' }), "Backup app is not 'boxscore'"],
      [JSON.stringify({ app: 'boxscore', matches: [] }), 'Export version is missing or unsupported'],
      [backup([], { exportVersion: 2 }), 'Export version is missing or unsupported'],
      [backup('bad'), 'Matches must be an array'],
      [backup([{ id: 'x', date: '2026-01-01', team1Name: 'A' }]), 'A match is missing id, date, or team name'],
    ] as const
    for (const [text, error] of invalid) expect(parseBackup(text, [])).toEqual({ ok: false, error })
    expect(parseBackup(' '.repeat(10 * 1024 * 1024 + 1), [])).toEqual({
      ok: false, error: 'Backup file is larger than 10 MB',
    })
  })

  it('reads player pools from arrays and envelopes and preserves corrupt text', () => {
    const players: PoolPlayer[] = [{ id: 'p1', name: 'Alex', createdAt: '2026-01-01' }]
    data[PLAYER_POOL_KEY] = JSON.stringify(players)
    expect(loadPlayerPool()).toEqual(players)
    data[PLAYER_POOL_KEY] = JSON.stringify({ schemaVersion: 1, players })
    expect(loadPlayerPool()).toEqual(players)
    data[PLAYER_POOL_KEY] = '{broken pool'
    expect(loadPlayerPool()).toEqual([])
    expect(Object.entries(data).some(([key, value]) => key.startsWith(`${PLAYER_POOL_KEY}_corrupt_`) && value === '{broken pool')).toBe(true)
  })

  it('returns false without throwing when the player pool cannot be saved', () => {
    throwOnSet = true
    expect(() => savePlayerPool([])).not.toThrow()
    expect(savePlayerPool([])).toBe(false)
  })

  it('loads saved teams from arrays and envelopes and preserves corruption', () => {
    const teams: SavedTeam[] = [{ id: 'team-1', name: 'Alpha', playerIds: ['p1'] }]
    data[SAVED_TEAMS_KEY] = JSON.stringify(teams)
    expect(loadSavedTeams()).toEqual(teams)
    data[SAVED_TEAMS_KEY] = JSON.stringify({ schemaVersion: 1, teams })
    expect(loadSavedTeams()).toEqual(teams)
    data[SAVED_TEAMS_KEY] = '{bad teams'
    expect(loadSavedTeams()).toEqual([])
    expect(Object.entries(data).some(([key, value]) => key.startsWith(`${SAVED_TEAMS_KEY}_corrupt_`) && value === '{bad teams')).toBe(true)
    throwOnSet = true
    expect(() => saveSavedTeams(teams)).not.toThrow()
    expect(saveSavedTeams(teams)).toBe(false)
  })

  it('rejects invalid dates and damaged match data and defaults missing summary strings', () => {
    const base = { id: 'm', date: '2026-01-01', team1Name: 'A', team2Name: 'B' }
    expect(parseBackup(backup([{ ...base, date: 'not-a-date' }]), [])).toMatchObject({ ok: false, error: 'A match has an invalid date' })
    expect(parseBackup(backup([{ ...base, match: 5 }]), [])).toMatchObject({ ok: false, error: 'A match has damaged data' })
    expect(parseBackup(backup([{ ...base, innings: 'bad' }]), [])).toMatchObject({ ok: false, error: 'A match has damaged data' })
    const result = parseBackup(backup([base]), [])
    expect(result).toMatchObject({
      ok: true,
      added: [{ resultText: '', winnerName: '', team1Score: '', team2Score: '' }],
    })
  })
})
