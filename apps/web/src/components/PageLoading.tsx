/**
 * Full-page loading state, used while a route resolves its data.
 */
export function PageLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-text-secondary">
      <p>Loading...</p>
    </div>
  )
}
