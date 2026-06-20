import type {
  Ball,
  BattingStats,
  BowlingStats,
  ExtrasBreakdown,
  FallOfWicket,
  Innings,
  Match,
  Player,
  Team,
  WicketType,
} from '../types'

export function generateId(): string {
  return crypto.randomUUID()
}

export function getBallRuns(b: Ball): number {
  if (b.extraType === 'wide' || b.extraType === 'noBall') {
    return 1 + b.runs
  }
  return b.runs
}

export function getLegalBallCount(balls: Ball[]): number {
  return balls.filter((b) => b.isLegalDelivery).length
}

export function findCurrentOverStart(balls: Ball[]): number {
  let legal = 0
  let overStart = 0
  for (let i = 0; i < balls.length; i++) {
    if (balls[i].isLegalDelivery) {
      legal++
      if (legal % 6 === 0) {
        overStart = i + 1
      }
    }
  }
  return overStart
}

export function getCurrentOverBalls(balls: Ball[]): Ball[] {
  return balls.slice(findCurrentOverStart(balls))
}

export function getTotalRuns(balls: Ball[]): number {
  return balls.reduce((sum, b) => sum + getBallRuns(b), 0)
}

export function getWicketCount(balls: Ball[]): number {
  return balls.filter((b) => b.isWicket).length
}

export function getOversDisplay(balls: Ball[], totalOvers: number): string {
  const legal = getLegalBallCount(balls)
  const completedOvers = Math.floor(legal / 6)
  const ballsInOver = legal % 6
  return `(${completedOvers}.${ballsInOver} / ${totalOvers} ov)`
}

export function getOverBallNumbers(balls: Ball[]): { over: number; ball: number } {
  const legal = getLegalBallCount(balls)
  return {
    over: Math.floor(legal / 6),
    ball: (legal % 6) + 1,
  }
}

export function getTeamById(match: Match, teamId: string): Team {
  return match.team1.id === teamId ? match.team1 : match.team2
}

export function getPlayerById(team: Team, playerId: string): Player | undefined {
  return team.players.find((p) => p.id === playerId)
}

export function getPlayerName(match: Match, teamId: string, playerId: string): string {
  const team = getTeamById(match, teamId)
  return getPlayerById(team, playerId)?.name ?? 'Unknown'
}

export function getBattingStats(
  balls: Ball[],
  playerId: string,
  players: Player[],
): BattingStats {
  let runs = 0
  let ballsFaced = 0
  let fours = 0
  let sixes = 0
  let isOut = false
  let dismissal: string | undefined

  for (const b of balls) {
    if (b.outBatsmanId === playerId && b.isWicket) {
      isOut = true
      dismissal = formatDismissal(b.wicketType, b.bowlerId, balls, players)
    }

    const isBatsmanOnStrike =
      b.batsmanId === playerId &&
      (!b.extraType || b.extraType === 'noBall')

    if (isBatsmanOnStrike && b.isLegalDelivery) {
      ballsFaced++
    }

    if (b.batsmanId === playerId) {
      if (!b.extraType) {
        runs += b.runs
        if (b.runs === 4) fours++
        if (b.runs === 6) sixes++
      } else if (b.extraType === 'noBall' && b.runs > 0) {
        runs += b.runs
        if (b.runs === 4) fours++
        if (b.runs === 6) sixes++
      }
    }
  }

  const strikeRate = ballsFaced > 0 ? (runs / ballsFaced) * 100 : 0

  return {
    runs,
    ballsFaced,
    fours,
    sixes,
    strikeRate,
    isOut,
    dismissal,
  }
}

function formatDismissal(
  wicketType: WicketType | undefined,
  bowlerId: string,
  _balls: Ball[],
  players: Player[],
): string {
  const bowlerName = players.find((p) => p.id === bowlerId)?.name ?? ''
  switch (wicketType) {
    case 'bowled':
      return `b ${bowlerName}`
    case 'caught':
      return `c ? b ${bowlerName}`
    case 'runOut':
      return 'run out'
    case 'lbw':
      return `lbw b ${bowlerName}`
    case 'stumped':
      return `st b ${bowlerName}`
    case 'hitWicket':
      return `hit wicket b ${bowlerName}`
    default:
      return 'out'
  }
}

export function getBowlingStats(balls: Ball[], playerId: string): BowlingStats {
  let legalBalls = 0
  let runs = 0
  let wickets = 0

  const overRuns: Map<number, { legal: number; runs: number }> = new Map()

  for (const b of balls) {
    if (b.bowlerId !== playerId) continue

    const ballRuns = getBallRuns(b)
    runs += ballRuns

    if (b.isLegalDelivery) {
      legalBalls++
      const overKey = Math.floor((legalBalls - 1) / 6)
      const entry = overRuns.get(overKey) ?? { legal: 0, runs: 0 }
      entry.legal++
      entry.runs += ballRuns
      overRuns.set(overKey, entry)
    } else {
      const overKey = Math.floor(legalBalls / 6)
      const entry = overRuns.get(overKey) ?? { legal: 0, runs: 0 }
      entry.runs += ballRuns
      overRuns.set(overKey, entry)
    }

    if (b.isWicket && b.wicketType !== 'runOut') {
      wickets++
    }
  }

  let maidens = 0
  overRuns.forEach((entry) => {
    if (entry.legal === 6 && entry.runs === 0) maidens++
  })

  const completedOvers = Math.floor(legalBalls / 6)
  const ballsInOver = legalBalls % 6
  const oversDisplay = `${completedOvers}.${ballsInOver}`
  const economy = legalBalls > 0 ? (runs / legalBalls) * 6 : 0

  return {
    legalBalls,
    oversDisplay,
    runs,
    wickets,
    maidens,
    economy,
  }
}

export function getExtrasBreakdown(balls: Ball[]): ExtrasBreakdown {
  let wides = 0
  let noBalls = 0
  let byes = 0
  let legByes = 0

  for (const b of balls) {
    if (b.extraType === 'wide') wides += getBallRuns(b)
    else if (b.extraType === 'noBall') noBalls += getBallRuns(b)
    else if (b.extraType === 'bye') byes += b.runs
    else if (b.extraType === 'legBye') legByes += b.runs
  }

  return {
    wides,
    noBalls,
    byes,
    legByes,
    total: wides + noBalls + byes + legByes,
  }
}

export function getFallOfWickets(
  balls: Ball[],
  battingTeam: Team,
): FallOfWicket[] {
  const fow: FallOfWicket[] = []
  let runningScore = 0
  let wicketNum = 0
  let legalCount = 0

  for (const b of balls) {
    runningScore += getBallRuns(b)
    if (b.isLegalDelivery) legalCount++

    if (b.isWicket) {
      wicketNum++
      const player = battingTeam.players.find((p) => p.id === b.outBatsmanId)
      const completedOvers = Math.floor(legalCount / 6)
      const ballsInOver = legalCount % 6
      fow.push({
        wicket: wicketNum,
        score: runningScore,
        playerName: player?.name ?? 'Unknown',
        overDisplay: `${completedOvers}.${ballsInOver}`,
      })
    }
  }

  return fow
}

export function getOutPlayerIds(balls: Ball[]): Set<string> {
  const out = new Set<string>()
  for (const b of balls) {
    if (b.isWicket && b.outBatsmanId) {
      out.add(b.outBatsmanId)
    }
  }
  return out
}

export function getRemainingBatsmen(
  battingTeam: Team,
  balls: Ball[],
  currentIds: [string, string],
): Player[] {
  const out = getOutPlayerIds(balls)
  return battingTeam.players.filter(
    (p) => !out.has(p.id) && !currentIds.includes(p.id),
  )
}

export function getRemainingBalls(balls: Ball[], totalOvers: number): number {
  const legal = getLegalBallCount(balls)
  const totalBalls = totalOvers * 6
  return Math.max(0, totalBalls - legal)
}

export function isInningsComplete(
  innings: Innings,
  match: Match,
): boolean {
  const wickets = getWicketCount(innings.balls)
  const legal = getLegalBallCount(innings.balls)
  const maxBalls = match.overs * 6

  if (wickets >= match.wicketLimit) return true
  if (legal >= maxBalls) return true

  return false
}

export function isSecondInningsComplete(
  innings: Innings,
  match: Match,
  target: number,
): boolean {
  const total = getTotalRuns(innings.balls)
  if (total >= target) return true
  return isInningsComplete(innings, match)
}

export function getFirstInningsScore(innings: Innings[]): number | null {
  if (innings.length === 0) return null
  return getTotalRuns(innings[0].balls)
}

export function getTarget(innings: Innings[], currentIndex: number): number | null {
  if (currentIndex !== 1 || innings.length < 1) return null
  return getTotalRuns(innings[0].balls) + 1
}

export function getRequiredRuns(
  innings: Innings[],
  currentIndex: number,
): { runs: number; balls: number } | null {
  const target = getTarget(innings, currentIndex)
  if (target === null) return null

  const current = getTotalRuns(innings[currentIndex].balls)
  const remaining = getRemainingBalls(
    innings[currentIndex].balls,
    0,
  )

  return {
    runs: Math.max(0, target - current),
    balls: remaining,
  }
}

export function getRequiredRunsInfo(
  innings: Innings[],
  currentIndex: number,
  totalOvers: number,
): { runs: number; balls: number } | null {
  const target = getTarget(innings, currentIndex)
  if (target === null) return null

  const currentInnings = innings[currentIndex]
  const current = getTotalRuns(currentInnings.balls)
  const balls = getRemainingBalls(currentInnings.balls, totalOvers)

  return {
    runs: Math.max(0, target - current),
    balls,
  }
}

export function getMatchResult(
  match: Match,
  innings: Innings[],
): { winnerId: string; text: string } {
  const team2Balls =
    innings.find((i) => i.battingTeamId === match.team2.id)?.balls ?? []

  const score1 = getTotalRuns(
    innings.find((i) => i.battingTeamId === match.team1.id)?.balls ?? [],
  )
  const score2 = getTotalRuns(team2Balls)

  const wickets2 = getWicketCount(team2Balls)

  if (score1 > score2) {
    const margin = score1 - score2
    return {
      winnerId: match.team1.id,
      text: `${match.team1.name} wins by ${margin} runs`,
    }
  }

  if (score2 > score1) {
    const wicketsRemaining = match.wicketLimit - wickets2
    return {
      winnerId: match.team2.id,
      text: `${match.team2.name} wins by ${wicketsRemaining} wickets`,
    }
  }

  return {
    winnerId: '',
    text: 'Match tied',
  }
}

export function getPlayerOfTheMatch(
  match: Match,
  innings: Innings[],
): { name: string; stat: string; teamName: string } {
  let bestBatsman = { name: '', runs: -1, teamName: '' }
  let bestBowler = { name: '', wickets: -1, economy: 999, teamName: '' }

  for (const inn of innings) {
    const battingTeam = getTeamById(match, inn.battingTeamId)
    const bowlingTeam = getTeamById(match, inn.bowlingTeamId)

    for (const player of battingTeam.players) {
      const stats = getBattingStats(inn.balls, player.id, battingTeam.players)
      if (stats.runs > bestBatsman.runs) {
        bestBatsman = {
          name: player.name,
          runs: stats.runs,
          teamName: battingTeam.name,
        }
      }
    }

    for (const player of bowlingTeam.players) {
      const stats = getBowlingStats(inn.balls, player.id)
      if (
        stats.wickets > bestBowler.wickets ||
        (stats.wickets === bestBowler.wickets && stats.economy < bestBowler.economy)
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

export function getLastBowlerId(innings: Innings): string | null {
  const overStart = findCurrentOverStart(innings.balls)
  if (overStart === 0) return null

  for (let i = overStart - 1; i >= 0; i--) {
    if (innings.balls[i].isLegalDelivery) {
      return innings.balls[i].bowlerId
    }
  }
  return null
}

export function vibrate(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(30)
  }
}

export function formatScore(runs: number, wickets: number): string {
  return `${runs} / ${wickets}`
}
