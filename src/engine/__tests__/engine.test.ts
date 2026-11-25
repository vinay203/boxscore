import { describe, expect, it } from 'vitest'
import { deriveInnings } from '../deriveInnings'
import { getResultText } from '../result'
import { defaultRules, type InningsContext, type InningsEvent } from '../types'

function makeCtx(overrides?: Partial<InningsContext>): InningsContext {
  return {
    rules: { ...defaultRules, ...overrides?.rules },
    battingPlayerIds: overrides?.battingPlayerIds ?? [
      'b1',
      'b2',
      'b3',
      'b4',
      'b5',
      'b6',
    ],
    players: overrides?.players ?? {
      b1: { name: 'Batter One' },
      b2: { name: 'Batter Two' },
      b3: { name: 'Batter Three' },
      b4: { name: 'Batter Four' },
      b5: { name: 'Batter Five' },
      b6: { name: 'Batter Six' },
      bw1: { name: 'Kiran' },
      bw2: { name: 'Ravi' },
      joker1: { name: 'Joker Player' },
    },
    target: overrides?.target,
  }
}

describe('Cricket Scoring Engine (pure TypeScript)', () => {
  // Test 1
  it('1. Over end swaps strike; odd run swaps; odd run on the last ball of an over results in no net swap', () => {
    const ctx = makeCtx()

    // 1a: odd run swaps strike
    const ev1: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: '2',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 1,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]
    const res1 = deriveInnings(ev1, ctx)
    expect(res1.strikerId).toBe('b2')
    expect(res1.nonStrikerId).toBe('b1')

    // 1b: even run does not swap strike
    const ev2: InningsEvent[] = [
      ...ev1,
      {
        id: '3',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 2,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]
    const res2 = deriveInnings(ev2, ctx)
    expect(res2.strikerId).toBe('b2')
    expect(res2.nonStrikerId).toBe('b1')

    // 1c: completed over (6 dot balls) swaps strike at over end
    const evDots: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `dot-${i + 1}`,
        type: 'ball' as const,
        bowlerId: 'bw1',
        delivery: 'legal' as const,
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      })),
    ]
    const resDots = deriveInnings(evDots, ctx)
    expect(resDots.strikerId).toBe('b2')
    expect(resDots.nonStrikerId).toBe('b1')

    // 1d: odd run on the last ball of an over results in no net swap
    // (odd run swaps b1 -> b2, then over end swaps b2 -> b1)
    const evOddOverEnd: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `dot-${i + 1}`,
        type: 'ball' as const,
        bowlerId: 'bw1',
        delivery: 'legal' as const,
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      })),
      {
        id: 'ball-6-single',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 1,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]
    const resOddOverEnd = deriveInnings(evOddOverEnd, ctx)
    expect(resOddOverEnd.strikerId).toBe('b1')
    expect(resOddOverEnd.nonStrikerId).toBe('b2')
  })

  // Test 2
  it('2. Wide: 1 run, not legal, batter ball not faced, bowler charged 1, no swap. Wide + 4 extra = 5 runs, bowler charged 5', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: '2',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'wide',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
      {
        id: '3',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'wide',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 4,
      },
    ]

    const res = deriveInnings(events, ctx)
    expect(res.balls[0].totalRuns).toBe(1)
    expect(res.balls[0].isLegal).toBe(false)
    expect(res.balls[0].ballFacedByStriker).toBe(false)
    expect(res.balls[0].runsChargedToBowler).toBe(1)
    expect(res.strikerId).toBe('b1')
    expect(res.nonStrikerId).toBe('b2')

    expect(res.balls[1].totalRuns).toBe(5)
    expect(res.balls[1].runsChargedToBowler).toBe(5)
    expect(res.score.runs).toBe(6)
    expect(res.score.legalBalls).toBe(0)
    expect(res.bowling['bw1'].runs).toBe(6)
    expect(res.batting['b1'].balls).toBe(0)
  })

  // Test 3
  it('3. No-ball + 4 off the bat: 5 runs, not a legal ball, batter faced 1 ball and has 4 runs and 1 four, bowler charged 5, the next ball isFreeHit', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: '2',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'noBall',
        batRuns: 4,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]

    const res = deriveInnings(events, ctx)
    expect(res.balls[0].totalRuns).toBe(5)
    expect(res.balls[0].isLegal).toBe(false)
    expect(res.balls[0].ballFacedByStriker).toBe(true)
    expect(res.balls[0].runsChargedToBowler).toBe(5)

    expect(res.batting['b1'].balls).toBe(1)
    expect(res.batting['b1'].runs).toBe(4)
    expect(res.batting['b1'].fours).toBe(1)
    expect(res.bowling['bw1'].runs).toBe(5)
    expect(res.isFreeHitNext).toBe(true)
  })

  // Test 4
  it('4. Free hit carries through a wide and ends after a legal ball. freeHitAfterNoBall=false turns it off', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      // 1. No ball -> triggers free hit
      {
        id: 'nb',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'noBall',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
      // 2. Wide on free hit -> free hit carries through
      {
        id: 'wide-on-fh',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'wide',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
      // 3. Legal ball on free hit -> consumes free hit
      {
        id: 'legal-on-fh',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]

    const res = deriveInnings(events, ctx)
    expect(res.balls[0].isFreeHit).toBe(false)
    expect(res.balls[1].isFreeHit).toBe(true) // wide was on free hit
    expect(res.balls[2].isFreeHit).toBe(true) // legal ball was on free hit
    expect(res.isFreeHitNext).toBe(false) // free hit ended after legal ball

    // With freeHitAfterNoBall = false
    const ctxNoFh = makeCtx({ rules: { ...defaultRules, freeHitAfterNoBall: false } })
    const resNoFh = deriveInnings([events[0], events[1]], ctxNoFh)
    expect(resNoFh.isFreeHitNext).toBe(false)
  })

  // Test 5
  it('5. Bye 4: team +4, batter faced the ball with 0 runs, bowler charged 0, extras byes = 4. Same for leg-bye', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: 'bye4',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 4,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
      {
        id: 'legBye4',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 4,
        wideExtraRuns: 0,
      },
    ]

    const res = deriveInnings(events, ctx)
    expect(res.score.runs).toBe(8)
    expect(res.score.extras.byes).toBe(4)
    expect(res.score.extras.legByes).toBe(4)
    expect(res.batting['b1'].runs).toBe(0)
    expect(res.batting['b1'].balls).toBe(2)
    expect(res.bowling['bw1'].runs).toBe(0)

    const singleBye = deriveInnings([events[0], events[1]], ctx)
    expect(singleBye.bowling['bw1'].runs).toBe(0)
    expect(singleBye.batting['b1'].balls).toBe(1)
  })

  it('formats caught and stumped dismissals with optional fielders', () => {
    const ctx = makeCtx()
    const caught = (fielderId?: string) => deriveInnings([
      { id: 'open', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      { id: 'out', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0,
        wicket: { kind: 'caught', outId: 'b1', fielderId } },
    ], ctx).batting.b1.dismissalText
    const stumped = (fielderId?: string) => deriveInnings([
      { id: 'open', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      { id: 'out', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0,
        wicket: { kind: 'stumped', outId: 'b1', fielderId } },
    ], ctx).batting.b1.dismissalText

    expect(caught('b3')).toBe('c Batter Three b Kiran')
    expect(caught()).toBe('caught b Kiran')
    expect(stumped('b3')).toBe('st Batter Three b Kiran')
    expect(stumped()).toBe('stumped b Kiran')
  })

  it('a returning retired-hurt batter keeps stats and finishes not out', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: 'open', type: 'openers', strikerId: 'b2', nonStrikerId: 'b1' },
      { id: 'run', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 3, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      { id: 'retire', type: 'retiredHurt', batterId: 'b2', replacementId: 'b3' },
      { id: 'return', type: 'openers', strikerId: 'b2', nonStrikerId: 'b1' },
    ]
    const result = deriveInnings(events, ctx)
    expect(result.batting.b2.status).toBe('batting')
    expect(result.batting.b2.dismissalText).toBe('not out')
    expect(result.batting.b2.runs).toBe(3)
    expect(result.batting.b2.balls).toBe(1)
  })

  // Test 6
  it('6. No-ball + 2 byes: team 3 runs, bowler charged 1, batter faced the ball', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: 'nb-byes',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'noBall',
        batRuns: 0,
        byeRuns: 2,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]

    const res = deriveInnings(events, ctx)
    expect(res.score.runs).toBe(3)
    expect(res.bowling['bw1'].runs).toBe(1)
    expect(res.batting['b1'].balls).toBe(1)
    expect(res.batting['b1'].runs).toBe(0)
    expect(res.score.extras.noBalls).toBe(1)
    expect(res.score.extras.byes).toBe(2)
  })

  // Test 7
  it('7. Wicket bowled credits bowler; caught gives "c Ravi b Kiran"; run out does not credit bowler; run out with 1 run completed swaps correctly and the new batter lands at the right end; non-striker run out works', () => {
    const ctx = makeCtx()

    // 7a: bowled credits bowler
    const resBowled = deriveInnings(
      [
        { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
        {
          id: '2',
          type: 'ball',
          bowlerId: 'bw1',
          delivery: 'legal',
          batRuns: 0,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
          wicket: { kind: 'bowled', outId: 'b1', newBatterId: 'b3' },
        },
      ],
      ctx,
    )
    expect(resBowled.bowling['bw1'].wickets).toBe(1)
    expect(resBowled.batting['b1'].dismissalText).toBe('b Kiran')

    // 7b: caught gives "c Ravi b Kiran"
    const resCaught = deriveInnings(
      [
        { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
        {
          id: '2',
          type: 'ball',
          bowlerId: 'bw1',
          delivery: 'legal',
          batRuns: 0,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
          wicket: {
            kind: 'caught',
            outId: 'b1',
            fielderId: 'bw2',
            newBatterId: 'b3',
          },
        },
      ],
      ctx,
    )
    expect(resCaught.bowling['bw1'].wickets).toBe(1)
    expect(resCaught.batting['b1'].dismissalText).toBe('c Ravi b Kiran')

    // 7c: run out does not credit bowler
    const resRunOut = deriveInnings(
      [
        { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
        {
          id: '2',
          type: 'ball',
          bowlerId: 'bw1',
          delivery: 'legal',
          batRuns: 0,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
          wicket: {
            kind: 'runOut',
            outId: 'b1',
            fielderId: 'bw2',
            newBatterId: 'b3',
          },
        },
      ],
      ctx,
    )
    expect(resRunOut.bowling['bw1'].wickets).toBe(0)
    expect(resRunOut.batting['b1'].dismissalText).toBe('run out (Ravi)')

    // 7d: run out with 1 run completed swaps correctly and new batter lands at the right end
    // b1 is striker, b2 is non-striker.
    // 1 run completed: b2 crosses to striker's end, b1 reaches non-striker's end and is run out there.
    // new batter b3 replaces b1 at the non-striker's end!
    const resRunOut1Run = deriveInnings(
      [
        { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
        {
          id: '2',
          type: 'ball',
          bowlerId: 'bw1',
          delivery: 'legal',
          batRuns: 1,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
          wicket: { kind: 'runOut', outId: 'b1', newBatterId: 'b3' },
        },
      ],
      ctx,
    )
    expect(resRunOut1Run.strikerId).toBe('b2')
    expect(resRunOut1Run.nonStrikerId).toBe('b3')

    // 7e: non-striker run out works (0 runs run, b2 dismissed)
    const resNonStrikerRunOut = deriveInnings(
      [
        { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
        {
          id: '2',
          type: 'ball',
          bowlerId: 'bw1',
          delivery: 'legal',
          batRuns: 0,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
          wicket: { kind: 'runOut', outId: 'b2', newBatterId: 'b3' },
        },
      ],
      ctx,
    )
    expect(resNonStrikerRunOut.strikerId).toBe('b1')
    expect(resNonStrikerRunOut.nonStrikerId).toBe('b3')
    expect(resNonStrikerRunOut.batting['b2'].status).toBe('out')
  })

  // Test 8
  it('8. Bowled on a no-ball or on a free hit is ignored and reported in errors', () => {
    const ctx = makeCtx()

    // 8a: bowled on no-ball
    const resNoBall = deriveInnings(
      [
        { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
        {
          id: '2',
          type: 'ball',
          bowlerId: 'bw1',
          delivery: 'noBall',
          batRuns: 0,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
          wicket: { kind: 'bowled', outId: 'b1', newBatterId: 'b3' },
        },
      ],
      ctx,
    )
    expect(resNoBall.score.wickets).toBe(0)
    expect(resNoBall.batting['b1'].status).toBe('batting')
    expect(resNoBall.errors.length).toBeGreaterThan(0)
    expect(resNoBall.errors[0]).toContain('Disallowed wicket')

    // 8b: bowled on free hit
    const resFreeHit = deriveInnings(
      [
        { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
        {
          id: 'nb',
          type: 'ball',
          bowlerId: 'bw1',
          delivery: 'noBall',
          batRuns: 0,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
        },
        {
          id: 'legal-fh',
          type: 'ball',
          bowlerId: 'bw1',
          delivery: 'legal',
          batRuns: 0,
          byeRuns: 0,
          legByeRuns: 0,
          wideExtraRuns: 0,
          wicket: { kind: 'bowled', outId: 'b1', newBatterId: 'b3' },
        },
      ],
      ctx,
    )
    expect(resFreeHit.score.wickets).toBe(0)
    expect(resFreeHit.batting['b1'].status).toBe('batting')
    expect(resFreeHit.errors.some((e) => e.includes('free hit'))).toBe(true)
  })

  // Test 9
  it('9. Innings completes for allOut, oversDone, targetChased, and endInnings; a ball after completion is ignored with an error', () => {
    const ctx = makeCtx({ rules: { ...defaultRules, overs: 1, wicketsPerInnings: 2 } })

    // 9a: oversDone
    const eventsOversDone: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `b-${i + 1}`,
        type: 'ball' as const,
        bowlerId: 'bw1',
        delivery: 'legal' as const,
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      })),
      // Ball after completion
      {
        id: 'b-extra',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 4,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]
    const resOversDone = deriveInnings(eventsOversDone, ctx)
    expect(resOversDone.isComplete).toBe(true)
    expect(resOversDone.completeReason).toBe('oversDone')
    expect(resOversDone.score.legalBalls).toBe(6)
    expect(resOversDone.balls.length).toBe(6)
    expect(resOversDone.errors.some((e) => e.includes('after innings was complete'))).toBe(true)

    // 9b: allOut
    const eventsAllOut: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: 'w1',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
        wicket: { kind: 'bowled', outId: 'b1', newBatterId: 'b3' },
      },
      {
        id: 'w2',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
        wicket: { kind: 'bowled', outId: 'b3', newBatterId: 'b4' },
      },
    ]
    const resAllOut = deriveInnings(eventsAllOut, ctx)
    expect(resAllOut.isComplete).toBe(true)
    expect(resAllOut.completeReason).toBe('allOut')

    // 9c: targetChased
    const ctxTarget = makeCtx({ target: 5 })
    const eventsTarget: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: 'six',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 6,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]
    const resTarget = deriveInnings(eventsTarget, ctxTarget)
    expect(resTarget.isComplete).toBe(true)
    expect(resTarget.completeReason).toBe('targetChased')

    // 9d: endInnings
    const eventsEnd: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      { id: 'end', type: 'endInnings' },
    ]
    const resEnd = deriveInnings(eventsEnd, ctx)
    expect(resEnd.isComplete).toBe(true)
    expect(resEnd.completeReason).toBe('ended')
  })

  // Test 10
  it('10. Maiden detection, including a maiden that contains byes', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: 'b1',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 4,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `dot-${i + 2}`,
        type: 'ball' as const,
        bowlerId: 'bw1',
        delivery: 'legal' as const,
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      })),
    ]

    const res = deriveInnings(events, ctx)
    expect(res.score.runs).toBe(4) // 4 byes
    expect(res.bowling['bw1'].runs).toBe(0) // 0 charged to bowler
    expect(res.bowling['bw1'].maidens).toBe(1)
  })

  // Test 11
  it('11. Bouncer counts per bowler', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: '1',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
        bouncer: true,
      },
      {
        id: '2',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
        bouncer: true,
      },
      {
        id: '3',
        type: 'ball',
        bowlerId: 'bw2',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
        bouncer: true,
      },
    ]

    const res = deriveInnings(events, ctx)
    expect(res.bowling['bw1'].bouncers).toBe(2)
    expect(res.bowling['bw2'].bouncers).toBe(1)
  })

  // Test 12
  it('12. Changing rules.overs from 2 to 3 on the same events changes isComplete (editing rules recalculates everything)', () => {
    // 12 legal balls (2 complete overs)
    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `b-${i + 1}`,
        type: 'ball' as const,
        bowlerId: i < 6 ? 'bw1' : 'bw2',
        delivery: 'legal' as const,
        batRuns: 1,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      })),
    ]

    const ctx2 = makeCtx({ rules: { ...defaultRules, overs: 2 } })
    const res2 = deriveInnings(events, ctx2)
    expect(res2.isComplete).toBe(true)
    expect(res2.completeReason).toBe('oversDone')

    const ctx3 = makeCtx({ rules: { ...defaultRules, overs: 3 } })
    const res3 = deriveInnings(events, ctx3)
    expect(res3.isComplete).toBe(false)
  })

  // Test 13
  it('13. Removing an early event from the list does not throw; errors are returned', () => {
    const ctx = makeCtx()
    const fullEvents: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      {
        id: '2',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 2,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
      {
        id: '3',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 1,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]

    // Remove the opening batsmen event
    const missingOpeners = fullEvents.slice(1)
    expect(() => deriveInnings(missingOpeners, ctx)).not.toThrow()
    const res = deriveInnings(missingOpeners, ctx)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.score.runs).toBe(3)
  })

  // Test 14
  it('14. The same player id in both teams\' squads works', () => {
    const ctx = makeCtx({
      battingPlayerIds: ['joker1', 'b2'],
    })

    const events: InningsEvent[] = [
      { id: '1', type: 'openers', strikerId: 'joker1', nonStrikerId: 'b2' },
      // joker1 bats: hits a four
      {
        id: 'b1',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 4,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
      // swap ends so b2 is on strike
      { id: 'swap', type: 'swapEnds' },
      // Now joker1 bowls a delivery to b2
      {
        id: 'b2',
        type: 'ball',
        bowlerId: 'joker1',
        delivery: 'legal',
        batRuns: 1,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]

    const res = deriveInnings(events, ctx)
    expect(res.batting['joker1'].runs).toBe(4)
    expect(res.batting['b2'].runs).toBe(1)
    expect(res.bowling['joker1'].runs).toBe(1)
  })

  // Test 15
  it('15. getResultText: team 2 batted first and team 1 chased and won -> "by N wickets"; defending team wins by runs; tie; singular wording for 1 run and 1 wicket', () => {
    // 15a: Team 2 batted first, Team 1 chased and won
    const resChased = getResultText('Team 2', 'Team 1', 50, 51, 3, 5, 4)
    expect(resChased).toBe('Team 1 won by 2 wickets (4 balls left)')

    // 15b: Chased with 1 wicket left and 1 ball left (singular test)
    const resChasedSingular = getResultText('Team 2', 'Team 1', 50, 51, 4, 5, 1)
    expect(resChasedSingular).toBe('Team 1 won by 1 wicket (1 ball left)')

    // 15c: Defending team wins by runs
    const resDefended = getResultText('Team 1', 'Team 2', 60, 50, 4, 5, 0)
    expect(resDefended).toBe('Team 1 won by 10 runs')

    // 15d: Defending team wins by 1 run (singular test)
    const resDefended1Run = getResultText('Team 1', 'Team 2', 60, 59, 4, 5, 0)
    expect(resDefended1Run).toBe('Team 1 won by 1 run')

    // 15e: Tie
    const resTie = getResultText('Team 1', 'Team 2', 50, 50, 5, 5, 0)
    expect(resTie).toBe('Match tied')
  })

  // Test 16: Task 0a - Missing active striker/non-striker fallback and out player protection
  it('16. Task 0a: fallback to first didNotBat player; never pick out, retiredHurt, or current crease player; never overwrite out status', () => {
    const ctx = makeCtx({
      battingPlayerIds: ['b1', 'b2', 'b3', 'b4'],
      rules: { ...defaultRules, wicketsPerInnings: 3 },
    })

    // b4 is retired hurt early
    const evRetired: InningsEvent = {
      id: 'ret-1',
      type: 'retiredHurt',
      batterId: 'b4',
    }

    // Ball arrives with no openers set
    const ev1: InningsEvent[] = [
      evRetired,
      {
        id: 'ball-1',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
        wicket: { kind: 'bowled', outId: 'b1' }, // b1 gets out, no newBatterId
      },
    ]

    const res1 = deriveInnings(ev1, ctx)
    // Striker was b1, non-striker was b2 (fallbacks from didNotBat)
    expect(res1.batting['b1'].status).toBe('out')
    expect(res1.batting['b2'].status).toBe('batting')
    expect(res1.strikerId).toBeNull() // b1 is out and no newBatterId was provided

    // Ball 2 arrives without a new batter explicitly chosen
    const ev2: InningsEvent[] = [
      ...ev1,
      {
        id: 'ball-2',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]

    const res2 = deriveInnings(ev2, ctx)
    // Striker should fall back to b3 (the only remaining didNotBat player, b4 is retiredHurt)
    expect(res2.strikerId).toBe('b3')
    expect(res2.nonStrikerId).toBe('b2')
    expect(res2.batting['b1'].status).toBe('out') // out status preserved!
    expect(res2.batting['b3'].status).toBe('batting')
    expect(res2.batting['b4'].status).toBe('retiredHurt') // b4 remains retiredHurt!

    // Ball 3: b3 gets out
    const ev3: InningsEvent[] = [
      ...ev2,
      {
        id: 'ball-3',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 0,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
        wicket: { kind: 'bowled', outId: 'b3' },
      },
    ]
    const res3 = deriveInnings(ev3, ctx)
    expect(res3.batting['b3'].status).toBe('out')
    expect(res3.isComplete).toBe(false) // 2 wickets down, max is 3

    // Ball 4: arrives but no didNotBat players remain (b1 out, b3 out, b4 retiredHurt, b2 at crease)
    const ev4: InningsEvent[] = [
      ...ev3,
      {
        id: 'ball-4',
        type: 'ball',
        bowlerId: 'bw1',
        delivery: 'legal',
        batRuns: 1,
        byeRuns: 0,
        legByeRuns: 0,
        wideExtraRuns: 0,
      },
    ]
    const res4 = deriveInnings(ev4, ctx)
    // Slot should be left empty (null) and an error recorded
    expect(res4.strikerId).toBe('b2') // strike rotated on 1 run from nonStriker
    expect(res4.nonStrikerId).toBeNull() // other slot is empty
    expect(res4.batting['b1'].status).toBe('out') // b1 still out!
    expect(res4.batting['b3'].status).toBe('out') // b3 still out!
    expect(res4.errors.some((e) => e.includes('no didNotBat player available'))).toBe(true)
  })

  // Test 17: Task 0b - bouncersByOver per bowler
  it('17. Task 0b: bouncersByOver tracks bouncer counts per over index', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: 'openers', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      // Over 0: 6 balls. Ball 1 is a bouncer, ball 2 is a bouncer.
      { id: 'b1', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, bouncer: true },
      { id: 'b2', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, bouncer: true },
      { id: 'b3', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      { id: 'b4', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      { id: 'b5', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      { id: 'b6', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0 },
      // Over 1: Bowler bw1 bowls another over. Ball 1 is a bouncer.
      { id: 'b7', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, bouncer: true },
    ]

    const res = deriveInnings(events, ctx)
    const bw1Stats = res.bowling['bw1']
    expect(bw1Stats.bouncers).toBe(3)
    expect(bw1Stats.bouncersByOver[0]).toBe(2)
    expect(bw1Stats.bouncersByOver[1]).toBe(1)
  })

  // Test 18: Task 0c - DerivedBall fields and accepted wickets
  it('18. Task 0c: DerivedBall contains extended fields and accepted wickets only', () => {
    const ctx = makeCtx()
    const events: InningsEvent[] = [
      { id: 'openers', type: 'openers', strikerId: 'b1', nonStrikerId: 'b2' },
      // Ball 1: Legal delivery with bye runs
      { id: 'b1', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 2, legByeRuns: 0, wideExtraRuns: 0 },
      // Ball 2: Wide with extra runs
      { id: 'b2', type: 'ball', bowlerId: 'bw1', delivery: 'wide', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 1 },
      // Ball 3: Caught wicket (accepted)
      { id: 'b3', type: 'ball', bowlerId: 'bw1', delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'caught', outId: 'b1', fielderId: 'bw2', newBatterId: 'b3' } },
      // Ball 4: No ball with disallowed caught wicket (ignored)
      { id: 'b4', type: 'ball', bowlerId: 'bw1', delivery: 'noBall', batRuns: 1, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0, wicket: { kind: 'caught', outId: 'b3' } },
    ]

    const res = deriveInnings(events, ctx)
    expect(res.balls).toHaveLength(4)

    // Ball 1 checks
    expect(res.balls[0].delivery).toBe('legal')
    expect(res.balls[0].byeRuns).toBe(2)
    expect(res.balls[0].bouncer).toBe(false)
    expect(res.balls[0].wicket).toBeUndefined()

    // Ball 2 checks
    expect(res.balls[1].delivery).toBe('wide')
    expect(res.balls[1].wideExtraRuns).toBe(1)

    // Ball 3 checks (accepted wicket)
    expect(res.balls[2].wicket).toEqual({
      kind: 'caught',
      outId: 'b1',
      fielderId: 'bw2',
      creditedToBowler: true,
    })

    // Ball 4 checks (disallowed wicket on noBall ignored)
    expect(res.balls[3].delivery).toBe('noBall')
    expect(res.balls[3].wicket).toBeUndefined()
  })
})
