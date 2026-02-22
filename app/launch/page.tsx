"use client";

import dynamic from "next/dynamic";

const NuclearLaunchSequence = dynamic(
  () =>
    import("@/components/nuclear-launch-sequence").then((m) => ({
      default: m.NuclearLaunchSequence,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-slate-950 pt-[128px] flex items-center justify-center">
        <div className="text-cyan-400 font-orbitron animate-pulse">
          INITIALIZING LAUNCH SYSTEMS...
        </div>
      </div>
    ),
  },
);

export default function LaunchPage() {
  return <NuclearLaunchSequence />;
}
