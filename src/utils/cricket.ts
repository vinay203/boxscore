import type { Match, Player, Team } from '../types'

export function generateId(): string {
  return crypto.randomUUID()
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

export function vibrate(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(30)
  }
}
