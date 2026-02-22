"use client";

import dynamic from "next/dynamic";

const PeriscopeSimulator = dynamic(
  () =>
    import("@/components/periscope-simulator").then((m) => ({
      default: m.PeriscopeSimulator,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-slate-950 pt-[128px] flex items-center justify-center">
        <div className="text-cyan-400 font-orbitron animate-pulse">
          RAISING PERISCOPE...
        </div>
      </div>
    ),
  },
);

export default function PeriscopePage() {
  return <PeriscopeSimulator />;
}
