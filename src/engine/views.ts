import type {
  ExtrasBreakdown,
  FallOfWicket,
  Innings,
  Match,
  Player,
} from '../types'
import { deriveForInnings } from './adapter'
import { getResultText } from './result'
import type { BatterStatus, DerivedBall } from './types'

export interface BattingSummaryRow {
  id: string
  name: string
  isCaptain: boolean
  isJoker: boolean
  runs: number
  balls: number
  ballsFaced: number
  fours: number
  sixes: number
  strikeRate: number
  status: BatterStatus
  dismissalText: string
}

export interface BowlingSummaryRow {
  id: string
  name: string
  isCaptain: boolean
  isJoker: boolean
  overs: string
  oversDisplay: string
  maidens: number
  runs: number
  wickets: number
  economy: number
  wides: number
  noBalls: number
}

export interface InningsSummary {
  runs: number
  wickets: number
  legalBalls: number
  oversDisplay: string
  extras: ExtrasBreakdown
  batting: BattingSummaryRow[]
  bowling: BowlingSummaryRow[]
  fallOfWickets: (FallOfWicket & { oversDisplay: string })[]
  didNotBat: string[]
  remainingBatsmen: Player[]
}

export function formatScore(runs: number, wickets: number): string {
  return `${runs} / ${wickets}`
}

export function getInningsSummary(
  match: Match,
  allInnings: Innings[],
  inningsIndex: number,
): InningsSummary {
  const currentInnings = allInnings[inningsIndex]
  const derived = deriveForInnings(match, allInnings, inningsIndex)

  const battingTeam =
    match.team1.id === currentInnings.battingTeamId ? match.team1 : match.team2
  const bowlingTeam =
    match.team1.id === currentInnings.bowlingTeamId ? match.team1 : match.team2

  const batting: BattingSummaryRow[] = battingTeam.players.map((player) => {
    const stats = derived.batting[player.id] ?? {
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0,
      status: 'didNotBat' as const,
      dismissalText: '',
    }
    return {
      id: player.id,
      name: player.name,
      isCaptain: player.id === battingTeam.captainId,
      isJoker: player.id === match.joker?.playerId,
      runs: stats.runs,
      balls: stats.balls,
      ballsFaced: stats.balls,
      fours: stats.fours,
      sixes: stats.sixes,
      strikeRate: stats.strikeRate,
      status: stats.status,
      dismissalText: stats.dismissalText,
    }
  })

  const bowledIdsInOrder: string[] = []
  const seenBowlers = new Set<string>()
  for (const b of derived.balls) {
    if (!seenBowlers.has(b.bowlerId)) {
      seenBowlers.add(b.bowlerId)
      bowledIdsInOrder.push(b.bowlerId)
    }
  }

  const bowling: BowlingSummaryRow[] = bowledIdsInOrder.map((bowlerId) => {
    const stats = derived.bowling[bowlerId]
    const player =
      bowlingTeam.players.find((p) => p.id === bowlerId) ||
      match.team1.players.find((p) => p.id === bowlerId) ||
      match.team2.players.find((p) => p.id === bowlerId)
    const name = player?.name ?? bowlerId
    return {
      id: bowlerId,
      name,
      isCaptain: bowlerId === bowlingTeam.captainId,
      isJoker: bowlerId === match.joker?.playerId,
      overs: stats.oversDisplay,
      oversDisplay: stats.oversDisplay,
      maidens: stats.maidens,
      runs: stats.runs,
      wickets: stats.wickets,
      economy: stats.economy,
      wides: stats.wides,
      noBalls: stats.noBalls,
    }
  })

  const fallOfWickets = derived.fallOfWickets.map((f) => ({
    wicket: f.wicket,
    score: f.score,
    playerName: f.playerName,
    overDisplay: f.oversDisplay,
    oversDisplay: f.oversDisplay,
  }))

  const didNotBat = battingTeam.players
    .filter((p) => (derived.batting[p.id]?.status ?? 'didNotBat') === 'didNotBat')
    .map((p) => p.name)

  const remainingBatsmen = battingTeam.players.filter((p) => {
    if (p.id === match.joker?.playerId && match.joker.canBat === false) return false
    const s = derived.batting[p.id]?.status ?? 'didNotBat'
    return s === 'didNotBat' || s === 'retiredHurt'
  })

  return {
    runs: derived.score.runs,
    wickets: derived.score.wickets,
    legalBalls: derived.score.legalBalls,
    oversDisplay: derived.score.oversDisplay,
    extras: derived.score.extras,
    batting,
    bowling,
    fallOfWickets,
    didNotBat,
    remainingBatsmen,
  }
}

export function getMatchResultFromState(
  match: Match,
  allInnings: Innings[],
): { winnerName: string | null; text: string } {
  if (allInnings.length < 2 || !allInnings[1]) {
    return { winnerName: null, text: '' }
  }

  const firstTeam =
    match.team1.id === allInnings[0].battingTeamId ? match.team1 : match.team2
  const secondTeam =
    match.team1.id === allInnings[1].battingTeamId ? match.team1 : match.team2

  const d0 = deriveForInnings(match, allInnings, 0)
  const d1 = deriveForInnings(match, allInnings, 1)

  const firstInningsRuns = d0.score.runs
  const secondInningsRuns = d1.score.runs
  const secondInningsWicketsLost = d1.score.wickets
  const squadSize = secondTeam.players.length
  const battableCount = secondTeam.players.filter((player) =>
    match.joker?.canBat !== false || player.id !== match.joker?.playerId,
  ).length
  const wicketLimit = Math.min(match.wicketLimit, Math.max(1, Math.min(squadSize, battableCount) - 1))
  const legalBallsLeft = Math.max(0, match.overs * 6 - d1.score.legalBalls)

  const text = getResultText(
    firstTeam.name,
    secondTeam.name,
    firstInningsRuns,
    secondInningsRuns,
    secondInningsWicketsLost,
    wicketLimit,
    legalBallsLeft,
  )

  let winnerName: string | null = null
  if (secondInningsRuns > firstInningsRuns) {
    winnerName = secondTeam.name
  } else if (firstInningsRuns > secondInningsRuns) {
    winnerName = firstTeam.name
  }

  return { winnerName, text }
}

export function getPlayerOfTheMatch(
  match: Match,
  allInnings: Innings[],
): { name: string; stat: string; teamName: string } {
  let bestBatsman = { name: '', runs: -1, teamName: '' }
  let bestBowler = { name: '', wickets: -1, economy: 999, teamName: '' }
  const seenBatsmanIds = new Set<string>()
  const seenBowlerIds = new Set<string>()

  for (let idx = 0; idx < allInnings.length; idx++) {
    const inn = allInnings[idx]
    const derived = deriveForInnings(match, allInnings, idx)
    const battingTeam =
      match.team1.id === inn.battingTeamId ? match.team1 : match.team2
    const bowlingTeam =
      match.team1.id === inn.bowlingTeamId ? match.team1 : match.team2

    for (const player of battingTeam.players) {
      if (seenBatsmanIds.has(player.id)) continue
      seenBatsmanIds.add(player.id)
      const stats = derived.batting[player.id]
      const runs = stats ? stats.runs : 0
      if (runs > bestBatsman.runs) {
        bestBatsman = {
          name: player.name,
          runs,
          teamName: battingTeam.name,
        }
      }
    }

    for (const player of bowlingTeam.players) {
      if (seenBowlerIds.has(player.id)) continue
      seenBowlerIds.add(player.id)
      const stats = derived.bowling[player.id]
      if (stats) {
        if (
          stats.wickets > bestBowler.wickets ||
          (stats.wickets === bestBowler.wickets &&
            stats.economy < bestBowler.economy)
        ) {
          bestBowler = {
            name: player.name,
            wickets: stats.wickets,
            economy: stats.economy,
            teamName: bowlingTeam.name,
          }
        }
      }
    }
  }

  if (bestBatsman.runs >= bestBowler.wickets * 15) {
    return {
      name: bestBatsman.name,
      stat: `${bestBatsman.runs} runs`,
      teamName: bestBatsman.teamName,
    }
  }

  return {
    name: bestBowler.name,
    stat: `${bestBowler.wickets} wickets (${bestBowler.economy.toFixed(1)} eco)`,
    teamName: bestBowler.teamName,
  }
}

export function getRequiredInfo(
  match: Match,
  allInnings: Innings[],
): { runs: number; balls: number; target: number } | null {
  if (allInnings.length < 2 || !allInnings[1]) {
    return null
  }

  const d0 = deriveForInnings(match, allInnings, 0)
  const d1 = deriveForInnings(match, allInnings, 1)

  const target = d0.score.runs + 1
  const runs = Math.max(0, target - d1.score.runs)
  const balls = Math.max(0, match.overs * 6 - d1.score.legalBalls)

  return {
    runs,
    balls,
    target,
  }
}

export function getCurrentOverBalls(balls: DerivedBall[]): DerivedBall[] {
  let legal = 0
  let overStart = 0
  for (let i = 0; i < balls.length; i++) {
    if (balls[i].isLegal) {
      legal++
      if (legal % 6 === 0) {
        overStart = i + 1
      }
    }
  }
  return balls.slice(overStart)
}

export function getLastBowlerId(balls: DerivedBall[]): string | null {
  let legal = 0
  let overStart = 0
  for (let i = 0; i < balls.length; i++) {
    if (balls[i].isLegal) {
      legal++
      if (legal % 6 === 0) {
        overStart = i + 1
      }
    }
  }
  if (overStart === 0) return null
  for (let i = overStart - 1; i >= 0; i--) {
    if (balls[i].isLegal) {
      return balls[i].bowlerId
    }
  }
  return null
}
