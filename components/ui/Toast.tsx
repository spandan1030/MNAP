export function Toast({ show, message }: { show: boolean; message: string }) {
  if (!show) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 toast-slide-up whitespace-nowrap">
      <span>✓</span>
      <span>{message}</span>
    </div>
  )
}
