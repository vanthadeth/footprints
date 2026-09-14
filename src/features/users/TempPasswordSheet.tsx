import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { haptic } from '@/lib/haptic'

/** Shown once right after creating a user or generating a new password -- the plaintext temp password is never stored or shown again after this. */
export function TempPasswordSheet({ password, onClose }: { password: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!password) return
    try {
      await navigator.clipboard.writeText(password)
      haptic('success')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be blocked (permissions, non-secure context) -- the password stays visible either way.
    }
  }

  return (
    <BottomSheet open={password !== null} onClose={onClose} title="Temporary Password">
      <div className="p-4">
        <p className="text-sm text-neutral-600">
          Share this with them through a secure channel (not this screen) -- it won't be shown again. They'll be asked to
          set their own password the next time they sign in.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl2 bg-neutral-50 px-4 py-3.5 dark:bg-neutral-800">
          <span className="font-mono text-lg font-semibold tracking-wide text-neutral-900">{password}</span>
          <button
            onClick={handleCopy}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white tap-target"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white tap-target">
          Done
        </button>
      </div>
    </BottomSheet>
  )
}
