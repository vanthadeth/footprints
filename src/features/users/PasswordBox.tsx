import { useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { haptic } from '@/lib/haptic'

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' // no 0/O/1/l/I -- same alphabet the server falls back to

/** A reasonable starting suggestion -- the admin can keep it, edit it, or replace it entirely with their own. */
export function generateSuggestedPassword(length = 12): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('')
}

/**
 * An editable password field with "generate a new suggestion" and "copy"
 * actions -- used wherever an admin sets someone's password (new user,
 * generate new password). The admin can type their own value at any point;
 * this never auto-submits anything on its own.
 */
export function PasswordBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      haptic('success')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be blocked (permissions, non-secure context) -- the password stays visible in the field either way.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Password"
        className="w-full flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 font-mono text-sm text-neutral-900"
      />
      <button
        type="button"
        onClick={() => {
          haptic('light')
          onChange(generateSuggestedPassword())
        }}
        aria-label="Generate a new password"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 tap-target"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy password"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 tap-target"
      >
        {copied ? <Check className="h-4 w-4 text-status-working" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}
