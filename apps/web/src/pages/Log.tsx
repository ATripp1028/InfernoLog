/**
 * The logging entry point. Opens the logging flow and renders nothing of its own.
 */
export function Log() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Log</h1>
      <p className="mt-2 text-text-secondary">Logged events appear here</p>
    </div>
  )
}
