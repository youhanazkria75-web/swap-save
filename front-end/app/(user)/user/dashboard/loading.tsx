export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5 space-y-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-7 w-16 bg-muted rounded-lg" />
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="h-5 w-32 bg-muted rounded" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 flex items-center gap-4">
              <div className="flex gap-2">
                <div className="h-12 w-12 bg-muted rounded-lg" />
                <div className="h-12 w-12 bg-muted rounded-lg" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-muted rounded" />
                <div className="h-3 w-32 bg-muted rounded" />
              </div>
              <div className="h-6 w-20 bg-muted rounded-full" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <div className="h-5 w-28 bg-muted rounded" />
            <div className="h-2 w-full bg-muted rounded-full" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
