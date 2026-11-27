import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackup } from '../backup'
import { useMatchStore } from '../matchStore'
import type { CompletedMatchSummary, PoolPlayer, SavedTeam } from '../../types'

const storage: Record<string, string> = {}
globalThis.localStorage = {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, value) => { storage[key] = value },
  removeItem: (key) => { delete storage[key] },
  clear: () => Object.keys(storage).forEach((key) => delete storage[key]),
  key: (index) => Object.keys(storage)[index] ?? null,
  get length() { return Object.keys(storage).length },
} as Storage

function poolPlayer(id: string, name: string): PoolPlayer {
  return { id, name, createdAt: '2026-01-01T00:00:00.000Z' }
}

const summary: CompletedMatchSummary = {
  id: 'match-1', date: '2026-06-01T00:00:00.000Z', team1Name: 'Alpha', team2Name: 'Beta',
  winnerName: 'Alpha', resultText: 'Alpha won', team1Score: '10 / 1', team2Score: '9 / 2',
  match: {
    overs: 2, wicketLimit: 3, playersPerTeam: 2, tossWinnerId: 'a', battingFirstId: 'a',
    team1: { id: 'a', name: 'Alpha', players: [
      { id: 'a1', name: 'Ravi', poolId: 'backup-ravi' },
      { id: 'a2', name: 'Arun', poolId: 'backup-arun' },
    ] },
    team2: { id: 'b', name: 'Beta', players: [{ id: 'b1', name: 'Ravi', poolId: 'backup-ravi' }] },
  },
}

const players = [poolPlayer('backup-ravi', 'Ravi'), poolPlayer('backup-arun', 'Arun')]
const teams: SavedTeam[] = [{ id: 'team-1', name: 'Alpha XI', playerIds: ['backup-ravi', 'backup-arun'], captainId: 'backup-ravi' }]

beforeEach(() => {
  Object.keys(storage).forEach((key) => delete storage[key])
  useMatchStore.setState({ matchHistory: [], playerPool: [], savedTeams: [], match: null, innings: [], matchStatus: 'setup' })
})

describe('history backup store import', () => {
  it('exports and imports matches, players, and teams, and skips the same backup on repeat', () => {
    useMatchStore.setState({ matchHistory: [summary], playerPool: players, savedTeams: teams })
    const backup = useMatchStore.getState().exportHistoryBackup()
    expect(JSON.parse(backup).teams).toEqual(teams)
    useMatchStore.setState({ matchHistory: [], playerPool: [], savedTeams: [] })

    expect(useMatchStore.getState().importHistoryBackup(backup)).toMatchObject({
      ok: true, added: 1, skipped: 0, playersAdded: 2, teamsAdded: 1,
    })
    expect(useMatchStore.getState().matchHistory).toHaveLength(1)
    expect(useMatchStore.getState().playerPool.map((player) => player.name)).toEqual(['Arun', 'Ravi'])
    expect(useMatchStore.getState().savedTeams[0]!.playerIds).toEqual(['backup-ravi', 'backup-arun'])
    expect(useMatchStore.getState().importHistoryBackup(backup)).toMatchObject({
      ok: true, added: 0, skipped: 1, playersAdded: 0, teamsAdded: 0,
    })
  })

  it('re-links a same-named player to the local id without duplicating the player', () => {
    useMatchStore.setState({ playerPool: [poolPlayer('local-ravi', 'RAVI')] })
    const backup = useMatchStore.getState().exportHistoryBackup()
    const data = JSON.parse(backup) as Record<string, unknown>
    data.matches = [summary]
    data.players = players
    data.teams = teams
    const result = useMatchStore.getState().importHistoryBackup(JSON.stringify(data))
    expect(result).toMatchObject({ ok: true, added: 1, playersAdded: 1, teamsAdded: 1 })
    const state = useMatchStore.getState()
    expect(state.playerPool.filter((player) => player.name.toLowerCase() === 'ravi')).toHaveLength(1)
    expect(state.matchHistory[0]!.match!.team1.players[0]!.poolId).toBe('local-ravi')
    expect(state.savedTeams[0]!.playerIds).toEqual(['local-ravi', 'backup-arun'])
  })

  it('imports an older backup that has no teams field', () => {
    const oldBackup = buildBackup([summary], players)
    expect(JSON.parse(oldBackup).teams).toBeUndefined()
    expect(useMatchStore.getState().importHistoryBackup(oldBackup)).toMatchObject({
      ok: true, added: 1, playersAdded: 2, teamsAdded: 0,
    })
    expect(useMatchStore.getState().savedTeams).toEqual([])
  })
})
