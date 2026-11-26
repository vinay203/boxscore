import type {
  CompleteReason,
  DerivedBall,
  DerivedInnings,
  InningsContext,
  InningsEvent,
  PlayerBattingStats,
  PlayerBowlingStats,
  DeliveryKind,
  WicketKind,
} from './types'

const ALL_WICKET_KINDS: WicketKind[] = [
  'bowled', 'caught', 'lbw', 'stumped', 'hitWicket', 'runOut',
  'obstructingField', 'hitBallTwice',
]
const FREE_HIT_WICKET_KINDS: WicketKind[] = ['runOut', 'obstructingField', 'hitBallTwice']
const WIDE_WICKET_KINDS: WicketKind[] = ['stumped', 'hitWicket', ...FREE_HIT_WICKET_KINDS]

export function allowedWicketKinds(delivery: DeliveryKind, isFreeHit: boolean, withByes = false): WicketKind[] {
  if (withByes) return ['runOut', 'obstructingField']
  if (isFreeHit || delivery === 'noBall') return [...FREE_HIT_WICKET_KINDS]
  if (delivery === 'wide') return [...WIDE_WICKET_KINDS]
  return [...ALL_WICKET_KINDS]
}

const BOWLER_CREDITED_WICKETS: WicketKind[] = [
  'bowled',
  'caught',
  'lbw',
  'stumped',
  'hitWicket',
]

const ZERO_BAT_RUNS_WICKETS: WicketKind[] = [
  'bowled',
  'caught',
  'lbw',
  'stumped',
  'hitWicket',
]

function formatOvers(legalBalls: number): string {
  const overs = Math.floor(legalBalls / 6)
  const balls = legalBalls % 6
  return `${overs}.${balls}`
}

export function deriveInnings(
  events: InningsEvent[],
  ctx: InningsContext,
): DerivedInnings {
  const errors: string[] = []
  const balls: DerivedBall[] = []
  const fallOfWickets: DerivedInnings['fallOfWickets'] = []

  let strikerId: string | null = null
  let nonStrikerId: string | null = null
  let currentBowlerId: string | null = null

  let legalBallsTotal = 0
  let runsTotal = 0
  let wicketsTotal = 0

  const extras = {
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
    total: 0,
  }

  let currentPartnership = { runs: 0, balls: 0 }
  let isFreeHitState = false
  let needsNewBatter = false
  let needsNewBowler = false
  let isComplete = false
  let completeReason: CompleteReason | undefined = undefined

  const batting: Record<string, PlayerBattingStats> = {}
  const bowling: Record<string, PlayerBowlingStats> = {}

  // Initialize all known batting players as 'didNotBat'
  for (const id of ctx.battingPlayerIds) {
    batting[id] = {
      playerId: id,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0,
      status: 'didNotBat',
      dismissalText: '',
    }
  }

  function getOrCreateBatting(id: string): PlayerBattingStats {
    if (!batting[id]) {
      batting[id] = {
        playerId: id,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
        status: 'didNotBat',
        dismissalText: '',
      }
    }
    return batting[id]
  }

  function setBattingStatus(id: string): void {
    const b = getOrCreateBatting(id)
    if (b.status !== 'out') {
      b.status = 'batting'
      b.dismissalText = ''
    }
  }

  function getOrCreateBowling(id: string): PlayerBowlingStats {
    if (!bowling[id]) {
      bowling[id] = {
        playerId: id,
        legalBalls: 0,
        oversDisplay: '0.0',
        runs: 0,
        wickets: 0,
        maidens: 0,
        wides: 0,
        noBalls: 0,
        bouncers: 0,
        bouncersByOver: {},
        economy: 0,
      }
    }
    return bowling[id]
  }

  function getPlayerName(id: string): string {
    return ctx.players[id]?.name ?? id
  }

  function formatDismissalText(wicketKind: WicketKind, bowlerId: string, fielderId?: string): string {
    const bowlerName = getPlayerName(bowlerId)
    const fielderName = fielderId ? getPlayerName(fielderId) : ''

    switch (wicketKind) {
      case 'bowled':
        return `b ${bowlerName}`
      case 'caught':
        if (fielderId && fielderId === bowlerId) return `c & b ${bowlerName}`
        return fielderName ? `c ${fielderName} b ${bowlerName}` : `caught b ${bowlerName}`
      case 'lbw':
        return `lbw b ${bowlerName}`
      case 'stumped':
        return fielderName ? `st ${fielderName} b ${bowlerName}` : `stumped b ${bowlerName}`
      case 'hitWicket':
        return `hit wicket b ${bowlerName}`
      case 'runOut':
        return fielderName ? `run out (${fielderName})` : 'run out'
      case 'obstructingField':
        return 'obstructing the field'
      case 'hitBallTwice':
        return 'hit the ball twice'
      default:
        return wicketKind
    }
  }

  const maxWickets = Math.min(
    ctx.rules.wicketsPerInnings,
    Math.max(1, ctx.battingPlayerIds.length - 1),
  )

  function checkCompletion(): void {
    if (isComplete) return

    if (ctx.target !== undefined && runsTotal >= ctx.target) {
      isComplete = true
      completeReason = 'targetChased'
      needsNewBatter = false
      needsNewBowler = false
    } else if (wicketsTotal >= maxWickets) {
      isComplete = true
      completeReason = 'allOut'
      needsNewBatter = false
      needsNewBowler = false
    } else if (legalBallsTotal >= ctx.rules.overs * 6) {
      isComplete = true
      completeReason = 'oversDone'
      needsNewBatter = false
      needsNewBowler = false
    }
  }

  // Track over-by-over deliveries to compute maidens
  const oversDeliveries: Map<number, { bowlerId: string; runsCharged: number; isLegal: boolean }[]> = new Map()

  for (const ev of events) {
    if (ev.type === 'endInnings') {
      isComplete = true
      completeReason = 'ended'
      needsNewBatter = false
      needsNewBowler = false
      continue
    }

    if (isComplete) {
      errors.push(`Event '${ev.id}' of type '${ev.type}' occurred after innings was complete`)
      continue
    }

    if (ev.type === 'openers') {
      strikerId = ev.strikerId
      nonStrikerId = ev.nonStrikerId
      setBattingStatus(strikerId)
      setBattingStatus(nonStrikerId)
      needsNewBatter = false
      continue
    }

    if (ev.type === 'swapEnds') {
      const temp: string | null = strikerId
      strikerId = nonStrikerId
      nonStrikerId = temp
      continue
    }

    if (ev.type === 'retiredHurt') {
      const bStats = getOrCreateBatting(ev.batterId)
      bStats.status = 'retiredHurt'
      bStats.dismissalText = 'retired hurt'

      if (ev.batterId === strikerId) {
        if (ev.replacementId && batting[ev.replacementId]?.status !== 'out') {
          strikerId = ev.replacementId
          setBattingStatus(ev.replacementId)
          needsNewBatter = false
        } else {
          strikerId = null
          needsNewBatter = true
        }
      } else if (ev.batterId === nonStrikerId) {
        if (ev.replacementId && batting[ev.replacementId]?.status !== 'out') {
          nonStrikerId = ev.replacementId
          setBattingStatus(ev.replacementId)
          needsNewBatter = false
        } else {
          nonStrikerId = null
          needsNewBatter = true
        }
      } else {
        errors.push(`Retired hurt player '${ev.batterId}' is not currently batting`)
      }
      continue
    }

    if (ev.type === 'dismissal') {
      wicketsTotal += 1
      const bStats = getOrCreateBatting(ev.outId)
      bStats.status = 'out'
      bStats.dismissalText = ev.kind === 'retiredOut' ? 'retired out' : 'timed out'

      fallOfWickets.push({
        wicket: wicketsTotal,
        score: runsTotal,
        playerName: getPlayerName(ev.outId),
        oversDisplay: formatOvers(legalBallsTotal),
      })
      currentPartnership = { runs: 0, balls: 0 }

      if (ev.outId === strikerId) {
        if (ev.newBatterId && batting[ev.newBatterId]?.status !== 'out') {
          strikerId = ev.newBatterId
          setBattingStatus(ev.newBatterId)
          needsNewBatter = false
        } else {
          strikerId = null
          needsNewBatter = true
        }
      } else if (ev.outId === nonStrikerId) {
        if (ev.newBatterId && batting[ev.newBatterId]?.status !== 'out') {
          nonStrikerId = ev.newBatterId
          setBattingStatus(ev.newBatterId)
          needsNewBatter = false
        } else {
          nonStrikerId = null
          needsNewBatter = true
        }
      } else {
        errors.push(`Dismissed player '${ev.outId}' is not currently batting`)
      }

      checkCompletion()
      continue
    }

    if (ev.type === 'ball') {
      needsNewBowler = false
      currentBowlerId = ev.bowlerId

      // Safe fallback if openers or batters were not set
      const findAvailableDidNotBatPlayer = (excludeId?: string | null): string | null => {
        for (const pid of ctx.battingPlayerIds) {
          if (pid === excludeId || pid === strikerId || pid === nonStrikerId) continue
          const b = batting[pid]
          if (!b || b.status === 'didNotBat') {
            return pid
          }
        }
        return null
      }

      if (!strikerId) {
        const fallback = findAvailableDidNotBatPlayer(nonStrikerId)
        if (fallback) {
          strikerId = fallback
          const b = getOrCreateBatting(fallback)
          if (b.status !== 'out' && b.status !== 'retiredHurt') {
            b.status = 'batting'
          }
          errors.push(`Ball '${ev.id}' had no active striker; defaulted to didNotBat player '${fallback}'`)
        } else {
          errors.push(`Ball '${ev.id}' had no active striker and no didNotBat player available`)
        }
      }

      if (!nonStrikerId) {
        const fallback = findAvailableDidNotBatPlayer(strikerId)
        if (fallback) {
          nonStrikerId = fallback
          const b = getOrCreateBatting(fallback)
          if (b.status !== 'out' && b.status !== 'retiredHurt') {
            b.status = 'batting'
          }
          errors.push(`Ball '${ev.id}' had no active non-striker; defaulted to didNotBat player '${fallback}'`)
        } else {
          errors.push(`Ball '${ev.id}' had no active non-striker and no didNotBat player available`)
        }
      }

      const currentStrikerId = strikerId ?? ''
      const currentNonStrikerId = nonStrikerId ?? ''

      const isWide = ev.delivery === 'wide'
      const isNoBall = ev.delivery === 'noBall'
      const isLegal = ev.delivery === 'legal'
      const isThisBallFreeHit: boolean = isFreeHitState

      const widePenaltyRuns = isWide ? ctx.rules.wideRuns + ev.wideExtraRuns : 0
      const noBallPenaltyRuns = isNoBall ? ctx.rules.noBallRuns : 0
      const totalBallRuns =
        ev.batRuns +
        ev.byeRuns +
        ev.legByeRuns +
        widePenaltyRuns +
        noBallPenaltyRuns

      // Runs charged to bowler = batRuns + wide runs + noBall penalty (byes/leg-byes not charged)
      const runsChargedToBowler = ev.batRuns + widePenaltyRuns + noBallPenaltyRuns

      const ballFacedByStriker = !isWide

      const currentOverIndex = Math.floor(legalBallsTotal / 6)
      const ballInOver = (legalBallsTotal % 6) + 1

      // Validate wicket if present
      let validWicket = ev.wicket
      if (validWicket) {
        if (!allowedWicketKinds(ev.delivery, isThisBallFreeHit).includes(validWicket.kind)) {
          errors.push(
            `Disallowed wicket '${validWicket.kind}' on ${isNoBall ? 'no-ball' : isThisBallFreeHit ? 'free hit' : isWide ? 'wide' : 'legal delivery'}; wicket ignored`,
          )
          validWicket = undefined
        }
      }

      if (validWicket && ZERO_BAT_RUNS_WICKETS.includes(validWicket.kind) && ev.batRuns > 0) {
        errors.push(
          `Wicket of type '${validWicket.kind}' cannot have batRuns > 0 (had ${ev.batRuns})`,
        )
      }

      // Record derived ball
      balls.push({
        eventId: ev.id,
        over: currentOverIndex,
        ballInOver,
        strikerId: currentStrikerId,
        nonStrikerId: currentNonStrikerId,
        bowlerId: ev.bowlerId,
        totalRuns: totalBallRuns,
        isLegal,
        isFreeHit: isThisBallFreeHit,
        ballFacedByStriker,
        runsChargedToBowler,
        delivery: ev.delivery,
        batRuns: ev.batRuns,
        byeRuns: ev.byeRuns,
        legByeRuns: ev.legByeRuns,
        wideExtraRuns: ev.wideExtraRuns,
        bouncer: !!ev.bouncer,
        wicket: validWicket
          ? {
              kind: validWicket.kind,
              outId: validWicket.outId,
              fielderId: validWicket.fielderId,
              creditedToBowler: BOWLER_CREDITED_WICKETS.includes(validWicket.kind),
            }
          : undefined,
      })

      // Update over deliveries tracking for maiden calculation
      if (!oversDeliveries.has(currentOverIndex)) {
        oversDeliveries.set(currentOverIndex, [])
      }
      oversDeliveries.get(currentOverIndex)!.push({
        bowlerId: ev.bowlerId,
        runsCharged: runsChargedToBowler,
        isLegal,
      })

      // Update team score & extras
      runsTotal += totalBallRuns
      if (isWide) extras.wides += widePenaltyRuns
      if (isNoBall) extras.noBalls += noBallPenaltyRuns
      if (ev.byeRuns > 0) extras.byes += ev.byeRuns
      if (ev.legByeRuns > 0) extras.legByes += ev.legByeRuns
      extras.total = extras.wides + extras.noBalls + extras.byes + extras.legByes

      // Update striker batting stats
      if (currentStrikerId) {
        const strikerStats = getOrCreateBatting(currentStrikerId)
        if (ballFacedByStriker) {
          strikerStats.balls += 1
        }
        strikerStats.runs += ev.batRuns
        if (ev.batRuns === 4) strikerStats.fours += 1
        if (ev.batRuns === 6) strikerStats.sixes += 1
      }

      // Update bowler stats
      const bowlerStats = getOrCreateBowling(ev.bowlerId)
      if (isLegal) bowlerStats.legalBalls += 1
      bowlerStats.runs += runsChargedToBowler
      if (isWide) bowlerStats.wides += 1
      if (isNoBall) bowlerStats.noBalls += 1
      if (ev.bouncer) {
        bowlerStats.bouncers += 1
        bowlerStats.bouncersByOver[currentOverIndex] =
          (bowlerStats.bouncersByOver[currentOverIndex] ?? 0) + 1
      }

      // Update partnership
      currentPartnership.runs += totalBallRuns
      if (ballFacedByStriker) currentPartnership.balls += 1

      // Next free hit state calculation
      let nextFreeHitState = false
      if (isLegal) {
        nextFreeHitState = false
      } else if (isNoBall) {
        nextFreeHitState = ctx.rules.freeHitAfterNoBall ? true : isThisBallFreeHit
      } else if (isWide) {
        nextFreeHitState = ctx.rules.freeHitAfterWide ? true : isThisBallFreeHit
      }
      isFreeHitState = nextFreeHitState

      // 5. Strike swaps if runs physically run are odd:
      // batRuns + byeRuns + legByeRuns + wideExtraRuns
      const runsPhysicallyRun =
        ev.batRuns + ev.byeRuns + ev.legByeRuns + ev.wideExtraRuns
      if (runsPhysicallyRun % 2 === 1) {
        const temp: string | null = strikerId
        strikerId = nonStrikerId
        nonStrikerId = temp
      }

      // Handle valid wicket
      if (validWicket) {
        wicketsTotal += 1
        if (BOWLER_CREDITED_WICKETS.includes(validWicket.kind)) {
          bowlerStats.wickets += 1
        }

        const outStats = getOrCreateBatting(validWicket.outId)
        outStats.status = 'out'
        outStats.dismissalText = formatDismissalText(
          validWicket.kind,
          ev.bowlerId,
          validWicket.fielderId,
        )

        fallOfWickets.push({
          wicket: wicketsTotal,
          score: runsTotal,
          playerName: getPlayerName(validWicket.outId),
          oversDisplay: formatOvers(isLegal ? legalBallsTotal + 1 : legalBallsTotal),
        })
        currentPartnership = { runs: 0, balls: 0 }

        // Rule 9: The dismissed batter is replaced IN PLACE by newBatterId
        if (validWicket.outId === strikerId) {
          if (validWicket.newBatterId && batting[validWicket.newBatterId]?.status !== 'out') {
            strikerId = validWicket.newBatterId
            setBattingStatus(validWicket.newBatterId)
            needsNewBatter = false
          } else {
            strikerId = null
            needsNewBatter = true
          }
        } else if (validWicket.outId === nonStrikerId) {
          if (validWicket.newBatterId && batting[validWicket.newBatterId]?.status !== 'out') {
            nonStrikerId = validWicket.newBatterId
            setBattingStatus(validWicket.newBatterId)
            needsNewBatter = false
          } else {
            nonStrikerId = null
            needsNewBatter = true
          }
        } else {
          errors.push(
            `Dismissed batter '${validWicket.outId}' is neither current striker nor non-striker`,
          )
        }
      }

      if (isLegal) {
        legalBallsTotal += 1

        // Check if over ended (6 legal balls)
        if (legalBallsTotal % 6 === 0) {
          // Check maiden for this completed over
          const overBalls = oversDeliveries.get(currentOverIndex) ?? []
          const legalInOver = overBalls.filter((b) => b.isLegal)
          if (legalInOver.length === 6) {
            const bowlerIds = new Set(overBalls.map((b) => b.bowlerId))
            if (bowlerIds.size === 1) {
              const overBowlerId = overBalls[0].bowlerId
              const totalChargedInOver = overBalls.reduce(
                (sum, b) => sum + b.runsCharged,
                0,
              )
              if (totalChargedInOver === 0) {
                getOrCreateBowling(overBowlerId).maidens += 1
              }
            }
          }

          // Swap strike at the end of the over
          const temp: string | null = strikerId
          strikerId = nonStrikerId
          nonStrikerId = temp
          needsNewBowler = true
        }
      }

      checkCompletion()
    }
  }

  // Finalize batting status and dismissalText
  for (const b of Object.values(batting)) {
    if (b.status === 'batting') {
      b.dismissalText = 'not out'
    }
    b.strikeRate = b.balls > 0 ? Number(((b.runs / b.balls) * 100).toFixed(2)) : 0
  }

  // Finalize bowling oversDisplay and economy
  for (const b of Object.values(bowling)) {
    b.oversDisplay = formatOvers(b.legalBalls)
    b.economy =
      b.legalBalls > 0 ? Number((b.runs / (b.legalBalls / 6)).toFixed(2)) : 0
  }

  return {
    balls,
    score: {
      runs: runsTotal,
      wickets: wicketsTotal,
      legalBalls: legalBallsTotal,
      oversDisplay: formatOvers(legalBallsTotal),
      extras,
    },
    strikerId,
    nonStrikerId,
    currentBowlerId,
    needsNewBatter: isComplete ? false : needsNewBatter,
    needsNewBowler: isComplete ? false : needsNewBowler,
    isFreeHitNext: isFreeHitState,
    isComplete,
    completeReason,
    batting,
    bowling,
    fallOfWickets,
    currentPartnership,
    errors,
  }
}
