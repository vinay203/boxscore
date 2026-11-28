import { beforeEach, describe, expect, it } from 'vitest'
import { deriveForInnings, getBowlerChoices, rulesFromMatch } from '../adapter'
import { deriveInnings } from '../deriveInnings'
import { getInningsSummary, getMatchResultFromState, getPlayerOfTheMatch } from '../views'
import { useMatchStore } from '../../store/matchStore'
import { saveCurrentMatch } from '../../store/persistence'
import type { Innings, Match, Player, Team } from '../../types'
import type { InningsEvent } from '../types'

const storage: Record<string, string> = {}
globalThis.localStorage = {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, value) => { storage[key] = value },
  removeItem: (key) => { delete storage[key] },
  clear: () => Object.keys(storage).forEach((key) => delete storage[key]),
  key: (index) => Object.keys(storage)[index] ?? null,
  get length() { return Object.keys(storage).length },
} as Storage

function makeMatch(canBat = true, canBowl = true): Match {
  const joker: Player = { id: 'joker', poolId: 'pool-j', name: 'Jay' }
  const team = (id: string, name: string, prefix: string): Team => ({
    id, name, captainId: `${prefix}1`, players: [
      { id: `${prefix}1`, name: `${prefix} One` },
      { id: `${prefix}2`, name: `${prefix} Two` },
      { id: `${prefix}3`, name: `${prefix} Three` },
      joker,
    ],
  })
  const team1 = team('t1', 'Team 1', 'a')
  const team2 = team('t2', 'Team 2', 'b')
  return {
    overs: 2, wicketLimit: 2, playersPerTeam: 3, team1, team2,
    tossWinnerId: team1.id, battingFirstId: team1.id,
    joker: { playerId: joker.id, canBat, canBowl },
  }
}

function innings(battingTeamId: string, bowlingTeamId: string, events: InningsEvent[]): Innings {
  return {
    battingTeamId, bowlingTeamId, events, currentBatsmanIds: ['', ''], currentBowlerId: '',
    status: 'live', pendingBowlerSelection: true,
  }
}

function prepareSetup(jokerName = 'Jay') {
  useMatchStore.getState().startNewMatch()
  useMatchStore.setState({ playerPool: [], savedTeams: [], matchHistory: [], match: null, innings: [], matchStatus: 'setup' })
  useMatchStore.getState().updateSetupDraft({
    title: '', overs: 2, wicketLimit: 2, playersPerTeam: 3,
    team1Name: 'Team 1', team1Players: ['A1', 'A2', 'A3'],
    team2Name: 'Team 2', team2Players: ['B1', 'B2', 'B3'],
    tossWinnerTeam: 1, tossChoice: 'bat', jokerName, jokerCanBat: true, jokerCanBowl: true,
  })
}

describe('step 7a joker', () => {
  beforeEach(() => {
    Object.keys(storage).forEach((key) => delete storage[key])
    prepareSetup()
  })

  it('starts with one shared player id and pool link; without a joker the squads stay unchanged', () => {
    const store = useMatchStore.getState()
    store.startMatch()
    let match = useMatchStore.getState().match!
    const joker = match.team1.players.at(-1)!
    expect(match.team1.players.at(-1)).toBe(match.team2.players.at(-1))
    expect(match.team2.players.at(-1)?.id).toBe(joker.id)
    expect(joker.poolId).toBeTruthy()
    expect(match.joker).toEqual({ playerId: joker.id, canBat: true, canBowl: true })
    expect(match.playersPerTeam).toBe(3)

    prepareSetup('')
    useMatchStore.getState().startMatch()
    match = useMatchStore.getState().match!
    expect(match.joker).toBeUndefined()
    expect(match.team1.players).toHaveLength(3)
    expect(match.team2.players).toHaveLength(3)
  })

  it('keeps per-innings batting and bowling stats and handles shared identity in summaries, POTM, and result', () => {
    const match = makeMatch()
    const first = innings('t1', 't2', [
      { id: 'o1', type: 'openers', strikerId: 'joker', nonStrikerId: 'a1' },
      { id: 'b1', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 4, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
    ])
    const second = innings('t2', 't1', [
      { id: 'o2', type: 'openers', strikerId: 'joker', nonStrikerId: 'b1' },
      { id: 'b2', type: 'ball', bowlerId: 'a1', delivery: 'legal', batRuns: 2, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      { id: 'b3', type: 'ball', bowlerId: 'joker', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
    ])
    const all = [first, second]
    expect(getInningsSummary(match, all, 0).batting.find((row) => row.id === 'joker')?.runs).toBe(4)
    expect(getInningsSummary(match, all, 1).batting.find((row) => row.id === 'joker')?.runs).toBe(2)
    const secondDerived = deriveForInnings(match, all, 1)
    expect(secondDerived.batting.joker?.runs).toBe(2)
    expect(secondDerived.bowling.joker?.legalBalls).toBe(1)
    expect(getMatchResultFromState(match, all).text).toContain('Team 1 won by 2 runs')
    expect(getPlayerOfTheMatch(match, all)).toMatchObject({ name: 'Jay', stat: '4 runs' })
  })

  it('rejects joker batting when disabled and excludes him from fallback, remaining batters, and all-out wickets', () => {
    const match = makeMatch(false, true)
    const rules = rulesFromMatch(match)
    const ctx = {
      rules, battingPlayerIds: match.team1.players.map((player) => player.id),
      players: Object.fromEntries(match.team1.players.map((player) => [player.id, { name: player.name }])),
    }
    const opener = deriveInnings([{ id: 'o', type: 'openers', strikerId: 'joker', nonStrikerId: 'a1' }], ctx)
    expect(opener.errors).toContain('Joker is not allowed to bat')
    expect(opener.strikerId).toBeNull()
    expect(opener.needsNewBatter).toBe(true)

    const incoming = deriveInnings([
      { id: 'o', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' },
      { id: 'w', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'bowled', outId: 'a1', newBatterId: 'joker' } },
    ], ctx)
    expect(incoming.errors).toContain('Joker is not allowed to bat')
    expect(incoming.needsNewBatter).toBe(true)

    const retiredReplacement = deriveInnings([
      { id: 'o', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' },
      { id: 'hurt', type: 'retiredHurt', batterId: 'a1', replacementId: 'joker' },
    ], ctx)
    expect(retiredReplacement.errors).toContain('Joker is not allowed to bat')
    expect(retiredReplacement.needsNewBatter).toBe(true)

    const fallback = deriveInnings([{ id: 'ball', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 }], ctx)
    expect(fallback.strikerId).toBe('a1')
    expect(fallback.nonStrikerId).toBe('a2')
    expect(fallback.errors.join(' ')).not.toContain('joker')

    const out = deriveInnings([
      { id: 'o', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' },
      { id: 'w', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'bowled', outId: 'a1' } },
    ], { ...ctx, battingPlayerIds: ['a1', 'a2', 'joker'] })
    expect(out.isComplete).toBe(true)
    expect(out.completeReason).toBe('allOut')
    expect(getInningsSummary(match, [innings('t1', 't2', [{ id: 'o', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' }])], 0).remainingBatsmen.map((player) => player.id)).not.toContain('joker')
  })

  it('rejects disabled joker openers and incoming batters through event edits and insertion', () => {
    const match = makeMatch(false, true)
    const events: InningsEvent[] = [
      { id: 'o', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' },
      { id: 'b', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
    ]
    const inningsState = innings('t1', 't2', events)
    useMatchStore.setState({ match, innings: [inningsState], currentInningsIndex: 0, matchStatus: 'live' })
    expect(useMatchStore.getState().editOpeners('joker', 'a1')).toMatchObject({ ok: false, error: 'Joker is not allowed to bat' })
    useMatchStore.setState({ innings: [{ ...inningsState, currentBowlerId: 'b1', pendingBowlerSelection: false }] })
    expect(useMatchStore.getState().recordWicket('bowled', 'a1', 'joker')).toMatchObject({ ok: false, error: 'Joker is not allowed to bat' })
    expect(useMatchStore.getState().innings[0]?.events).toHaveLength(2)
    expect(useMatchStore.getState().retireBatsman(true, 'joker')).toMatchObject({ ok: false, error: 'Joker is not allowed to bat' })
    const replacement = {
      id: 'b', bowlerId: 'b1', delivery: 'legal' as const, batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0,
      wicket: { kind: 'bowled' as const, outId: 'a1', newBatterId: 'joker' },
    }
    expect(useMatchStore.getState().editEvent('b', replacement)).toMatchObject({ ok: false, error: 'Joker is not allowed to bat' })
    expect(useMatchStore.getState().insertEvent('o', { bowlerId: 'b1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'bowled', outId: 'a1', newBatterId: 'joker' } })).toMatchObject({ ok: false, error: 'Joker is not allowed to bat' })
  })

  it('rejects disabled joker bowling, hides him from choices, but keeps him in the fielding squad', () => {
    const match = makeMatch(true, false)
    expect(getBowlerChoices(match, 0).map((player) => player.id)).not.toContain('joker')
    expect(match.team2.players.some((player) => player.id === 'joker')).toBe(true)
    const events: InningsEvent[] = [{ id: 'o', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' }]
    const loggedForbiddenBall = deriveForInnings(match, [innings('t1', 't2', [
      ...events,
      { id: 'forbidden', type: 'ball', bowlerId: 'joker', delivery: 'legal', batRuns: 1, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
    ])], 0)
    expect(loggedForbiddenBall.errors).toContain('Joker is not allowed to bowl')
    expect(loggedForbiddenBall.score).toMatchObject({ runs: 1, legalBalls: 1 })
    useMatchStore.setState({ match, innings: [innings('t1', 't2', events)], currentInningsIndex: 0, matchStatus: 'live' })
    useMatchStore.getState().selectBowler('joker')
    expect(useMatchStore.getState().innings[0]?.currentBowlerId).toBe('')
    const existingBall: InningsEvent = { id: 'existing', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 }
    useMatchStore.setState({ innings: [innings('t1', 't2', [...events, existingBall])] })
    expect(useMatchStore.getState().editEvent('existing', { id: 'existing', bowlerId: 'joker', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 })).toMatchObject({ ok: false, error: 'Joker is not allowed to bowl' })
    expect(useMatchStore.getState().insertEvent('o', { bowlerId: 'joker', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 })).toMatchObject({ ok: false, error: 'Joker is not allowed to bowl' })
  })

  it('lets a retired-hurt batter return with the same figures and status not out', () => {
    const match = makeMatch()
    const ctx = {
      rules: rulesFromMatch(match), battingPlayerIds: match.team1.players.map((player) => player.id),
      players: Object.fromEntries(match.team1.players.map((player) => [player.id, { name: player.name }])),
    }
    const result = deriveInnings([
      { id: 'o', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' },
      { id: 'b1', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 2, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      { id: 'hurt', type: 'retiredHurt', batterId: 'a1', replacementId: 'a3' },
      { id: 'b2', type: 'ball', bowlerId: 'b1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'bowled', outId: 'a3', newBatterId: 'a1' } },
    ], ctx)
    expect(result.batting.a1).toMatchObject({ runs: 2, balls: 1, status: 'batting', dismissalText: 'not out' })
  })

  it('renames joker in both squads and refuses to remove him', () => {
    const store = useMatchStore.getState()
    store.startMatch()
    const match = useMatchStore.getState().match!
    const t1 = match.team1.players.map((player) => player.name)
    const t2 = match.team2.players.map((player) => player.name)
    t1[t1.length - 1] = 'Jay New'
    useMatchStore.getState().updateLiveMatchNames(match.team1.name, t1, match.team2.name, t2)
    const renamed = useMatchStore.getState().match!
    expect(renamed.team1.players.at(-1)?.name).toBe('Jay New')
    expect(renamed.team2.players.at(-1)?.name).toBe('Jay New')
    expect(useMatchStore.getState().removePlayer(renamed.team1.id, renamed.joker!.playerId)).toMatchObject({ ok: false, error: 'Use the joker settings to remove the joker' })
  })

  it('blocks a joker name that matches a typed squad name', () => {
    prepareSetup(' a1 ')
    useMatchStore.getState().startMatch()
    expect(useMatchStore.getState().match).toBeNull()
  })

  it('marks joker and captain on both innings summary rows and preserves old and joker matches on resume and backup import', () => {
    const match = makeMatch()
    const firstInnings = innings('t1', 't2', [{ id: 'o', type: 'openers', strikerId: 'joker', nonStrikerId: 'a1' }])
    const firstRows = getInningsSummary(match, [firstInnings], 0).batting
    expect(firstRows.find((row) => row.id === 'joker')).toMatchObject({ isJoker: true, isCaptain: false })
    expect(firstRows.find((row) => row.id === 'a1')).toMatchObject({ isJoker: false, isCaptain: true })
    const bowlingRows = getInningsSummary(match, [innings('t1', 't2', [
      { id: 'o-bowl', type: 'openers', strikerId: 'a1', nonStrikerId: 'a2' },
      { id: 'b-bowl', type: 'ball', bowlerId: 'joker', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
    ])], 0).bowling
    expect(bowlingRows.find((row) => row.id === 'joker')).toMatchObject({ isJoker: true, isCaptain: false })
    expect(rulesFromMatch({ ...match, joker: undefined }).jokerEnabled).toBe(false)

    const oldMatch = { ...match, joker: undefined }
    saveCurrentMatch({ match: oldMatch, innings: [firstInnings], currentInningsIndex: 0, matchStatus: 'live' })
    useMatchStore.getState().initApp()
    useMatchStore.getState().resumeMatch()
    expect(useMatchStore.getState().screen).toBe('live')
    expect(getInningsSummary(oldMatch, [firstInnings], 0).runs).toBe(0)

    const historyEntry = {
      id: 'joker-history', date: '2025-01-01T00:00:00.000Z', winnerName: 'Team 1', resultText: 'won',
      team1Name: 'Team 1', team1Score: '0 / 0', team2Name: 'Team 2', team2Score: '0 / 0', match,
      innings: [firstInnings, innings('t2', 't1', [])],
    }
    useMatchStore.setState({ matchHistory: [historyEntry], playerPool: [], savedTeams: [] })
    const backup = useMatchStore.getState().exportHistoryBackup()
    useMatchStore.setState({ matchHistory: [], match: null, innings: [], matchStatus: 'setup' })
    expect(useMatchStore.getState().importHistoryBackup(backup).ok).toBe(true)
    expect(useMatchStore.getState().matchHistory[0]?.match?.joker).toEqual(match.joker)
    saveCurrentMatch({ match, innings: [firstInnings], currentInningsIndex: 0, matchStatus: 'live' })
    useMatchStore.getState().initApp()
    useMatchStore.getState().resumeMatch()
    expect(useMatchStore.getState().match?.joker).toEqual(match.joker)
  })
})
