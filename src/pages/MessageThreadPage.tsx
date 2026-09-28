import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Store } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { useMessages } from '@/features/conversations/MessagesContext'
import { PostCard } from '@/features/conversations/PostCard'
import { useColleagues } from '@/features/conversations/useColleagues'
import { useConversation } from '@/features/conversations/useConversation'

/**
 * One conversation opened from Messages (/messages/:postId): the full post,
 * every reply expanded, reactions and a reply box. Opening it marks it read.
 */
export function MessageThreadPage() {
  const { postId } = useParams<{ postId: string }>()
  const { profile } = useProfile()
  const colleagues = useColleagues()
  const { markRead } = useMessages()
  const { posts, replies, loading, error, refresh } = useConversation(postId ? { postId } : null)
  const post = posts[0]
  const replyCount = post ? (replies[post.id]?.length ?? 0) : 0

  // Mark read on open and again whenever new replies arrive while it's open.
  useEffect(() => {
    if (post) markRead(post.id).catch(() => {})
  }, [post, replyCount, markRead])

  if (loading && !post) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-4 md:max-w-2xl">
        <div className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="mx-auto max-w-lg p-4 md:max-w-2xl">
        <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error ?? 'This conversation isn’t available to you.'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-6 pt-1 md:max-w-2xl md:px-8 md:pt-4">
      <Link to={`/customers/${post.customer_id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-neutral-900">{post.customer_name ?? 'Customer'}</span>
          <span className="block text-xs text-neutral-500">Open customer · all calls and notes</span>
        </span>
        <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
      </Link>

      <PostCard post={post} replies={replies[post.id] ?? []} meId={profile?.id ?? null} colleagues={colleagues} onChanged={refresh} expanded />
    </div>
  )
}
