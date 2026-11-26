import type {
  Innings,
  InningsStatus,
  Match,
} from '../types'
import { deriveInnings } from './deriveInnings'
import {
  defaultRules,
  type DerivedInnings,
  type InningsContext,
  type MatchRules,
} from './types'

export function rulesFromMatch(match: Match): MatchRules {
  return {
    ...defaultRules,
    overs: match.overs,
    wicketsPerInnings: match.wicketLimit,
    playersPerTeam: match.playersPerTeam,
  }
}

export function deriveForInnings(
  match: Match,
  allInnings: Innings[],
  inningsIndex: number,
): DerivedInnings {
  return deriveInnings(allInnings[inningsIndex]?.events ?? [], getInningsContext(match, allInnings, inningsIndex))
}

export function getInningsContext(
  match: Match,
  allInnings: Innings[],
  inningsIndex: number,
): InningsContext {
  const rules = rulesFromMatch(match)
  const currentInnings = allInnings[inningsIndex]
  const battingTeam =
    match.team1.id === currentInnings.battingTeamId ? match.team1 : match.team2
  const battingPlayerIds = battingTeam.players.map((p) => p.id)

  const players: Record<string, { name: string }> = {}
  for (const p of match.team1.players) {
    players[p.id] = { name: p.name }
  }
  for (const p of match.team2.players) {
    players[p.id] = { name: p.name }
  }

  let target: number | undefined = undefined
  if (inningsIndex === 1 && allInnings[0]) {
    const d0 = deriveForInnings(match, allInnings, 0)
    target = d0.score.runs + 1
  }

  return {
    rules,
    battingPlayerIds,
    players,
    target,
  }
}

export function syncInnings(
  innings: Innings,
  match: Match,
  allInnings: Innings[],
  inningsIndex: number,
): Innings {
  const updatedAllInnings = [...allInnings]
  updatedAllInnings[inningsIndex] = innings

  const derived = deriveForInnings(match, updatedAllInnings, inningsIndex)
  const currentBatsmanIds: [string, string] = [
    derived.strikerId ?? '',
    derived.nonStrikerId ?? '',
  ]
  const pendingBatsmanSelection = !(innings.events ?? []).some(
    (e) => e.type === 'openers',
  )
  const status: InningsStatus = derived.isComplete ? 'complete' : 'live'

  const needsNewBowler = derived.needsNewBowler
  const bowlerAlreadySelected =
    needsNewBowler &&
    innings.currentBowlerId !== '' &&
    innings.currentBowlerId !== derived.currentBowlerId &&
    !innings.pendingBowlerSelection

  const currentBowlerId =
    needsNewBowler && !bowlerAlreadySelected ? '' : innings.currentBowlerId
  const pendingBowlerSelection =
    (needsNewBowler && !bowlerAlreadySelected) ||
    (derived.balls.length === 0 && !currentBowlerId) ||
    innings.pendingBowlerSelection

  return {
    ...innings,
    currentBatsmanIds,
    currentBowlerId,
    pendingBatsmanSelection,
    pendingBowlerSelection,
    status,
  }
}
