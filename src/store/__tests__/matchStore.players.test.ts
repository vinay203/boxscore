import { beforeEach, describe, expect, it } from 'vitest'
import { useMatchStore } from '../matchStore'
import { buildBackup } from '../backup'
import type { CompletedMatchSummary, PoolPlayer } from '../../types'

const stored: Record<string, string> = {}
globalThis.localStorage = {
  getItem: (key) => stored[key] ?? null,
  setItem: (key, value) => { stored[key] = value },
  removeItem: (key) => { delete stored[key] },
  clear: () => Object.keys(stored).forEach((key) => delete stored[key]),
  key: (index) => Object.keys(stored)[index] ?? null,
  get length() { return Object.keys(stored).length },
} as Storage

function summary(id: string): CompletedMatchSummary {
  return {
    id, date: '2026-01-01T00:00:00.000Z', team1Name: 'Alpha', team2Name: 'Beta',
    winnerName: 'Alpha', resultText: 'Alpha won', team1Score: '1 / 0', team2Score: '0 / 0',
  }
}

function draft(team1Players: string[], team2Players: string[]) {
  useMatchStore.getState().updateSetupDraft({
    title: '', overs: 2, wicketLimit: 3, playersPerTeam: 3,
    team1Name: 'Alpha', team1Players, team2Name: 'Beta', team2Players,
    tossWinnerTeam: 1, tossChoice: 'bat',
  })
}

beforeEach(() => {
  Object.keys(stored).forEach((key) => delete stored[key])
  useMatchStore.setState({
    playerPool: [], matchHistory: [], match: null, innings: [], currentInningsIndex: 0,
    matchStatus: 'setup', screen: 'home', selectedHistoryMatchId: null,
  })
})

describe('player pool store', () => {
  it('adds, sorts, validates, updates, and removes pool players', () => {
    const store = useMatchStore.getState()
    expect(store.addPoolPlayer(' Zoe ').ok).toBe(true)
    expect(useMatchStore.getState().addPoolPlayer(' alex ', 'batsman').ok).toBe(true)
    expect(useMatchStore.getState().playerPool.map((player) => player.name)).toEqual(['alex', 'Zoe'])
    expect(useMatchStore.getState().addPoolPlayer('  ').ok).toBe(false)
    expect(useMatchStore.getState().addPoolPlayer('ALEX').error).toContain('already')
    const alex = useMatchStore.getState().playerPool[0]!
    expect(useMatchStore.getState().updatePoolPlayer(alex.id, { name: 'Aaron', role: 'wicketkeeper' }).ok).toBe(true)
    expect(useMatchStore.getState().playerPool[0]).toMatchObject({ name: 'Aaron', role: 'wicketkeeper' })
    expect(useMatchStore.getState().updatePoolPlayer(alex.id, { name: 'ZOE' }).ok).toBe(false)
    expect(useMatchStore.getState().removePoolPlayer(alex.id).ok).toBe(true)
    expect(useMatchStore.getState().playerPool.map((player) => player.name)).toEqual(['Zoe'])
  })

  it('links typed setup names to pool entries and leaves placeholders unlinked', () => {
    useMatchStore.getState().addPoolPlayer('alex', 'bowler')
    const alexBefore = useMatchStore.getState().playerPool[0]!
    draft(['Alex', '', 'Sam'], ['Bee', '', ''])
    useMatchStore.getState().startMatch()
    const state = useMatchStore.getState()
    const [alex, placeholder, sam] = state.match!.team1.players
    const [bee, otherPlaceholder] = state.match!.team2.players
    expect(alex).toMatchObject({ poolId: alexBefore.id, role: 'bowler' })
    expect(placeholder!.name).toBe('Player 2')
    expect(placeholder!.poolId).toBeUndefined()
    expect(sam!.poolId).toBeDefined()
    expect(bee!.poolId).toBeDefined()
    expect(otherPlaceholder!.poolId).toBeUndefined()
    expect(state.playerPool.map((player) => player.name.toLowerCase()).sort()).toEqual(['alex', 'bee', 'sam'])
    expect(state.playerPool.filter((player) => player.name.toLowerCase() === 'alex')).toHaveLength(1)
  })

  it('links mid-match additions and keeps pool entries unchanged when live names are edited', () => {
    draft(['', '', ''], ['', '', ''])
    useMatchStore.getState().startMatch()
    const match = useMatchStore.getState().match!
    expect(useMatchStore.getState().addPlayer(match.team1.id, 'Jordan').ok).toBe(true)
    let state = useMatchStore.getState()
    const linked = state.match!.team1.players.at(-1)!
    const poolName = state.playerPool[0]!.name
    state.updateLiveMatchNames('Alpha', ['Player 1', 'Player 2', 'Player 3', 'Jordan renamed'], 'Beta', ['Player 1', 'Player 2', 'Player 3'])
    state = useMatchStore.getState()
    expect(state.match!.team1.players.at(-1)!.poolId).toBe(linked.poolId)
    expect(state.match!.team1.players.at(-1)!.role).toBe(linked.role)
    expect(state.playerPool[0]!.name).toBe(poolName)
  })

  it('removing a pool player does not alter the match in progress or its history copy', () => {
    const poolPlayer: PoolPlayer = { id: 'pool-1', name: 'Pat', createdAt: '2026-01-01' }
    const past = { ...summary('past'), match: { marker: true } } as unknown as CompletedMatchSummary
    useMatchStore.setState({
      playerPool: [poolPlayer], matchHistory: [past],
      match: {
        overs: 2, wicketLimit: 3, playersPerTeam: 3,
        team1: { id: 'a', name: 'Alpha', players: [{ id: 'a1', name: 'Pat', poolId: poolPlayer.id }] },
        team2: { id: 'b', name: 'Beta', players: [] }, tossWinnerId: 'a', battingFirstId: 'a',
      },
    })
    useMatchStore.getState().removePoolPlayer(poolPlayer.id)
    expect(useMatchStore.getState().playerPool).toEqual([])
    expect(useMatchStore.getState().match!.team1.players[0]!.poolId).toBe(poolPlayer.id)
    expect(useMatchStore.getState().matchHistory).toEqual([past])
  })

  it('exports and restores matches and players, deduplicates, and accepts backups without players', () => {
    const player: PoolPlayer = { id: 'p1', name: 'Alex', role: 'allrounder', createdAt: '2026-01-01' }
    useMatchStore.setState({ matchHistory: [summary('match-1')], playerPool: [player] })
    const backupText = useMatchStore.getState().exportHistoryBackup()
    expect(JSON.parse(backupText).players).toEqual([player])
    useMatchStore.setState({ matchHistory: [], playerPool: [] })
    expect(useMatchStore.getState().importHistoryBackup(backupText)).toMatchObject({ ok: true, added: 1, playersAdded: 1 })
    expect(useMatchStore.getState().playerPool).toEqual([player])
    expect(useMatchStore.getState().importHistoryBackup(backupText)).toMatchObject({ ok: true, added: 0, skipped: 1, playersAdded: 0 })

    useMatchStore.setState({ matchHistory: [], playerPool: [] })
    const oldBackup = buildBackup([summary('old')])
    expect(useMatchStore.getState().importHistoryBackup(oldBackup)).toMatchObject({ ok: true, added: 1, playersAdded: 0 })

    useMatchStore.setState({ playerPool: [{ ...player, name: 'alex' }] })
    const sameNameBackup = buildBackup([], [{ ...player, id: 'different-id', name: 'Alex' }])
    expect(useMatchStore.getState().importHistoryBackup(sameNameBackup)).toMatchObject({ ok: true, playersAdded: 0 })
    expect(useMatchStore.getState().playerPool).toHaveLength(1)
  })
})
