import type { DeliveryKind, Wicket, WicketKind } from './types'

export type BallEditorChoice =
  | 'legal'
  | 'wide'
  | 'noBall'
  | 'bye'
  | 'legBye'
  | 'noBallBye'
  | 'noBallLegBye'

export interface BallEditorState {
  choice: BallEditorChoice
  runs: number
  bowlerId: string
  wicket?: Wicket
  bouncer?: boolean
  id?: string
}

export interface BuiltEditorBall {
  type: 'ball'
  id?: string
  bowlerId: string
  delivery: DeliveryKind
  batRuns: number
  byeRuns: number
  legByeRuns: number
  wideExtraRuns: number
  bouncer?: boolean
  wicket?: Wicket
}

const NO_RUN_WICKETS: WicketKind[] = ['bowled', 'caught', 'lbw', 'stumped', 'hitWicket']

export function buildBallFromEditor(state: BallEditorState & { id: string }): { ball: BuiltEditorBall & { id: string } } | { error: string }
export function buildBallFromEditor(state: BallEditorState): { ball: BuiltEditorBall } | { error: string }
export function buildBallFromEditor(state: BallEditorState): { ball: BuiltEditorBall } | { error: string } {
  const isBye = ['bye', 'legBye', 'noBallBye', 'noBallLegBye'].includes(state.choice)
  if (isBye && state.runs < 1) return { error: 'Byes need at least 1 run' }

  const forceZero = !!state.wicket && NO_RUN_WICKETS.includes(state.wicket.kind)
  const runs = forceZero ? 0 : state.runs
  const delivery: DeliveryKind = state.choice === 'wide' ? 'wide'
    : state.choice === 'noBall' || state.choice === 'noBallBye' || state.choice === 'noBallLegBye' ? 'noBall'
      : 'legal'
  const ball: BuiltEditorBall = {
    type: 'ball',
    ...(state.id ? { id: state.id } : {}),
    bowlerId: state.bowlerId,
    delivery,
    batRuns: state.choice === 'legal' || state.choice === 'noBall' ? runs : 0,
    byeRuns: state.choice === 'bye' || state.choice === 'noBallBye' ? runs : 0,
    legByeRuns: state.choice === 'legBye' || state.choice === 'noBallLegBye' ? runs : 0,
    wideExtraRuns: state.choice === 'wide' ? runs : 0,
    ...(state.bouncer ? { bouncer: true } : {}),
    ...(state.wicket ? { wicket: state.wicket } : {}),
  }
  return { ball }
}
