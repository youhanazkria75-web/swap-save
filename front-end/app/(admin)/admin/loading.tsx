export default function AdminLoading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-pulse">
      <div className="h-8 w-48 bg-muted rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5 space-y-2">
            <div className="h-4 w-20 bg-muted rounded" />
            <div className="h-7 w-14 bg-muted rounded-lg" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5">
            <div className="h-5 w-32 bg-muted rounded mb-4" />
            <div className="h-48 bg-muted rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
