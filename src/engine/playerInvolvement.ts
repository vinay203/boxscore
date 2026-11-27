import type { Innings } from '../types'

export function isPlayerInvolved(innings: Innings[], playerId: string): boolean {
  return innings.some((inn) => {
    if (inn.currentBatsmanIds.includes(playerId) || inn.currentBowlerId === playerId) return true
    return (inn.events ?? []).some((event) => {
      if (event.type === 'openers') {
        return event.strikerId === playerId || event.nonStrikerId === playerId
      }
      if (event.type === 'ball') {
        return event.bowlerId === playerId || event.wicket?.outId === playerId ||
          event.wicket?.fielderId === playerId || event.wicket?.newBatterId === playerId
      }
      if (event.type === 'retiredHurt') {
        return event.batterId === playerId || event.replacementId === playerId
      }
      if (event.type === 'dismissal') {
        return event.outId === playerId || event.newBatterId === playerId
      }
      return false
    })
  })
}
