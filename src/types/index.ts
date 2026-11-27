import type { InningsEvent, WicketKind } from '../engine/types'

export type ExtraType = 'wide' | 'noBall' | 'bye' | 'legBye'

export type WicketType = WicketKind

export type PlayerRole = 'batsman' | 'bowler' | 'allrounder' | 'wicketkeeper'

export type MatchStatus =
  | 'setup'
  | 'toss'
  | 'live'
  | 'innings_break'
  | 'complete'

export type InningsStatus = 'live' | 'complete'

export interface Player {
  id: string
  name: string
  poolId?: string
  role?: PlayerRole
}

export interface PoolPlayer {
  id: string
  name: string
  role?: PlayerRole
  createdAt: string
}

export interface Team {
  id: string
  name: string
  players: Player[]
  captainId?: string
}

export interface SavedTeam {
  id: string
  name: string
  playerIds: string[]
  captainId?: string
}

export interface Ball {
  over: number
  ball: number
  batsmanId: string
  bowlerId: string
  runs: number
  extraType?: ExtraType
  isWicket: boolean
  wicketType?: WicketType
  outBatsmanId?: string
  isLegalDelivery: boolean
}

export interface Innings {
  battingTeamId: string
  bowlingTeamId: string
  balls?: Ball[]
  currentBatsmanIds: [string, string]
  currentBowlerId: string
  status: InningsStatus
  pendingBowlerSelection: boolean
  pendingBatsmanSelection?: boolean
  events?: InningsEvent[]
}

export interface Match {
  title?: string
  overs: number
  wicketLimit: number
  playersPerTeam: number
  team1: Team
  team2: Team
  tossWinnerId: string
  battingFirstId: string
}

export interface MatchState {
  match: Match | null
  innings: Innings[]
  currentInningsIndex: number
  matchStatus: MatchStatus
}

export interface BattingStats {
  runs: number
  ballsFaced: number
  fours: number
  sixes: number
  strikeRate: number
  isOut: boolean
  dismissal?: string
}

export interface BowlingStats {
  legalBalls: number
  oversDisplay: string
  runs: number
  wickets: number
  maidens: number
  economy: number
}

export interface FallOfWicket {
  wicket: number
  score: number
  playerName: string
  overDisplay: string
}

export interface ExtrasBreakdown {
  wides: number
  noBalls: number
  byes: number
  legByes: number
  total: number
}

export interface CompletedMatchSummary {
  id: string
  date: string
  title?: string
  winnerName: string
  resultText: string
  team1Name: string
  team1Score: string
  team2Name: string
  team2Score: string
  match?: Match
  innings?: Innings[]
  potm?: {
    name: string
    stat: string
    teamName: string
  }
}

export type Screen = 'home' | 'history' | 'players' | 'setup' | 'live' | 'summary'
