import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, ClipboardList, MapPin, ShoppingCart, type LucideIcon } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { VisitFlow } from '@/features/visits/VisitFlow'
import { NewCustomerSheet } from '@/features/customers/NewCustomerSheet'

/**
 * The field nav's center "+" action (spec): New Visit, New Order,
 * Collection, New Customer. New Order and Collection have no product/cart
 * or payments backend wired up yet (a separate, larger project) -- shown
 * disabled rather than left out, so the menu still reads as the full
 * intended set.
 */
export function QuickActionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [visitOpen, setVisitOpen] = useState(false)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="New">
        <div className="grid grid-cols-2 gap-3 p-4">
          <QuickAction
            icon={MapPin}
            label="New Visit"
            onClick={() => {
              onClose()
              setVisitOpen(true)
            }}
          />
          <QuickAction icon={ShoppingCart} label="New Order" comingSoon />
          <QuickAction icon={Banknote} label="Collection" comingSoon />
          <QuickAction
            icon={ClipboardList}
            label="New Customer"
            onClick={() => {
              onClose()
              setNewCustomerOpen(true)
            }}
          />
        </div>
      </BottomSheet>

      <VisitFlow open={visitOpen} onClose={() => setVisitOpen(false)} />
      <NewCustomerSheet
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onCreated={(customerId) => {
          setNewCustomerOpen(false)
          navigate(`/customers/${customerId}`)
        }}
      />
    </>
  )
}

function QuickAction({
  icon: Icon,
  label,
  comingSoon,
  onClick,
}: {
  icon: LucideIcon
  label: string
  comingSoon?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className="flex flex-col items-center gap-2 rounded-xl2 border border-neutral-200 bg-white p-4 text-center tap-target disabled:opacity-40 dark:border-neutral-700"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-neutral-800 dark:text-brand-300">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-sm font-medium text-neutral-800">{label}</span>
      {comingSoon && <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Coming soon</span>}
    </button>
  )
}
