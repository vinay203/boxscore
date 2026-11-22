import { beforeEach, describe, expect, it } from 'vitest'
import { useMatchStore } from '../../store/matchStore'
import { migrateLegacyInnings } from '../../store/persistence'
import type { Ball, Innings, Match } from '../../types'

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
    expect(useMatchStore.getState().innings[0].balls).toHaveLength(0)
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
    const legalBalls = current.balls.filter((b) => b.isLegalDelivery).length
    expect(legalBalls).toBe(0)

    // Total runs: 1 (no-ball penalty) + 4 (bat runs) = 5
    const totalRuns = current.balls.reduce(
      (sum, b) => sum + (b.extraType === 'noBall' ? 1 + b.runs : b.runs),
      0,
    )
    expect(totalRuns).toBe(5)
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
    expect(useMatchStore.getState().innings[0].balls).toHaveLength(1)

    store.undoLastBall()
    const current = useMatchStore.getState().innings[0]
    expect(current.balls).toHaveLength(0)
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
    const totalRuns = migrated.balls.reduce(
      (sum, b) => sum + (b.extraType === 'wide' ? 1 + b.runs : b.runs),
      0,
    )
    expect(totalRuns).toBe(6)
    expect(migrated.balls).toHaveLength(3)
  })
})
