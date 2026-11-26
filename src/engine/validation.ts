import { allowedWicketKinds, deriveInnings } from './deriveInnings'
import type { DeliveryKind, InningsContext, InningsEvent, Wicket, WicketKind } from './types'

export interface BallInput {
  delivery: DeliveryKind
  batRuns?: number
  byeRuns?: number
  legByeRuns?: number
  wideExtraRuns?: number
  wicket?: Wicket
}

export interface BallValidationContext {
  strikerId: string | null
  nonStrikerId: string | null
  isFreeHit: boolean
}

const NO_RUN_WICKETS: WicketKind[] = ['bowled', 'caught', 'lbw', 'stumped', 'hitWicket']
const STRIKER_ONLY_WICKETS: WicketKind[] = [...NO_RUN_WICKETS, 'hitBallTwice']

export function validateBallInput(
  ball: BallInput,
  context: BallValidationContext,
): string | null {
  const has = (key: keyof BallInput) => Object.prototype.hasOwnProperty.call(ball, key)
  if (ball.delivery === 'wide' && (has('batRuns') || has('byeRuns') || has('legByeRuns'))) {
    return 'A wide cannot include bat runs, byes, or leg-byes'
  }
  if (has('byeRuns') && has('legByeRuns')) return 'Choose byes or leg-byes, not both'
  if (has('batRuns') && (has('byeRuns') || has('legByeRuns'))) {
    return 'Bat runs cannot be combined with byes or leg-byes'
  }
  if (ball.delivery === 'legal' &&
    ((has('byeRuns') && ball.byeRuns === 0) || (has('legByeRuns') && ball.legByeRuns === 0))) {
    return 'A bye or leg-bye must be at least one run'
  }

  const wicket = ball.wicket
  if (!wicket) return null
  const withByes = (ball.byeRuns ?? 0) > 0 || (ball.legByeRuns ?? 0) > 0
  if (!allowedWicketKinds(ball.delivery, context.isFreeHit, withByes).includes(wicket.kind)) {
    return `Wicket '${wicket.kind}' is not allowed on this delivery`
  }
  if (NO_RUN_WICKETS.includes(wicket.kind) &&
    ((ball.batRuns ?? 0) > 0 || (ball.byeRuns ?? 0) > 0 ||
      (ball.legByeRuns ?? 0) > 0 || (ball.wideExtraRuns ?? 0) > 0)) {
    return `Wicket '${wicket.kind}' cannot include completed runs`
  }
  if (wicket.outId !== context.strikerId && wicket.outId !== context.nonStrikerId) {
    return 'Dismissed batter must be at the crease'
  }
  if (STRIKER_ONLY_WICKETS.includes(wicket.kind) && wicket.outId !== context.strikerId) {
    return 'This dismissal must be of the striker'
  }
  return null
}

export function getAvailableBattersAt(
  events: InningsEvent[],
  ctx: InningsContext,
  eventIndex: number,
): { id: string; name: string }[] {
  const { batting } = deriveInnings(events.slice(0, eventIndex), ctx)
  return ctx.battingPlayerIds
    .filter((id) => {
      const status = batting[id]?.status ?? 'didNotBat'
      return status === 'didNotBat' || status === 'retiredHurt'
    })
    .map((id) => ({ id, name: ctx.players[id]?.name ?? id }))
}
