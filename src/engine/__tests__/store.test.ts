import { beforeEach, describe, expect, it } from 'vitest'
import { deriveForInnings } from '../adapter'
import { getInningsSummary, getMatchResultFromState, getPlayerOfTheMatch } from '../views'
import { useMatchStore } from '../../store/matchStore'
import { migrateLegacyInnings } from '../../store/persistence'
import type { Ball, Innings, Match, Team } from '../../types'

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

function setupTestMatch(overs = 2, wicketLimit = 3) {
  useMatchStore.getState().updateSetupDraft({
    title: 'Test Match',
    overs,
    wicketLimit,
    playersPerTeam: 4,
    team1Name: 'Team Alpha',
    team1Players: ['A1', 'A2', 'A3', 'A4'],
    team2Name: 'Team Beta',
    team2Players: ['B1', 'B2', 'B3', 'B4'],
    tossWinnerTeam: 1,
    tossChoice: 'bat',
  })
  useMatchStore.getState().startMatch()
}

describe('Store & Engine Integration (Task 4)', () => {
  beforeEach(() => {
    mockStorage['boxscore_current_match'] = ''
    delete mockStorage['boxscore_current_match']
    delete mockStorage['boxscore_match_history']
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
