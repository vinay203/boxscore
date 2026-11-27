import { useState } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { PlayerRole, PoolPlayer } from '../types'
import { useMatchStore } from '../store/matchStore'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { BottomSheet } from './ui/BottomSheet'
import { PageTransition } from './ui/PageTransition'

const roles: { value: PlayerRole | ''; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'batsman', label: 'Batsman' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'allrounder', label: 'All-rounder' },
  { value: 'wicketkeeper', label: 'Wicketkeeper' },
]

function roleLabel(role?: PlayerRole): string {
  return roles.find((item) => item.value === role)?.label ?? ''
}

function RoleChips({ value, onChange }: { value: PlayerRole | ''; onChange: (role: PlayerRole | '') => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((role) => (
        <button
          key={role.value || 'none'}
          type="button"
          onClick={() => onChange(role.value)}
          className={`toss-btn ${value === role.value ? 'selected' : ''}`}
          style={{ padding: '8px 12px', fontSize: '12px' }}
        >
          {role.label}
        </button>
      ))}
    </div>
  )
}

export function PlayersScreen() {
  const { playerPool, setScreen, addPoolPlayer, updatePoolPlayer, removePoolPlayer } = useMatchStore()
  const [name, setName] = useState('')
  const [role, setRole] = useState<PlayerRole | ''>('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<PoolPlayer | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<PlayerRole | ''>('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const openEditor = (player: PoolPlayer) => {
    setSelected(player)
    setEditName(player.name)
    setEditRole(player.role ?? '')
    setError('')
    setConfirmDelete(false)
  }

  const addPlayer = () => {
    const result = addPoolPlayer(name, role || undefined)
    setError(result.error ?? '')
    if (result.ok) {
      setName('')
      setRole('')
    }
  }

  const savePlayer = () => {
    if (!selected) return
    const result = updatePoolPlayer(selected.id, { name: editName, role: editRole || undefined })
    setError(result.error ?? '')
    if (result.ok) setSelected(null)
  }

  const deletePlayer = () => {
    if (!selected) return
    const result = removePoolPlayer(selected.id)
    setError(result.error ?? '')
    if (result.ok) setSelected(null)
  }

  return (
    <>
      <PageTransition className="pb-10">
        <button type="button" onClick={() => setScreen('home')} className="back-button mb-4 btn-press">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="mb-4">
          <h1 className="text-2xl font-bold" style={{ color: '#111' }}>Players</h1>
          <p className="text-xs text-gray-400 mt-0.5">{playerPool.length} saved player{playerPool.length === 1 ? '' : 's'}</p>
        </div>

        <Card className="mb-4 p-4">
          <div className="flex items-end gap-2">
            <Input label="Player name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
            <Button onClick={addPlayer}>Add</Button>
          </div>
          <div className="mt-3"><RoleChips value={role} onChange={setRole} /></div>
          {error && !selected && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </Card>

        {playerPool.length === 0 ? (
          <Card className="text-center py-8 px-4">
            <p className="text-sm text-gray-500">No saved players yet. Players you type when starting a match are saved here automatically.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {playerPool.map((player) => (
              <button key={player.id} type="button" onClick={() => openEditor(player)} className="w-full text-left p-0 border-0 bg-transparent block btn-press group">
                <Card className="p-4 flex items-center justify-between hover:border-gray-300 transition-all">
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{player.name}</span>
                    {player.role && <span className="block text-[11px] text-gray-400 mt-0.5">{roleLabel(player.role)}</span>}
                  </span>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-700" />
                </Card>
              </button>
            ))}
          </div>
        )}
      </PageTransition>

      <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={confirmDelete ? 'Delete player?' : 'Edit player'}>
        {confirmDelete ? (
          <div className="pt-2">
            <p className="text-sm text-gray-600 mb-4">Delete player? This will not change past matches.</p>
            <div className="flex gap-2">
              <Button variant="danger" fullWidth onClick={deletePlayer}>Delete</Button>
              <Button variant="secondary" fullWidth onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="pt-2">
            <Input label="Player name" value={editName} onChange={(event) => setEditName(event.target.value)} />
            <div className="mt-3"><RoleChips value={editRole} onChange={setEditRole} /></div>
            {error && selected && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <Button fullWidth className="mt-4" onClick={savePlayer}>Save</Button>
            <Button fullWidth variant="ghost" className="mt-2 text-red-600" onClick={() => setConfirmDelete(true)}>Delete</Button>
          </div>
        )}
      </BottomSheet>
    </>
  )
}
