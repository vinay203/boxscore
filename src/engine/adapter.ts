import type {
  Ball,
  ExtraType,
  Innings,
  InningsStatus,
  Match,
  WicketType,
} from '../types'
import { deriveInnings } from './deriveInnings'
import {
  defaultRules,
  type DerivedInnings,
  type InningsEvent,
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

  const events = currentInnings?.events ?? []
  return deriveInnings(events, {
    rules,
    battingPlayerIds,
    players,
    target,
  })
}

export function toLegacyBalls(
  _events: InningsEvent[],
  derived: DerivedInnings,
): Ball[] {
  let legalSoFar = 0
  const legacyBalls: Ball[] = []

  for (const b of derived.balls) {
    const isLegalDelivery = b.isLegal
    const over = Math.floor(legalSoFar / 6)
    const ball = (legalSoFar % 6) + 1
    if (isLegalDelivery) {
      legalSoFar++
    }

    let runs = b.batRuns
    let extraType: ExtraType | undefined = undefined

    if (b.delivery === 'wide') {
      extraType = 'wide'
      runs = b.wideExtraRuns
    } else if (b.delivery === 'noBall') {
      extraType = 'noBall'
      runs = b.batRuns
    } else if (b.byeRuns > 0) {
      extraType = 'bye'
      runs = b.byeRuns
    } else if (b.legByeRuns > 0) {
      extraType = 'legBye'
      runs = b.legByeRuns
    }

    const isWicket = !!b.wicket
    let wicketType: WicketType | undefined = undefined
    let outBatsmanId: string | undefined = undefined

    if (b.wicket) {
      outBatsmanId = b.wicket.outId
      const k = b.wicket.kind
      if (
        k === 'bowled' ||
        k === 'caught' ||
        k === 'runOut' ||
        k === 'lbw' ||
        k === 'stumped' ||
        k === 'hitWicket'
      ) {
        wicketType = k
      } else {
        wicketType = 'runOut'
      }
    }

    legacyBalls.push({
      over,
      ball,
      batsmanId: b.strikerId,
      bowlerId: b.bowlerId,
      runs,
      extraType,
      isWicket,
      wicketType,
      outBatsmanId,
      isLegalDelivery,
    })
  }

  return legacyBalls
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
  const balls = toLegacyBalls(innings.events ?? [], derived)
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
    balls,
    currentBatsmanIds,
    currentBowlerId,
    pendingBatsmanSelection,
    pendingBowlerSelection,
    status,
  }
}
