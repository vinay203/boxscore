import type { WicketKind } from './types'

export const DISMISSAL_TYPES: { type: WicketKind; label: string }[] = [
  { type: 'bowled', label: 'Bowled' },
  { type: 'caught', label: 'Caught' },
  { type: 'runOut', label: 'Run Out' },
  { type: 'lbw', label: 'LBW' },
  { type: 'stumped', label: 'Stumped' },
  { type: 'hitWicket', label: 'Hit Wicket' },
  { type: 'obstructingField', label: 'Obstructing Field' },
  { type: 'hitBallTwice', label: 'Hit Ball Twice' },
]
