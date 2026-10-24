import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last-resort catch-all: a render error anywhere in the tree used to mean
 * a silent blank page (React unmounts the whole tree on an uncaught
 * error). This guarantees the user sees something actionable instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Last-resort diagnostic -- no error reporting service wired up yet.
    console.error('Unhandled error in Footprints:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center safe-top safe-bottom">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-status-danger/10 text-status-danger">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Something went wrong</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            Footprints hit an unexpected error. Reloading usually fixes it; if it keeps happening, let your admin know.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-card tap-target"
        >
          <RefreshCw className="h-4 w-4" /> Reload
        </button>
      </div>
    )
  }
}
