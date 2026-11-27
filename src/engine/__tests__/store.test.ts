import { beforeEach, describe, expect, it } from 'vitest'
import { deriveForInnings } from '../adapter'
import { getInningsSummary, getMatchResultFromState, getPlayerOfTheMatch, getRequiredInfo } from '../views'
import { buildBallFromEditor } from '../ballEditor'
import { useMatchStore } from '../../store/matchStore'
import { loadCurrentMatch, migrateLegacyInnings } from '../../store/persistence'
import { MATCH_HISTORY_KEY } from '../../store/persistence'
import { buildBackup } from '../../store/backup'
import type { Ball, Innings, Match, Team, WicketType } from '../../types'

// Mock localStorage for node environment
const mockStorage: Record<string, string> = {}
globalThis.localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value
  },
  removeItem: (key: string) => {
    delete mockStorage[key]
  },
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
  },
  length: 0,
  key: () => null,
} as unknown as Storage

function setupTestMatch(overs = 2, wicketLimit = 3, playersPerTeam = 4) {
  useMatchStore.getState().updateSetupDraft({
    title: 'Test Match',
    overs,
    wicketLimit,
    playersPerTeam,
    team1Name: 'Team Alpha',
    team1Players: Array.from({ length: playersPerTeam }, (_, i) => `A${i + 1}`),
    team2Name: 'Team Beta',
    team2Players: Array.from({ length: playersPerTeam }, (_, i) => `B${i + 1}`),
    tossWinnerTeam: 1,
    tossChoice: 'bat',
  })
  useMatchStore.getState().startMatch()
}

function finishChasingMatch(firstRuns: number, chaseRuns: number[]) {
  setupTestMatch(2, 3)
  let store = useMatchStore.getState()
  let match = store.match!
  store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
  store.selectBowler(match.team2.players[0]!.id)
  if (firstRuns > 0) store.recordRun(firstRuns)
  store.endInningsEarly()
  store.startSecondInnings()
  store = useMatchStore.getState()
  match = store.match!
  store.selectOpeningBatsmen(match.team2.players[0]!.id, match.team2.players[1]!.id)
  store.selectBowler(match.team1.players[0]!.id)
  chaseRuns.forEach((runs) => useMatchStore.getState().recordRun(runs))
  return useMatchStore.getState().matchHistory[0]!
}

describe('Store & Engine Integration (Task 4)', () => {
  beforeEach(() => {
    mockStorage['boxscore_current_match'] = ''
    delete mockStorage['boxscore_current_match']
    delete mockStorage['boxscore_match_history']
  })

  it('undoes and redoes the first-innings final ball across the innings break', () => {
    setupTestMatch(1, 3)
    let store = useMatchStore.getState()
    const match = store.match!
    const [striker, nonStriker] = match.team1.players
    const bowler = match.team2.players[0]!
    store.selectOpeningBatsmen(striker!.id, nonStriker!.id)
    store.selectBowler(bowler.id)
    store.recordRun(1)
    for (let index = 0; index < 5; index++) store.recordRun(0)
    expect(useMatchStore.getState().matchStatus).toBe('innings_break')

    store = useMatchStore.getState()
    store.undoLastBall()
    let state = useMatchStore.getState()
    expect(state.matchStatus).toBe('live')
    expect(state.currentInningsIndex).toBe(0)
    expect(getInningsSummary(match, state.innings, 0).legalBalls).toBe(5)
    expect(state.innings[0]!.currentBatsmanIds).toEqual([nonStriker!.id, striker!.id])
    expect(state.innings[0]!.currentBowlerId).toBe(bowler.id)

    state.redoLastBall()
    expect(useMatchStore.getState().matchStatus).toBe('innings_break')
    useMatchStore.getState().undoLastBall()
    useMatchStore.getState().undoLastBall()
    state = useMatchStore.getState()
    expect(state.currentInningsIndex).toBe(0)
    expect(getInningsSummary(match, state.innings, 0).legalBalls).toBe(4)
    expect(state.redoStack).toHaveLength(2)
  })

  it('uses the corrected first-innings score as the second-innings target after an across-break undo', () => {
    setupTestMatch(1, 3)
    const store = useMatchStore.getState()
    const match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.selectBowler(match.team2.players[0]!.id)
    store.recordRun(1)
    for (let index = 0; index < 5; index++) store.recordRun(0)
    store.undoLastBall()
    store.recordRun(4)
    expect(useMatchStore.getState().matchStatus).toBe('innings_break')
    store.startSecondInnings()
    const state = useMatchStore.getState()
    expect(getRequiredInfo(state.match!, state.innings)?.target).toBe(6)
  })

  it('discards an unstarted second innings on undo and allows it to be started again', () => {
    setupTestMatch()
    let store = useMatchStore.getState()
    const match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.endInningsEarly()
    store.startSecondInnings()
    store = useMatchStore.getState()
    store.selectOpeningBatsmen(match.team2.players[0]!.id, match.team2.players[1]!.id)
    expect(useMatchStore.getState().innings[1]!.events).toHaveLength(1)
    store.undoLastBall()
    expect(useMatchStore.getState().matchStatus).toBe('innings_break')
    expect(useMatchStore.getState().currentInningsIndex).toBe(0)
    expect(useMatchStore.getState().innings).toHaveLength(1)
    useMatchStore.getState().startSecondInnings()
    expect(useMatchStore.getState().currentInningsIndex).toBe(1)
    expect(useMatchStore.getState().matchStatus).toBe('live')
  })

  it('keeps openers when undo is used before any first-innings ball', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const openerIds = [match.team1.players[0]!.id, match.team1.players[1]!.id]
    store.selectOpeningBatsmen(openerIds[0]!, openerIds[1]!)
    const before = useMatchStore.getState().innings
    store.undoLastBall()
    expect(useMatchStore.getState().innings).toEqual(before)
    expect(useMatchStore.getState().innings[0]!.currentBatsmanIds).toEqual(openerIds)
  })

  it('reopens a won chase, removes the history entry, and redo finishes with one history entry', () => {
    const finished = finishChasingMatch(0, [1])
    expect(finished).toBeDefined()
    expect(JSON.parse(mockStorage[MATCH_HISTORY_KEY]!).schemaVersion).toBe(1)
    const originalText = finished.resultText
    const result = useMatchStore.getState().reopenFinishedMatch(finished.id)
    expect(result.ok).toBe(true)
    expect(JSON.parse(mockStorage[MATCH_HISTORY_KEY]!)).toMatchObject({ schemaVersion: 1, matches: [] })
    let state = useMatchStore.getState()
    expect(state.matchStatus).toBe('live')
    expect(state.currentInningsIndex).toBe(1)
    expect(state.matchHistory.some((entry) => entry.id === finished.id)).toBe(false)
    expect(state.redoStack).toHaveLength(1)
    expect(getInningsSummary(state.match!, state.innings, 1).runs).toBe(0)
    state.redoLastBall()
    state = useMatchStore.getState()
    expect(state.matchStatus).toBe('complete')
    expect(state.matchHistory).toHaveLength(1)
    expect(state.matchHistory[0]!.resultText).toBe(originalText)
    expect(JSON.parse(mockStorage[MATCH_HISTORY_KEY]!).schemaVersion).toBe(1)
  })

  it('reopens, edits a chase ball, and records the corrected score when the match finishes', () => {
    const finished = finishChasingMatch(2, [1, 2])
    expect(useMatchStore.getState().reopenFinishedMatch(finished.id).ok).toBe(true)
    let state = useMatchStore.getState()
    const firstChaseBall = state.innings[1]!.events!.find((event) => event.type === 'ball')
    if (!firstChaseBall || firstChaseBall.type !== 'ball') throw new Error('Expected a chase ball')
    expect(state.editEvent(firstChaseBall.id, { ...firstChaseBall, batRuns: 2 }).ok).toBe(true)
    useMatchStore.getState().recordRun(1)
    state = useMatchStore.getState()
    expect(state.matchStatus).toBe('complete')
    expect(state.matchHistory).toHaveLength(1)
    expect(state.matchHistory[0]!.team2Score).toBe('3 / 0')
  })

  it('reopening a match ending with endInnings removes that event', () => {
    setupTestMatch()
    let store = useMatchStore.getState()
    let match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.endInningsEarly()
    store.startSecondInnings()
    store = useMatchStore.getState()
    match = store.match!
    store.selectOpeningBatsmen(match.team2.players[0]!.id, match.team2.players[1]!.id)
    store.endInningsEarly()
    const finished = useMatchStore.getState().matchHistory[0]!
    expect(finished.innings?.[1]?.events?.at(-1)?.type).toBe('endInnings')
    expect(useMatchStore.getState().reopenFinishedMatch(finished.id).ok).toBe(true)
    const reopened = useMatchStore.getState()
    expect(reopened.innings[1]!.events!.some((event) => event.type === 'endInnings')).toBe(false)
    expect(reopened.redoStack.at(-1)?.type).toBe('endInnings')
  })

  it('rejects reopening during a match, for unknown IDs, and for old entries without event logs', () => {
    const finished = finishChasingMatch(0, [1])
    setupTestMatch()
    expect(useMatchStore.getState().reopenFinishedMatch(finished.id).ok).toBe(false)
    expect(useMatchStore.getState().reopenFinishedMatch('unknown-id').ok).toBe(false)

    const oldEntry = {
      ...finished,
      id: 'old-entry',
      innings: finished.innings!.map((inn) =>
        Object.fromEntries(Object.entries(inn).filter(([key]) => key !== 'events')) as Innings,
      ),
    }
    mockStorage['boxscore_match_history'] = JSON.stringify([oldEntry])
    mockStorage['boxscore_current_match'] = ''
    useMatchStore.setState({ match: null, innings: [], matchStatus: 'setup' })
    expect(useMatchStore.getState().reopenFinishedMatch(oldEntry.id).ok).toBe(false)
  })

  it('restores the reopened live match from storage for resume', () => {
    const finished = finishChasingMatch(0, [1])
    useMatchStore.getState().reopenFinishedMatch(finished.id)
    const saved = loadCurrentMatch()
    expect(saved?.currentInningsIndex).toBe(1)
    expect(saved?.matchStatus).toBe('live')
    expect(saved?.innings[1]?.events?.some((event) => event.type === 'ball')).toBe(false)
    useMatchStore.setState({ match: null, innings: [], currentInningsIndex: 0, matchStatus: 'setup' })
    useMatchStore.getState().initApp()
    expect(useMatchStore.getState().matchStatus).toBe('live')
    expect(useMatchStore.getState().currentInningsIndex).toBe(1)
  })

  it('imports history backups by merging, persisting, and skipping duplicate ids', () => {
    const finished = finishChasingMatch(0, [1])
    const imported = [
      { ...finished, id: 'import-newer', date: '2027-02-01T00:00:00.000Z' },
      { ...finished, id: 'import-older', date: '2025-02-01T00:00:00.000Z' },
    ]
    const text = buildBackup(imported)
    expect(useMatchStore.getState().importHistoryBackup(text)).toMatchObject({ ok: true, added: 2, skipped: 0 })
    expect(useMatchStore.getState().matchHistory.map((entry) => entry.id)).toEqual([
      'import-newer', finished.id, 'import-older',
    ])
    expect(JSON.parse(mockStorage[MATCH_HISTORY_KEY]!).schemaVersion).toBe(1)
    expect(useMatchStore.getState().importHistoryBackup(text)).toMatchObject({ ok: true, added: 0, skipped: 2 })
  })

  it('adds players with unique trimmed names, updates squad size, and derives all-out from the real squad', () => {
    setupTestMatch(2, 5)
    const store = useMatchStore.getState()
    const match = store.match!
    expect(store.addPlayer(match.team1.id, '   ')).toMatchObject({ ok: false })
    expect(store.addPlayer(match.team1.id, ' A1 ')).toMatchObject({ ok: false })
    expect(store.addPlayer(match.team1.id, 'a1')).toMatchObject({ ok: false })
    const added = store.addPlayer(match.team1.id, ' A5 ')
    expect(added.ok).toBe(true)
    const updated = useMatchStore.getState().match!
    expect(updated.team1.players).toHaveLength(5)
    expect(updated.team1.players[4]).toMatchObject({ name: 'A5' })
    expect(updated.team1.players[4]!.id).not.toBe(match.team1.players[0].id)
    expect(updated.playersPerTeam).toBe(5)
    expect(updated.team2.players).toHaveLength(4)
    expect(store.addPlayer(match.team2.id, 'B5').ok).toBe(true)
    expect(useMatchStore.getState().match!.playersPerTeam).toBe(5)
    const wickets = [
      { kind: 'bowled' as const, outId: updated.team1.players[0]!.id, newBatterId: updated.team1.players[2]!.id },
      { kind: 'runOut' as const, outId: updated.team1.players[1]!.id, newBatterId: updated.team1.players[3]!.id },
      { kind: 'bowled' as const, outId: updated.team1.players[2]!.id, newBatterId: updated.team1.players[4]!.id },
      { kind: 'bowled' as const, outId: updated.team1.players[4]!.id },
    ]
    const events = wickets.map((wicket, index) => ({
      id: `out-${index}`, type: 'ball' as const, bowlerId: updated.team2.players[0]!.id,
      delivery: 'legal' as const, batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket,
    }))
    const makeInnings = (wicketEvents: typeof events) => [{
      battingTeamId: updated.team1.id, bowlingTeamId: updated.team2.id, events: [
        { id: 'open', type: 'openers' as const, strikerId: updated.team1.players[0]!.id, nonStrikerId: updated.team1.players[1]!.id }, ...wicketEvents,
      ], currentBatsmanIds: ['', ''] as [string, string], currentBowlerId: '', status: 'live' as const, pendingBowlerSelection: false,
    }]
    const derived = deriveForInnings(updated, makeInnings(events.slice(0, 3)), 0)
    expect(derived.isComplete).toBe(false)
    expect(derived.score.wickets).toBe(3)
    expect(deriveForInnings(updated, makeInnings(events), 0).isComplete).toBe(true)
  })

  it('lets added players bat, bowl, field, and removes only uninvolved players', () => {
    setupTestMatch()
    let store = useMatchStore.getState()
    let match = store.match!
    const [batter, partner] = match.team1.players
    const unused = match.team1.players[2]!
    const newBatter = store.addPlayer(match.team1.id, 'A5')
    const newBowler = store.addPlayer(match.team2.id, 'B5')
    expect(newBatter.ok && newBowler.ok).toBe(true)
    match = useMatchStore.getState().match!
    const incoming = match.team1.players[4]!
    const fielderAndBowler = match.team2.players[4]!
    store = useMatchStore.getState()
    store.selectOpeningBatsmen(batter.id, partner.id)
    store.selectBowler(fielderAndBowler.id)
    store.recordWicket('caught', batter.id, incoming.id, { fielderId: fielderAndBowler.id })
    const summary = getInningsSummary(match, useMatchStore.getState().innings, 0)
    expect(summary.batting.find((player) => player.id === incoming.id)?.status).toBe('batting')
    const ball = useMatchStore.getState().innings[0]!.events!.find((event) => event.type === 'ball')
    expect(ball?.type === 'ball' ? ball.bowlerId : '').toBe(fielderAndBowler.id)
    expect(ball?.type === 'ball' ? ball.wicket?.fielderId : '').toBe(fielderAndBowler.id)
    for (let index = 0; index < 5; index++) store.recordRun(0)
    expect(getInningsSummary(match, useMatchStore.getState().innings, 0).bowling.find((bowler) => bowler.id === fielderAndBowler.id)?.oversDisplay).toBe('1.0')
    expect(useMatchStore.getState().removePlayer(match.team1.id, unused.id).ok).toBe(true)
  })

  it('removes only uninvolved players and enforces the two-player minimum', () => {
    setupTestMatch()
    let store = useMatchStore.getState()
    let match = store.match!
    const [b1, b2, b3] = match.team1.players
    store.selectOpeningBatsmen(b1.id, b2.id)
    expect(useMatchStore.getState().removePlayer(match.team1.id, b3.id).ok).toBe(true)
    expect(useMatchStore.getState().removePlayer(match.team1.id, b1.id).error).toBe('Already batted, bowled or fielded')

    setupTestMatch()
    store = useMatchStore.getState()
    match = store.match!
    const striker = match.team1.players[0]!
    const nonStriker = match.team1.players[1]!
    const incoming = match.team1.players[3]!
    const [fieldingBowler, fielder] = match.team2.players
    store.selectOpeningBatsmen(striker.id, nonStriker.id)
    store.selectBowler(fieldingBowler.id)
    store.recordWicket('caught', striker.id, incoming.id, { fielderId: fielder.id })
    expect(useMatchStore.getState().removePlayer(match.team2.id, fieldingBowler.id).error).toBe('Already batted, bowled or fielded')
    expect(useMatchStore.getState().removePlayer(match.team2.id, fielder.id).error).toBe('Already batted, bowled or fielded')
    expect(useMatchStore.getState().removePlayer(match.team1.id, incoming.id).error).toBe('Already batted, bowled or fielded')

    setupTestMatch(2, 1, 2)
    store = useMatchStore.getState()
    match = store.match!
    useMatchStore.setState({ innings: [{ ...useMatchStore.getState().innings[0]!, currentBatsmanIds: ['', ''] }] })
    expect(useMatchStore.getState().removePlayer(match.team1.id, match.team1.players[1]!.id).error)
      .toBe('Each team must have at least 2 players')
  })

  it('validates settings, re-derives innings, and completes at the new overs limit', () => {
    setupTestMatch(2, 3)
    let store = useMatchStore.getState()
    let match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.selectBowler(match.team2.players[0]!.id)
    store.recordRun(0)
    expect(useMatchStore.getState().updateMatchSettings({ overs: 3 }).ok).toBe(true)
    expect(useMatchStore.getState().matchStatus).toBe('live')

    setupTestMatch(2, 3)
    store = useMatchStore.getState()
    match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    for (let index = 0; index < 6; index++) {
      if (useMatchStore.getState().innings[0]!.pendingBowlerSelection) store.selectBowler(match.team2.players[Math.floor(index / 6)]!.id)
      store.recordRun(0)
    }
    expect(useMatchStore.getState().updateMatchSettings({ overs: 1 }).ok).toBe(true)
    expect(useMatchStore.getState().matchStatus).toBe('innings_break')

    setupTestMatch(2, 3)
    store = useMatchStore.getState()
    match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.selectBowler(match.team2.players[0]!.id)
    for (let index = 0; index < 6; index++) store.recordRun(0)
    store.selectBowler(match.team2.players[1]!.id)
    store.recordRun(0)
    const before = useMatchStore.getState()
    const rejected = before.updateMatchSettings({ overs: 1 })
    expect(rejected.ok).toBe(false)
    expect(useMatchStore.getState().match?.overs).toBe(2)
    expect(useMatchStore.getState().innings).toEqual(before.innings)

    setupTestMatch(3, 3)
    store = useMatchStore.getState()
    match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.selectBowler(match.team2.players[0]!.id)
    store.recordWicket('bowled', match.team1.players[0]!.id, match.team1.players[2]!.id)
    store.recordWicket('bowled', match.team1.players[2]!.id, match.team1.players[3]!.id)
    expect(useMatchStore.getState().updateMatchSettings({ wicketLimit: 1 }).ok).toBe(false)
    expect(useMatchStore.getState().updateMatchSettings({ wicketLimit: 4 }).ok).toBe(true)
  })

  it('protects finished innings reasons, preserves second-innings target, and persists settings and players', () => {
    setupTestMatch(1, 3)
    let store = useMatchStore.getState()
    let match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.selectBowler(match.team2.players[0]!.id)
    for (let index = 0; index < 6; index++) store.recordRun(index === 0 ? 3 : 0)
    store.startSecondInnings()
    match = useMatchStore.getState().match!
    const firstTarget = getRequiredInfo(match, useMatchStore.getState().innings)?.runs
    expect(useMatchStore.getState().updateMatchSettings({ overs: 2 }).error)
      .toBe('That would change an innings that is already finished')
    expect(useMatchStore.getState().updateMatchSettings({ wicketLimit: 4 }).ok).toBe(true)
    expect(getRequiredInfo(match, useMatchStore.getState().innings)?.runs).toBe(firstTarget)

    setupTestMatch(1, 1, 2)
    store = useMatchStore.getState()
    match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.selectBowler(match.team2.players[0]!.id)
    store.recordWicket('bowled', match.team1.players[0]!.id, '')
    store.startSecondInnings()
    expect(useMatchStore.getState().updateMatchSettings({ overs: 2 }).ok).toBe(true)

    expect(useMatchStore.getState().addPlayer(match.team1.id, 'Persisted Player').ok).toBe(true)
    const saved = loadCurrentMatch()
    expect(saved?.match?.overs).toBe(2)
    expect(saved?.match?.team1.players.at(-1)?.name).toBe('Persisted Player')
    useMatchStore.setState({ match: null, innings: [], currentInningsIndex: 0, matchStatus: 'setup' })
    useMatchStore.getState().initApp()
    expect(useMatchStore.getState().match?.team1.players.at(-1)?.name).toBe('Persisted Player')
    expect(useMatchStore.getState().match?.overs).toBe(2)
  })

  it('uses the expanded chasing squad size for the result wicket margin', () => {
    setupTestMatch(2, 5)
    const store = useMatchStore.getState()
    const original = store.match!
    expect(store.addPlayer(original.team2.id, 'B5').ok).toBe(true)
    const match = useMatchStore.getState().match!
    const [a1, a2] = match.team1.players
    const [b1, b2, b3, b4, b5] = match.team2.players
    const firstInnings: Innings = {
      battingTeamId: match.team1.id, bowlingTeamId: match.team2.id,
      events: [
        { id: 'first-open', type: 'openers', strikerId: a1!.id, nonStrikerId: a2!.id },
        { id: 'first-score', type: 'ball', bowlerId: b1!.id, delivery: 'legal', batRuns: 2, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      ], currentBatsmanIds: ['', ''], currentBowlerId: b1!.id, status: 'complete', pendingBowlerSelection: false,
    }
    const secondInnings: Innings = {
      battingTeamId: match.team2.id, bowlingTeamId: match.team1.id,
      events: [
        { id: 'second-open', type: 'openers', strikerId: b1!.id, nonStrikerId: b2!.id },
        { id: 'second-score', type: 'ball', bowlerId: a1!.id, delivery: 'legal', batRuns: 2, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
        { id: 'w1', type: 'ball', bowlerId: a1!.id, delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'bowled', outId: b1!.id, newBatterId: b3!.id } },
        { id: 'w2', type: 'ball', bowlerId: a1!.id, delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'runOut', outId: b2!.id, newBatterId: b4!.id } },
        { id: 'w3', type: 'ball', bowlerId: a1!.id, delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'bowled', outId: b3!.id, newBatterId: b5!.id } },
        { id: 'chase', type: 'ball', bowlerId: a1!.id, delivery: 'legal', batRuns: 1, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      ], currentBatsmanIds: ['', ''], currentBowlerId: a1!.id, status: 'complete', pendingBowlerSelection: false,
    }
    expect(getMatchResultFromState(match, [firstInnings, secondInnings]).text).toContain('Team Beta won by 1 wicket')
  })

  it('keeps undo and redo usable after player/settings changes and preserves rename ids and order', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    let match = store.match!
    const originalIds = match.team1.players.map((player) => player.id)
    store.selectOpeningBatsmen(match.team1.players[0]!.id, match.team1.players[1]!.id)
    store.selectBowler(match.team2.players[0]!.id)
    store.recordRun(1)
    store.updateLiveMatchNames('Renamed Alpha', ['X1', 'X2', 'X3', 'X4'], 'Team Beta', ['B1', 'B2', 'B3', 'B4'])
    match = useMatchStore.getState().match!
    expect(match.team1.players.map((player) => player.id)).toEqual(originalIds)
    expect(match.team1.players.map((player) => player.name)).toEqual(['X1', 'X2', 'X3', 'X4'])
    expect(useMatchStore.getState().addPlayer(match.team1.id, 'A5').ok).toBe(true)
    useMatchStore.getState().undoLastBall()
    useMatchStore.getState().redoLastBall()
    expect(getInningsSummary(useMatchStore.getState().match!, useMatchStore.getState().innings, 0).runs).toBe(1)
    expect(useMatchStore.getState().updateMatchSettings({ overs: 3 }).ok).toBe(true)
    if (useMatchStore.getState().innings[0]!.pendingBowlerSelection) {
      useMatchStore.getState().selectBowler(match.team2.players[0]!.id)
    }
    useMatchStore.getState().recordRun(2)
    useMatchStore.getState().undoLastBall()
    useMatchStore.getState().redoLastBall()
    expect(getInningsSummary(useMatchStore.getState().match!, useMatchStore.getState().innings, 0).runs).toBe(3)
  })

  it('redo restores the identical event log after a wicket and across an over boundary', () => {
    setupTestMatch(2, 3)
    let store = useMatchStore.getState()
    let match = store.match!
    const [p1, p2, p3] = match.team1.players
    store.selectOpeningBatsmen(p1.id, p2.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordWicket('caught', p1.id, p3.id)
    const wicketState = useMatchStore.getState()
    const wicketEvents = wicketState.innings[0].events
    const wicketBatsmen = wicketState.innings[0].currentBatsmanIds
    store.undoLastBall()
    store.redoLastBall()
    expect(useMatchStore.getState().innings[0].events).toEqual(wicketEvents)
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual(wicketBatsmen)

    setupTestMatch(2, 3)
    store = useMatchStore.getState()
    match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    for (let i = 0; i < 6; i++) store.recordRun(0)
    const beforeUndo = useMatchStore.getState().innings[0]
    store.undoLastBall()
    store.redoLastBall()
    const afterRedo = useMatchStore.getState().innings[0]
    expect(afterRedo.events).toEqual(beforeUndo.events)
    expect(afterRedo.pendingBowlerSelection).toBe(beforeUndo.pendingBowlerSelection)
    expect(afterRedo.currentBowlerId).toBe(beforeUndo.currentBowlerId)
  })

  it('any new scoring or administrative event clears redo history', () => {
    const runKinds = ['recordDelivery', 'recordWicket', 'swapBatsmen', 'retireBatsman', 'endInningsEarly', 'selectOpeningBatsmen'] as const
    for (const kind of runKinds) {
      setupTestMatch()
      const store = useMatchStore.getState()
      const match = store.match!
      const [p1, p2, p3] = match.team1.players
      store.selectOpeningBatsmen(p1.id, p2.id)
      store.selectBowler(match.team2.players[0].id)
      store.recordRun(0)
      store.undoLastBall()
      store.selectBowler(match.team2.players[0].id)
      if (kind === 'recordDelivery') store.recordDelivery({ delivery: 'legal', batRuns: 1 })
      else if (kind === 'recordWicket') store.recordWicket('bowled', p1.id, p3.id)
      else if (kind === 'swapBatsmen') store.swapBatsmen()
      else if (kind === 'retireBatsman') store.retireBatsman(true, p3.id)
      else if (kind === 'endInningsEarly') store.endInningsEarly()
      else store.selectOpeningBatsmen(p1.id, p2.id)
      expect(useMatchStore.getState().redoStack).toEqual([])
    }
  })

  it('deleting a past dot preserves score and strike except for the ball count', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [p1, p2] = match.team1.players
    store.selectOpeningBatsmen(p1.id, p2.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordRun(1)
    store.recordRun(0)
    store.recordRun(4)
    const before = useMatchStore.getState().innings[0]
    const dotId = before.events?.find((event) => event.type === 'ball' && event.batRuns === 0)?.id
    const result = store.deleteEvent(dotId!)
    const after = useMatchStore.getState().innings[0]
    expect(result.ok).toBe(true)
    expect(getInningsSummary(match, [after], 0).runs).toBe(5)
    expect(getInningsSummary(match, [after], 0).legalBalls).toBe(2)
    expect(after.currentBatsmanIds).toEqual(before.currentBatsmanIds)
  })

  it('deleting a past four reduces score and recomputes strike', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [p1, p2] = match.team1.players
    store.selectOpeningBatsmen(p1.id, p2.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordRun(4)
    store.recordRun(1)
    const state = useMatchStore.getState()
    const fourId = state.innings[0].events?.find((event) => event.type === 'ball' && event.batRuns === 4)?.id
    expect(store.deleteEvent(fourId!).ok).toBe(true)
    const after = useMatchStore.getState().innings[0]
    expect(getInningsSummary(match, [after], 0).runs).toBe(1)
    expect(after.currentBatsmanIds).toEqual([p2.id, p1.id])
  })

  it('deleting swapEnds restores the original striker', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [p1, p2] = match.team1.players
    store.selectOpeningBatsmen(p1.id, p2.id)
    store.swapBatsmen()
    const swap = useMatchStore.getState().innings[0].events?.find((event) => event.type === 'swapEnds')
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p2.id, p1.id])
    expect(store.deleteEvent(swap!.id).ok).toBe(true)
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p1.id, p2.id])
  })

  it('rejects deleting a wicket needed for a later dismissal', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [p1, p2, p3, p4] = match.team1.players
    store.selectOpeningBatsmen(p1.id, p2.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordWicket('bowled', p1.id, p3.id)
    store.recordWicket('bowled', p3.id, p4.id)
    const before = useMatchStore.getState().innings[0]
    const firstWicketId = before.events?.find((event) => event.type === 'ball')?.id
    const result = store.deleteEvent(firstWicketId!)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(useMatchStore.getState().innings[0].events).toEqual(before.events)
  })

  it('rejects deleting openers; deleting a live second-innings event leaves the first innings intact', () => {
    setupTestMatch(1, 3)
    let store = useMatchStore.getState()
    let match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    const openerId = useMatchStore.getState().innings[0].events?.[0].id
    expect(store.deleteEvent(openerId!).ok).toBe(false)
    store.endInningsEarly()
    const endEventId = useMatchStore.getState().innings[0].events?.find((event) => event.type === 'endInnings')?.id
    expect(store.deleteEvent(endEventId!).ok).toBe(false)
    store.startSecondInnings()
    store = useMatchStore.getState()
    match = store.match!
    const firstInningsEvents = store.innings[0].events
    store.selectOpeningBatsmen(match.team2.players[0].id, match.team2.players[1].id)
    store.selectBowler(match.team1.players[0].id)
    store.recordRun(0)
    const secondBallId = useMatchStore.getState().innings[1].events?.find((event) => event.type === 'ball')?.id
    expect(store.deleteEvent(secondBallId!).ok).toBe(true)
    expect(useMatchStore.getState().innings[0].events).toEqual(firstInningsEvents)
  })

  it('undo after deletion removes the new last event and redo restores it; deletion does not add redo history', () => {
    setupTestMatch()
    let store = useMatchStore.getState()
    let match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    store.recordRun(1)
    store.recordRun(2)
    let events = useMatchStore.getState().innings[0].events!
    const firstBallId = events.find((event) => event.type === 'ball')!.id
    expect(store.deleteEvent(firstBallId).ok).toBe(true)
    store.undoLastBall()
    expect(useMatchStore.getState().innings[0].events?.filter((event) => event.type === 'ball')).toHaveLength(0)
    store.redoLastBall()
    expect(useMatchStore.getState().innings[0].events?.filter((event) => event.type === 'ball')).toHaveLength(1)

    setupTestMatch()
    store = useMatchStore.getState()
    match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    store.recordRun(1)
    store.recordRun(2)
    events = useMatchStore.getState().innings[0].events!
    const deletableBallId = events.find((event) => event.type === 'ball')!.id
    store.undoLastBall()
    expect(useMatchStore.getState().redoStack).toHaveLength(1)
    expect(store.deleteEvent(deletableBallId).ok).toBe(true)
    expect(useMatchStore.getState().redoStack).toEqual([])
  })

  it('recordDelivery creates one no-ball event with bat runs and a free hit', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    store.recordDelivery({ delivery: 'noBall', batRuns: 4 })
    const state = useMatchStore.getState()
    const summary = getInningsSummary(match, state.innings, 0)
    const derived = deriveForInnings(match, state.innings, 0)
    expect(state.innings[0].events?.filter((event) => event.type === 'ball')).toHaveLength(1)
    expect(summary.runs).toBe(5)
    expect(summary.legalBalls).toBe(0)
    expect(summary.batting[0]).toMatchObject({ runs: 4, balls: 1, fours: 1 })
    expect(summary.bowling[0].runs).toBe(5)
    expect(derived.isFreeHitNext).toBe(true)
  })

  it('getInningsSummary reports a four-bye as uncharged to the bowler and faced by the batter', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    store.recordDelivery({ delivery: 'legal', byeRuns: 4 })
    const summary = getInningsSummary(match, useMatchStore.getState().innings, 0)
    expect(summary.runs).toBe(4)
    expect(summary.bowling[0].runs).toBe(0)
    expect(summary.batting[0].balls).toBe(1)
  })

  it('undo restores score, strike, and free-hit state after no-ball plus four', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    const priorStrike = useMatchStore.getState().innings[0].currentBatsmanIds
    store.recordDelivery({ delivery: 'noBall', batRuns: 4 })
    store.undoLastBall()
    const state = useMatchStore.getState()
    expect(getInningsSummary(match, state.innings, 0).runs).toBe(0)
    expect(state.innings[0].currentBatsmanIds).toEqual(priorStrike)
    expect(deriveForInnings(match, state.innings, 0).isFreeHitNext).toBe(false)
  })

  it('records a no-ball run-out with one completed run as one legal-ball-free event', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [striker, nonStriker, incoming] = match.team1.players
    const bowler = match.team2.players[0]
    store.selectOpeningBatsmen(striker.id, nonStriker.id)
    store.selectBowler(bowler.id)
    store.recordWicket('runOut', striker.id, incoming.id, { delivery: 'noBall', batRuns: 1 })
    const state = useMatchStore.getState()
    const summary = getInningsSummary(match, state.innings, 0)
    expect(state.innings[0].events?.filter((event) => event.type === 'ball')).toHaveLength(1)
    expect(summary.runs).toBe(2)
    expect(summary.legalBalls).toBe(0)
    expect(summary.bowling[0].runs).toBe(2)
    expect(summary.bowling[0].wickets).toBe(0)
    expect(state.innings[0].currentBatsmanIds).toEqual([nonStriker.id, incoming.id])
  })

  it('records a stumping on a plain wide with keeper credit and fielder text', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    store.updateLiveMatchNames('Team Alpha', ['A1', 'A2', 'A3', 'A4'], 'Team Beta', ['Kiran', 'Ravi', 'B3', 'B4'])
    const match = useMatchStore.getState().match!
    const [striker, nonStriker, incoming] = match.team1.players
    const [bowler, keeper] = match.team2.players
    useMatchStore.getState().selectOpeningBatsmen(striker.id, nonStriker.id)
    useMatchStore.getState().selectBowler(bowler.id)
    useMatchStore.getState().recordWicket('stumped', striker.id, incoming.id, { delivery: 'wide', wideExtraRuns: 0, fielderId: keeper.id })
    const state = useMatchStore.getState()
    const summary = getInningsSummary(match, state.innings, 0)
    expect(summary.runs).toBe(1)
    expect(summary.legalBalls).toBe(0)
    expect(summary.bowling[0].wickets).toBe(1)
    expect(summary.batting.find((batter) => batter.id === striker.id)?.dismissalText).toBe('st Ravi b Kiran')
  })

  it('rejects bowled wickets on no-ball and free hit but accepts run-out on free hit', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [striker, nonStriker, incoming] = match.team1.players
    store.selectOpeningBatsmen(striker.id, nonStriker.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordWicket('bowled', striker.id, incoming.id, { delivery: 'noBall' })
    expect(useMatchStore.getState().innings[0].events?.filter((event) => event.type === 'ball')).toHaveLength(0)

    store.recordDelivery({ delivery: 'noBall', batRuns: 0 })
    const afterNoBall = useMatchStore.getState().innings[0].events?.length
    store.recordWicket('bowled', striker.id, incoming.id)
    expect(useMatchStore.getState().innings[0].events).toHaveLength(afterNoBall ?? 0)
    store.recordWicket('runOut', striker.id, incoming.id)
    expect(useMatchStore.getState().innings[0].events?.filter((event) => event.type === 'ball')).toHaveLength(2)
  })

  it('records two completed legal run-out runs without crediting the bowler or changing striker ends', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [striker, nonStriker, incoming] = match.team1.players
    store.selectOpeningBatsmen(striker.id, nonStriker.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordWicket('runOut', striker.id, incoming.id, { delivery: 'legal', batRuns: 2 })
    const state = useMatchStore.getState()
    const summary = getInningsSummary(match, state.innings, 0)
    expect(summary.runs).toBe(2)
    expect(summary.bowling[0].wickets).toBe(0)
    expect(state.innings[0].currentBatsmanIds).toEqual([incoming.id, nonStriker.id])
  })

  it('rejects invalid wicket combinations and restores innings state when undoing a wicket extra', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [striker, nonStriker, incoming] = match.team1.players
    store.selectOpeningBatsmen(striker.id, nonStriker.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordWicket('caught', striker.id, incoming.id, { batRuns: 1 })
    store.recordWicket('runOut', incoming.id, incoming.id)
    store.recordWicket('bowled', nonStriker.id, incoming.id)
    store.recordWicket('unknown' as WicketType, striker.id, incoming.id)
    expect(useMatchStore.getState().innings[0].events?.filter((event) => event.type === 'ball')).toHaveLength(0)

    const beforeStrike = useMatchStore.getState().innings[0].currentBatsmanIds
    store.recordWicket('runOut', striker.id, incoming.id, { delivery: 'noBall', batRuns: 1 })
    const wicketState = useMatchStore.getState()
    expect(getInningsSummary(match, wicketState.innings, 0).runs).toBe(2)
    store.undoLastBall()
    const undone = useMatchStore.getState()
    expect(getInningsSummary(match, undone.innings, 0).runs).toBe(0)
    expect(undone.innings[0].currentBatsmanIds).toEqual(beforeStrike)
    expect(deriveForInnings(match, undone.innings, 0).isFreeHitNext).toBe(false)
  })

  it('recordDelivery accounts for wide extras, no-ball byes, and rejects invalid combinations', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    const beforeStrike = useMatchStore.getState().innings[0].currentBatsmanIds
    store.recordDelivery({ delivery: 'wide', wideExtraRuns: 4 })
    let state = useMatchStore.getState()
    expect(getInningsSummary(match, state.innings, 0).runs).toBe(5)
    expect(getInningsSummary(match, state.innings, 0).bowling[0].runs).toBe(5)
    expect(getInningsSummary(match, state.innings, 0).batting[0].balls).toBe(0)
    expect(state.innings[0].currentBatsmanIds).toEqual(beforeStrike)
    store.recordDelivery({ delivery: 'wide', wideExtraRuns: 1 })
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).not.toEqual(beforeStrike)

    setupTestMatch()
    const byesStore = useMatchStore.getState()
    const byesMatch = byesStore.match!
    byesStore.selectOpeningBatsmen(byesMatch.team1.players[0].id, byesMatch.team1.players[1].id)
    byesStore.selectBowler(byesMatch.team2.players[0].id)
    byesStore.recordDelivery({ delivery: 'noBall', byeRuns: 2 })
    state = useMatchStore.getState()
    const byes = getInningsSummary(byesMatch, state.innings, 0)
    expect(byes.runs).toBe(3)
    expect(byes.bowling[0].runs).toBe(1)
    expect(byes.batting[0].balls).toBe(1)

    const count = state.innings[0].events?.length
    byesStore.recordDelivery({ delivery: 'wide', batRuns: 1 })
    byesStore.recordDelivery({ delivery: 'legal', byeRuns: 0 })
    byesStore.recordDelivery({ delivery: 'legal', legByeRuns: 0 })
    byesStore.recordDelivery({ delivery: 'legal', byeRuns: 1, legByeRuns: 1 })
    byesStore.recordDelivery({ delivery: 'legal', batRuns: 1, byeRuns: 1 })
    expect(useMatchStore.getState().innings[0].events).toHaveLength(count ?? 0)
  })

  it('getMatchResultFromState handles Team 2 batting first, margins, ties, and singular wording', () => {
    setupTestMatch()
    const match = useMatchStore.getState().match!
    const team1 = match.team1
    const team2 = match.team2
    const mkInnings = (battingTeam: Team, bowlingTeam: Team, runs: number, wickets = 0): Innings => ({
      battingTeamId: battingTeam.id,
      bowlingTeamId: bowlingTeam.id,
      events: [
        { id: `open-${battingTeam.id}`, type: 'openers', strikerId: battingTeam.players[0].id, nonStrikerId: battingTeam.players[1].id },
        ...Array.from({ length: wickets }, (_, i) => ({
          id: `w-${battingTeam.id}-${i}`,
          type: 'ball' as const,
          bowlerId: bowlingTeam.players[0].id,
          delivery: 'legal' as const,
          batRuns: 0,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
          wicket: { kind: 'bowled' as const, outId: battingTeam.players[i === 0 ? 0 : i + 1].id, newBatterId: battingTeam.players[i + 2].id },
        })),
        ...Array.from({ length: runs }, (_, i) => ({ id: `ball-${battingTeam.id}-${i}`, type: 'ball' as const, bowlerId: bowlingTeam.players[0].id, delivery: 'legal' as const, batRuns: 1, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 })),
      ],
      currentBatsmanIds: [battingTeam.players[0].id, battingTeam.players[1].id],
      currentBowlerId: bowlingTeam.players[0].id,
      status: 'complete',
      pendingBowlerSelection: false,
    })
    const result = (first: number, chase: number, wickets = 0) => getMatchResultFromState(match, [mkInnings(team2, team1, first), mkInnings(team1, team2, chase, wickets)])
    expect(result(5, 6).text).toContain('Team Alpha won by 3 wickets')
    expect(result(6, 5).text).toBe('Team Beta won by 1 run')
    expect(result(5, 5).text).toBe('Match tied')
    expect(result(5, 6, 2).text).toContain('1 wicket')
  })

  it('keeps a non-striker on the scorecard and matches the legacy Player of the Match choice', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [striker, nonStriker] = match.team1.players
    store.selectOpeningBatsmen(striker.id, nonStriker.id)

    const summary = getInningsSummary(match, useMatchStore.getState().innings, 0)
    expect(summary.batting.find((player) => player.id === nonStriker.id)?.dismissalText).toBe('not out')
    expect(summary.didNotBat).not.toContain(nonStriker.name)

    // The pre-2C function selected the first batter on a tie at zero runs/wickets.
    expect(getPlayerOfTheMatch(match, useMatchStore.getState().innings)).toEqual({
      name: striker.name,
      stat: '0 runs',
      teamName: match.team1.name,
    })
  })

  it('edits and inserts balls by replacing the event log and validates edited delivery context', () => {
    setupTestMatch()
    let store = useMatchStore.getState()
    const match = store.match!
    const [striker, nonStriker] = match.team1.players
    store.selectOpeningBatsmen(striker.id, nonStriker.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordDelivery({ delivery: 'legal', batRuns: 4 })
    const ball = (useMatchStore.getState().innings[0]!.events ?? []).find((event) => event.type === 'ball')
    expect(ball?.type).toBe('ball')
    if (!ball || ball.type !== 'ball') throw new Error('Expected recorded ball')

    expect(useMatchStore.getState().editEvent(ball.id, { ...ball, batRuns: 2 }).ok).toBe(true)
    expect(getInningsSummary(match, useMatchStore.getState().innings, 0).runs).toBe(2)
    expect(useMatchStore.getState().insertEvent(ball.id, {
      bowlerId: ball.bowlerId, delivery: 'legal', batRuns: 1, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0,
    }).ok).toBe(true)
    expect(getInningsSummary(match, useMatchStore.getState().innings, 0).runs).toBe(3)
    store = useMatchStore.getState()
    const invalid = store.editEvent(ball.id, { ...ball, delivery: 'wide', batRuns: 2 })
    expect(invalid.ok).toBe(false)
    expect(invalid.error).toContain('wide')
  })

  it('edits the opener event without changing its ID and rejects duplicate openers', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    const [first, second, third] = match.team1.players
    store.selectOpeningBatsmen(first.id, second.id)
    const original = useMatchStore.getState().innings[0]!.events![0]!
    expect(useMatchStore.getState().editOpeners(third.id, second.id).ok).toBe(true)
    expect(useMatchStore.getState().innings[0]!.events![0]).toEqual({ ...original, strikerId: third.id })
    expect(useMatchStore.getState().editOpeners(third.id, third.id).ok).toBe(false)
  })

  it('editing a dot with typed and untyped editor payloads preserves its ball event and order', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    store.recordRun(0)
    store.recordRun(1)
    let events = useMatchStore.getState().innings[0]!.events!
    const dot = events.find((event) => event.type === 'ball')
    if (!dot || dot.type !== 'ball') throw new Error('Expected dot ball')
    const built = buildBallFromEditor({ choice: 'legal', runs: 4, bowlerId: dot.bowlerId, id: dot.id })
    if ('error' in built) throw new Error(built.error)
    expect(useMatchStore.getState().editEvent(dot.id, built.ball).ok).toBe(true)
    expect(getInningsSummary(match, useMatchStore.getState().innings, 0).runs).toBe(5)
    let derived = deriveForInnings(match, useMatchStore.getState().innings, 0)
    expect(derived.score.legalBalls).toBe(2)
    events = useMatchStore.getState().innings[0]!.events!
    expect(events.map((event) => event.id)).toEqual([events[0]!.id, dot.id, events[2]!.id])
    const withoutType = {
      id: built.ball.id,
      bowlerId: built.ball.bowlerId,
      delivery: built.ball.delivery,
      batRuns: built.ball.batRuns,
      byeRuns: built.ball.byeRuns,
      legByeRuns: built.ball.legByeRuns,
      wideExtraRuns: built.ball.wideExtraRuns,
      ...(built.ball.bouncer ? { bouncer: true } : {}),
      ...(built.ball.wicket ? { wicket: built.ball.wicket } : {}),
    }
    expect(useMatchStore.getState().editEvent(dot.id, { ...withoutType, id: dot.id }).ok).toBe(true)
    events = useMatchStore.getState().innings[0]!.events!
    expect(events[1]).toMatchObject({ id: dot.id, type: 'ball', batRuns: 4 })
    derived = deriveForInnings(match, useMatchStore.getState().innings, 0)
    expect(derived.score.runs).toBe(5)
    expect(derived.score.legalBalls).toBe(2)
  })

  it('rejects batting-team bowlers for ball edits and insertions', () => {
    setupTestMatch()
    const store = useMatchStore.getState()
    const match = store.match!
    store.selectOpeningBatsmen(match.team1.players[0].id, match.team1.players[1].id)
    store.selectBowler(match.team2.players[0].id)
    store.recordRun(0)
    const event = useMatchStore.getState().innings[0]!.events!.find((item) => item.type === 'ball')
    if (!event || event.type !== 'ball') throw new Error('Expected ball')
    const wrongBowler = match.team1.players[2].id
    expect(useMatchStore.getState().editEvent(event.id, { ...event, bowlerId: wrongBowler }).error)
      .toBe('Bowler must be from the bowling team')
    expect(useMatchStore.getState().insertEvent(event.id, {
      bowlerId: wrongBowler, delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0,
    }).error).toBe('Bowler must be from the bowling team')
  })

  it('rejects wicket edits that bring back the other batter or a dismissed batter', () => {
    setupTestMatch(6, 4)
    let store = useMatchStore.getState()
    const match = store.match!
    const [b1, b2, b3, b4] = match.team1.players
    store.selectOpeningBatsmen(b1.id, b2.id)
    store.selectBowler(match.team2.players[0].id)
    store.recordWicket('bowled', b1.id, b3.id)
    let wicketEvent = useMatchStore.getState().innings[0]!.events!.find((event) => event.type === 'ball')
    if (!wicketEvent || wicketEvent.type !== 'ball' || !wicketEvent.wicket) throw new Error('Expected wicket ball')
    expect(useMatchStore.getState().editEvent(wicketEvent.id, {
      ...wicketEvent, wicket: { ...wicketEvent.wicket, newBatterId: b2.id },
    }).ok).toBe(false)

    store = useMatchStore.getState()
    store.recordWicket('runOut', b2.id, b4.id)
    store.recordWicket('bowled', b3.id, '')
    const events = useMatchStore.getState().innings[0]!.events!
    wicketEvent = events.filter((event) => event.type === 'ball').at(-1)
    if (!wicketEvent || wicketEvent.type !== 'ball' || !wicketEvent.wicket) throw new Error('Expected final wicket ball')
    const invalidReturn = useMatchStore.getState().editEvent(wicketEvent.id, {
      ...wicketEvent, wicket: { ...wicketEvent.wicket, newBatterId: b1.id },
    })
    expect(invalidReturn.ok).toBe(false)
    expect(invalidReturn.error).toBe('batter cannot come in')
  })

  // 1. Select opening batsmen (players 3 and 4), score 1, score 0, score 4, then 3 undos.
  it('1. Select opening batsmen (players 3 and 4), score 1, 0, 4, then 3 undos restores batsmen after each undo', () => {
    setupTestMatch(2, 3)
    const store = useMatchStore.getState()
    const match = store.match!
    const t1 = match.team1.players
    const t2 = match.team2.players

    const p3 = t1[2].id
    const p4 = t1[3].id

    // Select openers: players 3 and 4
    store.selectOpeningBatsmen(p3, p4)
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p3, p4])

    // Select bowler and bowl ball 1: 1 run
    store.selectBowler(t2[0].id)
    store.recordRun(1)
    // 1 run: strike rotated -> [p4, p3]
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p4, p3])

    // Ball 2: 0 runs
    store.recordRun(0)
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p4, p3])

    // Ball 3: 4 runs
    store.recordRun(4)
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p4, p3])

    // Undo 1: undoes the 4
    store.undoLastBall()
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p4, p3])

    // Undo 2: undoes the 0
    store.undoLastBall()
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p4, p3])

    // Undo 3: undoes the 1 run -> back to opening batsmen [p3, p4]
    store.undoLastBall()
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p3, p4])
    const d0 = deriveForInnings(match, useMatchStore.getState().innings, 0)
    expect(d0.balls).toHaveLength(0)
  })

  // 2. Record a wicket with a non-default incoming batter, score a run, undo.
  it('2. Custom incoming batter on wicket remains at crease after scoring and undoing', () => {
    setupTestMatch(2, 3)
    const store = useMatchStore.getState()
    const match = store.match!
    const t1 = match.team1.players
    const t2 = match.team2.players

    const p1 = t1[0].id
    const p2 = t1[1].id
    const p4 = t1[3].id // custom incoming batter

    store.selectOpeningBatsmen(p1, p2)
    store.selectBowler(t2[0].id)

    // Ball 1: p1 out, p4 comes in
    store.recordWicket('caught', p1, p4)
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p4, p2])

    // Ball 2: 1 run -> strike rotated: p2 on strike, p4 non-striker
    store.recordRun(1)
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p2, p4])

    // Undo ball 2 -> back to p4 on strike, p2 non-striker
    store.undoLastBall()
    expect(useMatchStore.getState().innings[0].currentBatsmanIds).toEqual([p4, p2])
  })

  // 3. Bowl last ball of over: pendingBowlerSelection becomes true. Undo restores previous bowler. Re-record makes it true again.
  it('3. Over end triggers pendingBowlerSelection; undo restores bowler; re-record triggers it again', () => {
    setupTestMatch(2, 3)
    const store = useMatchStore.getState()
    const match = store.match!
    const t1 = match.team1.players
    const t2 = match.team2.players
    const bowler1 = t2[0].id

    store.selectOpeningBatsmen(t1[0].id, t1[1].id)
    store.selectBowler(bowler1)

    // Bowl 5 balls
    for (let i = 0; i < 5; i++) {
      store.recordRun(0)
      expect(useMatchStore.getState().innings[0].pendingBowlerSelection).toBe(false)
    }

    // Bowl ball 6 (over end)
    store.recordRun(0)
    const endOverInnings = useMatchStore.getState().innings[0]
    expect(endOverInnings.pendingBowlerSelection).toBe(true)
    expect(endOverInnings.currentBowlerId).toBe('')

    // Undo ball 6
    store.undoLastBall()
    const undoneInnings = useMatchStore.getState().innings[0]
    expect(undoneInnings.currentBowlerId).toBe(bowler1)
    expect(undoneInnings.pendingBowlerSelection).toBe(false)

    // Re-record ball 6
    store.recordRun(0)
    const reRecordedInnings = useMatchStore.getState().innings[0]
    expect(reRecordedInnings.pendingBowlerSelection).toBe(true)
    expect(reRecordedInnings.currentBowlerId).toBe('')
  })

  // 4. recordExtra('noBall', 4): exactly 1 event created, legal balls count does not increase, score increases by 5.
  it('4. recordExtra("noBall", 4): creates exactly 1 event, legal ball count unchanged, score +5', () => {
    setupTestMatch(2, 3)
    const store = useMatchStore.getState()
    const match = store.match!
    const t1 = match.team1.players
    const t2 = match.team2.players

    store.selectOpeningBatsmen(t1[0].id, t1[1].id)
    store.selectBowler(t2[0].id)

    const eventsBefore = useMatchStore.getState().innings[0].events!.length
    store.recordExtra('noBall', 4)
    const current = useMatchStore.getState().innings[0]

    // Exactly 1 event added
    expect(current.events).toBeDefined()
    expect(current.events!.length).toBe(eventsBefore + 1)
    const lastEvent = current.events![current.events!.length - 1]
    expect(lastEvent.type).toBe('ball')
    if (lastEvent.type === 'ball') {
      expect(lastEvent.delivery).toBe('noBall')
      expect(lastEvent.batRuns).toBe(4)
    }

    // Legal ball count unchanged (0)
    const derived = deriveForInnings(match, useMatchStore.getState().innings, 0)
    expect(derived.score.legalBalls).toBe(0)

    // Total runs: 1 (no-ball penalty) + 4 (bat runs) = 5
    expect(derived.score.runs).toBe(5)
  })

  // 5. Undo back to 0 balls: currentBatsmanIds are still the selected opening batsmen.
  it('5. Undo back to 0 balls preserves selected opening batsmen', () => {
    setupTestMatch(2, 3)
    const store = useMatchStore.getState()
    const match = store.match!
    const t1 = match.team1.players
    const t2 = match.team2.players

    const p3 = t1[2].id
    const p4 = t1[3].id

    store.selectOpeningBatsmen(p3, p4)
    store.selectBowler(t2[0].id)

    store.recordRun(3)
    expect(
      deriveForInnings(match, useMatchStore.getState().innings, 0).balls,
    ).toHaveLength(1)

    store.undoLastBall()
    const current = useMatchStore.getState().innings[0]
    expect(
      deriveForInnings(match, useMatchStore.getState().innings, 0).balls,
    ).toHaveLength(0)
    expect(current.currentBatsmanIds).toEqual([p3, p4])
  })

  // 6. Second innings: target is correctly set to first innings runs + 1; chasing it down sets matchStatus to 'complete'.
  it('6. Second innings target is first innings + 1; chasing ends the match', () => {
    // 1 over match, 3 wickets
    setupTestMatch(1, 3)
    const store = useMatchStore.getState()
    const match = store.match!
    const t1 = match.team1.players
    const t2 = match.team2.players

    store.selectOpeningBatsmen(t1[0].id, t1[1].id)
    store.selectBowler(t2[0].id)

    // Score 6 runs in first innings (6 dots of 1 run each)
    for (let i = 0; i < 6; i++) {
      store.recordRun(1)
    }

    expect(useMatchStore.getState().matchStatus).toBe('innings_break')

    // Start 2nd innings
    store.startSecondInnings()
    expect(useMatchStore.getState().currentInningsIndex).toBe(1)
    expect(useMatchStore.getState().matchStatus).toBe('live')

    // Team 2 batting now: openers B1, B2; bowler A1
    store.selectOpeningBatsmen(t2[0].id, t2[1].id)
    store.selectBowler(t1[0].id)

    // Target is 6 + 1 = 7
    // Ball 1: 6 runs -> total 6, target 7 (not yet chased)
    store.recordRun(6)
    expect(useMatchStore.getState().matchStatus).toBe('live')

    // Ball 2: 1 run -> total 7 >= target 7 -> target chased!
    store.recordRun(1)
    expect(useMatchStore.getState().matchStatus).toBe('complete')
  })

  // 7. Round-trip through migrateLegacyInnings: legacy innings with balls but no events can be loaded and score matches.
  it('7. migrateLegacyInnings migrates legacy innings with balls into an event-backed innings with matching score', () => {
    const mockMatch: Match = {
      overs: 2,
      wicketLimit: 3,
      playersPerTeam: 4,
      team1: {
        id: 'team-1',
        name: 'Team 1',
        players: [
          { id: 'p1', name: 'Player 1' },
          { id: 'p2', name: 'Player 2' },
          { id: 'p3', name: 'Player 3' },
          { id: 'p4', name: 'Player 4' },
        ],
      },
      team2: {
        id: 'team-2',
        name: 'Team 2',
        players: [
          { id: 'b1', name: 'Bowler 1' },
          { id: 'b2', name: 'Bowler 2' },
          { id: 'b3', name: 'Bowler 3' },
          { id: 'b4', name: 'Bowler 4' },
        ],
      },
      tossWinnerId: 'team-1',
      battingFirstId: 'team-1',
    }

    const legacyBalls: Ball[] = [
      {
        over: 0,
        ball: 1,
        batsmanId: 'p1',
        bowlerId: 'b1',
        runs: 1,
        isWicket: false,
        isLegalDelivery: true,
      },
      {
        over: 0,
        ball: 2,
        batsmanId: 'p2',
        bowlerId: 'b1',
        runs: 0,
        extraType: 'wide',
        isWicket: false,
        isLegalDelivery: false,
      },
      {
        over: 0,
        ball: 2,
        batsmanId: 'p2',
        bowlerId: 'b1',
        runs: 4,
        isWicket: false,
        isLegalDelivery: true,
      },
    ]

    const legacyInnings: Innings = {
      battingTeamId: 'team-1',
      bowlingTeamId: 'team-2',
      balls: legacyBalls,
      currentBatsmanIds: ['p2', 'p1'],
      currentBowlerId: 'b1',
      status: 'live',
      pendingBowlerSelection: false,
      // events is undefined: legacy match!
    }

    const migrated = migrateLegacyInnings(legacyInnings, mockMatch, [legacyInnings], 0)

    expect(migrated.events).toBeDefined()
    expect(migrated.events!.length).toBe(4) // 1 openers + 3 balls
    expect(migrated.events![0].type).toBe('openers')

    // Check score match: 1 run + 1 wide + 4 runs = 6 runs
    const derived = deriveForInnings(mockMatch, [migrated], 0)
    expect(derived.score.runs).toBe(6)
    expect(derived.balls).toHaveLength(3)
    expect(() => getInningsSummary(mockMatch, [migrated], 0)).not.toThrow()
  })
})
