import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sheet-backdrop fixed inset-0 z-40 max-w-[430px] mx-auto"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="sheet fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[430px] bg-white shadow-lg p-6 pb-8"
          >
            <div className="sheet-handle mx-auto mb-4" />
            <h3 className="text-lg font-bold text-heading mb-4">{title}</h3>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
