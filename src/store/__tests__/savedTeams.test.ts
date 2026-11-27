import { beforeEach, describe, expect, it } from 'vitest'
import { getInningsSummary } from '../../engine/views'
import { findDuplicateTypedName, getNewHistoryPlayerNames, useMatchStore } from '../matchStore'
import { SAVED_TEAMS_KEY } from '../persistence'
import type { CompletedMatchSummary, Innings, Match, PoolPlayer } from '../../types'

const storage: Record<string, string> = {}
globalThis.localStorage = {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, value) => { storage[key] = value },
  removeItem: (key) => { delete storage[key] },
  clear: () => Object.keys(storage).forEach((key) => delete storage[key]),
  key: (index) => Object.keys(storage)[index] ?? null,
  get length() { return Object.keys(storage).length },
} as Storage

beforeEach(() => {
  Object.keys(storage).forEach((key) => delete storage[key])
  useMatchStore.getState().startNewMatch()
  useMatchStore.setState({ playerPool: [], savedTeams: [], matchHistory: [], match: null, innings: [], matchStatus: 'setup' })
  useMatchStore.getState().updateSetupDraft({
    title: '', overs: 2, wicketLimit: 3, playersPerTeam: 3,
    team1Name: 'Alpha', team1Players: ['', '', ''], team2Name: 'Beta', team2Players: ['', '', ''],
    team1CaptainIndex: null, team2CaptainIndex: null, tossWinnerTeam: 1, tossChoice: 'bat',
  })
})

describe('saved teams and captains', () => {
  it('blocks duplicate typed names within one team and allows them across teams', () => {
    expect(findDuplicateTypedName([' Ravi ', 'rAVI'])).toBe('Ravi')
    expect(findDuplicateTypedName(['Ravi', 'Sam'])).toBeNull()
    expect(findDuplicateTypedName(['Ravi'])).toBeNull()
    expect([findDuplicateTypedName(['Ravi']), findDuplicateTypedName(['ravi'])]).toEqual([null, null])
    expect(findDuplicateTypedName(['Ravi'])).toBeNull()
  })

  it('saves teams by linked pool ids in box order, requires valid input, and updates matching names', () => {
    const store = useMatchStore.getState()
    expect(store.saveTeamFromDraft(1).ok).toBe(false)
    store.updateSetupDraft({ team1Name: '   ', team1Players: ['A', 'B', ''] })
    expect(useMatchStore.getState().saveTeamFromDraft(1).ok).toBe(false)
    store.updateSetupDraft({ team1Name: 'My Team', team1Players: ['A', '', 'B'], team1CaptainIndex: 2 })
    const saved = useMatchStore.getState().saveTeamFromDraft(1)
    expect(saved).toMatchObject({ ok: true, updated: false })
    let state = useMatchStore.getState()
    const original = state.savedTeams[0]!
    expect(original.playerIds).toEqual([
      state.playerPool.find((player) => player.name === 'A')!.id,
      state.playerPool.find((player) => player.name === 'B')!.id,
    ])
    expect(original.captainId).toBe(original.playerIds[1])
    expect(state.playerPool.map((player) => player.name)).toEqual(['A', 'B'])

    state.updateSetupDraft({ team1Name: 'my team', team1Players: ['C', 'D', ''], team1CaptainIndex: null })
    expect(useMatchStore.getState().saveTeamFromDraft(1)).toMatchObject({ ok: true, updated: true })
    state = useMatchStore.getState()
    expect(state.savedTeams).toHaveLength(1)
    expect(state.savedTeams[0]!.id).toBe(original.id)
    expect(state.savedTeams[0]!.captainId).toBeUndefined()
    expect(state.playerPool.map((player) => player.name)).toEqual(['A', 'B', 'C', 'D'])

    state.updateSetupDraft({ team1Players: ['Ravi', ' rAvI ', ''] })
    expect(useMatchStore.getState().saveTeamFromDraft(1).ok).toBe(false)
  })

  it('applies saved players and captain, resizes both teams, caps at 11, and skips missing pool ids', () => {
    const pool: PoolPlayer[] = Array.from({ length: 12 }, (_, index) => ({
      id: `p${index + 1}`, name: `Player ${index + 1}`, createdAt: '2026-01-01',
    }))
    useMatchStore.setState({
      playerPool: pool,
      savedTeams: [{ id: 'saved', name: 'Saved XI', playerIds: ['missing', ...pool.map((player) => player.id)], captainId: 'p4' }],
    })
    useMatchStore.getState().updateSetupDraft({ playersPerTeam: 3, team1Players: ['', '', ''], team2Players: ['', '', ''] })
    useMatchStore.getState().applySavedTeamToDraft(1, 'saved')
    const draft = useMatchStore.getState().setupDraft
    expect(draft.team1Name).toBe('Saved XI')
    expect(draft.playersPerTeam).toBe(11)
    expect(draft.team1Players).toHaveLength(11)
    expect(draft.team2Players).toHaveLength(11)
    expect(draft.team1Players[0]).toBe('Player 1')
    expect(draft.team1Players[10]).toBe('Player 11')
    expect(draft.team1CaptainIndex).toBe(3)
  })

  it('deletes saved teams and removes pool ids and captains from every saved team', () => {
    useMatchStore.setState({
      playerPool: [
        { id: 'p1', name: 'One', createdAt: '2026-01-01' },
        { id: 'p2', name: 'Two', createdAt: '2026-01-01' },
      ],
      savedTeams: [
        { id: 'team1', name: 'Team 1', playerIds: ['p1', 'p2'], captainId: 'p1' },
        { id: 'team2', name: 'Team 2', playerIds: ['p1'], captainId: 'p2' },
      ],
    })
    useMatchStore.getState().deleteSavedTeam('team2')
    expect(useMatchStore.getState().savedTeams).toHaveLength(1)
    useMatchStore.getState().removePoolPlayer('p1')
    expect(useMatchStore.getState().savedTeams[0]).toMatchObject({ playerIds: ['p2'] })
    expect(useMatchStore.getState().savedTeams[0]!.captainId).toBeUndefined()
    expect(JSON.parse(storage[SAVED_TEAMS_KEY]!).teams[0].playerIds).toEqual(['p2'])
  })

  it('loads saved teams into store state during initApp', () => {
    const teams = [{ id: 'saved', name: 'Stored XI', playerIds: ['p1'], captainId: 'p1' }]
    storage[SAVED_TEAMS_KEY] = JSON.stringify({ schemaVersion: 1, teams })
    useMatchStore.getState().initApp()
    expect(useMatchStore.getState().savedTeams).toEqual(teams)
  })

  it('sets match captain ids only for selected typed boxes', () => {
    const store = useMatchStore.getState()
    store.updateSetupDraft({
      team1Players: ['One', '', 'Two'], team2Players: ['Three', '', 'Four'],
      team1CaptainIndex: 2, team2CaptainIndex: 1,
    })
    store.startMatch()
    let match = useMatchStore.getState().match!
    expect(match.team1.captainId).toBe(match.team1.players[2]!.id)
    expect(match.team2.captainId).toBeUndefined()
    useMatchStore.getState().updateSetupDraft({ team1CaptainIndex: null, team2CaptainIndex: 0 })
    useMatchStore.getState().startMatch()
    match = useMatchStore.getState().match!
    expect(match.team1.captainId).toBeUndefined()
    expect(match.team2.captainId).toBe(match.team2.players[0]!.id)
  })

  it('adds distinct non-placeholder history names once without changing history', () => {
    const history: CompletedMatchSummary[] = [{
      id: 'history', date: '2026-01-01', winnerName: 'A', resultText: 'A won',
      team1Name: 'A', team1Score: '1 / 0', team2Name: 'B', team2Score: '0 / 0',
      match: {
        overs: 2, wicketLimit: 3, playersPerTeam: 4, tossWinnerId: 'a', battingFirstId: 'a',
        team1: { id: 'a', name: 'A', players: [
          { id: 'a1', name: ' Ravi ' }, { id: 'a2', name: 'ravi' }, { id: 'a3', name: 'Player 2' }, { id: 'a4', name: 'Sam' },
        ] },
        team2: { id: 'b', name: 'B', players: [{ id: 'b1', name: 'Tara' }] },
      },
    }]
    useMatchStore.setState({ matchHistory: history, playerPool: [{ id: 'p1', name: 'SAM', createdAt: '2026-01-01' }] })
    const names = getNewHistoryPlayerNames(history, useMatchStore.getState().playerPool)
    expect(names).toEqual(['Ravi', 'Tara'])
    expect(useMatchStore.getState().addPlayersFromHistory()).toEqual({ added: 2 })
    expect(useMatchStore.getState().playerPool.map((player) => player.name)).toEqual(['Ravi', 'SAM', 'Tara'])
    expect(useMatchStore.getState().addPlayersFromHistory()).toEqual({ added: 0 })
    expect(useMatchStore.getState().matchHistory).toEqual(history)
  })

  it('marks the batting and bowling captain rows in the innings summary', () => {
    const match: Match = {
      overs: 2, wicketLimit: 3, playersPerTeam: 3, tossWinnerId: 't1', battingFirstId: 't1',
      team1: { id: 't1', name: 'Alpha', captainId: 'a1', players: [{ id: 'a1', name: 'A' }, { id: 'a2', name: 'B' }] },
      team2: { id: 't2', name: 'Beta', captainId: 'b1', players: [{ id: 'b1', name: 'C' }, { id: 'b2', name: 'D' }] },
    }
    const innings: Innings[] = [{
      battingTeamId: 't1', bowlingTeamId: 't2', currentBatsmanIds: ['a1', 'a2'], currentBowlerId: 'b1',
      status: 'live', pendingBowlerSelection: false,
      events: [
        { id: 'open', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' },
        { id: 'ball', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      ],
    }]
    const summary = getInningsSummary(match, innings, 0)
    expect(summary.batting.find((player) => player.id === 'a1')?.isCaptain).toBe(true)
    expect(summary.batting.find((player) => player.id === 'a2')?.isCaptain).toBe(false)
    expect(summary.bowling[0]).toMatchObject({ id: 'b1', isCaptain: true })
  })

  it('clears a match team captain when that player is removed mid-match', () => {
    useMatchStore.getState().updateSetupDraft({
      playersPerTeam: 4,
      team1Players: ['One', 'Two', 'Three', 'Captain'],
      team2Players: ['Other 1', 'Other 2', 'Other 3', 'Other 4'],
      team1CaptainIndex: 3,
    })
    useMatchStore.getState().startMatch()
    const match = useMatchStore.getState().match!
    const captainId = match.team1.captainId!
    expect(useMatchStore.getState().removePlayer(match.team1.id, captainId).ok).toBe(true)
    expect(useMatchStore.getState().match!.team1.captainId).toBeUndefined()
  })

  it('validates saved team creation and updates names, members, and captain', () => {
    useMatchStore.setState({ playerPool: [
      { id: 'p1', name: 'One', createdAt: '2026-01-01' },
      { id: 'p2', name: 'Two', createdAt: '2026-01-01' },
      { id: 'p3', name: 'Three', createdAt: '2026-01-01' },
    ] })
    const store = useMatchStore.getState()
    expect(store.createSavedTeam(' ', ['p1', 'p2']).ok).toBe(false)
    expect(store.createSavedTeam('Alpha', ['p1']).ok).toBe(false)
    expect(store.createSavedTeam('Alpha', ['p1', 'missing']).ok).toBe(false)
    expect(store.createSavedTeam('Alpha', ['p1', 'p1']).ok).toBe(false)
    expect(store.createSavedTeam('Alpha', ['p1', 'p2'], 'p3').ok).toBe(false)
    expect(store.createSavedTeam('Alpha', ['p1', 'p2'], 'p1').ok).toBe(true)
    expect(useMatchStore.getState().createSavedTeam(' alpha ', ['p1', 'p2']).ok).toBe(false)
    expect(useMatchStore.getState().createSavedTeam('Beta', ['p2', 'p3']).ok).toBe(true)
    const [alpha, beta] = useMatchStore.getState().savedTeams
    expect(useMatchStore.getState().updateSavedTeam(alpha!.id, { name: ' alpha ' }).ok).toBe(true)
    expect(useMatchStore.getState().updateSavedTeam(alpha!.id, { name: '  ' }).ok).toBe(false)
    expect(useMatchStore.getState().updateSavedTeam(alpha!.id, { name: beta!.name }).ok).toBe(false)
    expect(useMatchStore.getState().updateSavedTeam(alpha!.id, { playerIds: ['p1', 'p1'] }).ok).toBe(false)
    expect(useMatchStore.getState().updateSavedTeam(alpha!.id, { playerIds: ['missing', 'p2'] }).ok).toBe(false)
    expect(useMatchStore.getState().updateSavedTeam(alpha!.id, { captainId: 'p3' }).ok).toBe(false)
    expect(useMatchStore.getState().updateSavedTeam(alpha!.id, { playerIds: ['p2', 'p3'] }).ok).toBe(false)
    expect(useMatchStore.getState().updateSavedTeam(alpha!.id, { playerIds: ['p2', 'p3'], captainId: null }).ok).toBe(true)
    expect(useMatchStore.getState().savedTeams[0]).toMatchObject({ playerIds: ['p2', 'p3'], captainId: undefined })
  })
})
