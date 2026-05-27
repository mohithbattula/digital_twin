"use client";

export function SkeletonCard() {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="skeleton w-8 h-8 rounded-lg" />
        <div className="flex-1">
          <div className="skeleton h-3 w-3/4 mb-2" />
          <div className="skeleton h-2.5 w-1/2" />
        </div>
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="skeleton h-2 w-full mb-2" />
      <div className="skeleton h-2 w-2/3" />
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <div className="skeleton w-6 h-6 rounded" />
        <div className="skeleton h-2.5 w-16" />
      </div>
      <div className="skeleton h-7 w-12" />
    </div>
  );
}

export function SkeletonTimeline() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="timeline-item">
          <div className="skeleton w-3 h-3 rounded-full absolute left-0 top-1" />
          <div className="skeleton h-3 w-3/4 mb-1.5" />
          <div className="skeleton h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}
