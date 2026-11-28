export type WicketKind =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'stumped'
  | 'hitWicket'
  | 'runOut'
  | 'obstructingField'
  | 'hitBallTwice'

export type DeliveryKind = 'legal' | 'wide' | 'noBall'

export interface MatchRules {
  overs: number
  wicketsPerInnings: number
  playersPerTeam: number
  wideRuns: number
  noBallRuns: number
  freeHitAfterNoBall: boolean
  freeHitAfterWide: boolean
  bouncersPerOver: number
  bouncerOverLimitIsNoBall: boolean
  maxOversPerBowler: number
  jokerEnabled: boolean
  jokerCanBat: boolean
  jokerCanBowl: boolean
  jokerId?: string
  lastManStands: boolean
}

export const defaultRules: MatchRules = {
  overs: 6,
  wicketsPerInnings: 5,
  playersPerTeam: 6,
  wideRuns: 1,
  noBallRuns: 1,
  freeHitAfterNoBall: true,
  freeHitAfterWide: false,
  bouncersPerOver: 2,
  bouncerOverLimitIsNoBall: false,
  maxOversPerBowler: 0,
  jokerEnabled: false,
  jokerCanBat: false,
  jokerCanBowl: false,
  lastManStands: false,
}

export interface Wicket {
  kind: WicketKind
  outId: string
  fielderId?: string
  newBatterId?: string
}

export type InningsEvent =
  | { id: string; type: 'openers'; strikerId: string; nonStrikerId: string }
  | {
      id: string
      type: 'ball'
      bowlerId: string
      delivery: DeliveryKind
      batRuns: number
      byeRuns: number
      legByeRuns: number
      wideExtraRuns: number
      bouncer?: boolean
      wicket?: Wicket
    }
  | { id: string; type: 'swapEnds' }
  | { id: string; type: 'retiredHurt'; batterId: string; replacementId?: string }
  | {
      id: string
      type: 'dismissal'
      kind: 'retiredOut' | 'timedOut'
      outId: string
      newBatterId?: string
    }
  | { id: string; type: 'endInnings' }

export interface InningsContext {
  rules: MatchRules
  battingPlayerIds: string[]
  players: Record<string, { name: string }>
  target?: number
}

export interface DerivedWicket {
  kind: WicketKind
  outId: string
  fielderId?: string
  creditedToBowler: boolean
}

export interface DerivedBall {
  eventId: string
  over: number
  ballInOver: number
  strikerId: string
  nonStrikerId: string
  bowlerId: string
  totalRuns: number
  isLegal: boolean
  isFreeHit: boolean
  ballFacedByStriker: boolean
  runsChargedToBowler: number
  delivery: DeliveryKind
  batRuns: number
  byeRuns: number
  legByeRuns: number
  wideExtraRuns: number
  bouncer: boolean
  wicket?: DerivedWicket
}

export interface ExtrasBreakdown {
  wides: number
  noBalls: number
  byes: number
  legByes: number
  total: number
}

export interface InningsScore {
  runs: number
  wickets: number
  legalBalls: number
  oversDisplay: string
  extras: ExtrasBreakdown
}

export type BatterStatus = 'didNotBat' | 'batting' | 'out' | 'retiredHurt'

export interface PlayerBattingStats {
  playerId: string
  runs: number
  balls: number
  fours: number
  sixes: number
  strikeRate: number
  status: BatterStatus
  dismissalText: string
}

export interface PlayerBowlingStats {
  playerId: string
  legalBalls: number
  oversDisplay: string
  runs: number
  wickets: number
  maidens: number
  wides: number
  noBalls: number
  bouncers: number
  bouncersByOver: Record<number, number>
  economy: number
}

export interface FallOfWicket {
  wicket: number
  score: number
  playerName: string
  oversDisplay: string
}

export interface Partnership {
  runs: number
  balls: number
}

export type CompleteReason = 'allOut' | 'oversDone' | 'targetChased' | 'ended'

export interface DerivedInnings {
  balls: DerivedBall[]
  score: InningsScore
  strikerId: string | null
  nonStrikerId: string | null
  currentBowlerId: string | null
  needsNewBatter: boolean
  needsNewBowler: boolean
  isFreeHitNext: boolean
  isComplete: boolean
  completeReason?: CompleteReason
  batting: Record<string, PlayerBattingStats>
  bowling: Record<string, PlayerBowlingStats>
  fallOfWickets: FallOfWicket[]
  currentPartnership: Partnership
  errors: string[]
}
