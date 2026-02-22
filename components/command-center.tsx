"use client";

import type React from "react";
import { useState } from "react";
import {
  Radar,
  AlertTriangle,
  Eye,
  Map,
  Settings,
  Shield,
  Lock,
} from "lucide-react";
import { SonarGridBackground } from "./sonar-grid-background";
import { SecurityFooter } from "./security-classified-bar";
import DetectionView from "./detection-view";
import VesselTracking from "./vessel-tracking";
import ThreatAnalysis from "./threat-analysis";
import { getThreatStats, loadDetections } from "@/lib/detection-storage";

interface Detection {
  class: string;
  confidence: number;
  threat_level?: string;
  bbox: [number, number, number, number];
  color: string;
}

interface DetectionResult {
  originalImage: string;
  detectedImage: string;
  originalFileName?: string;
  detections: Detection[];
  processingTime: number;
  totalObjects: number;
  overallThreatLevel?: string;
  overallThreatScore?: number;
  threatCount?: number;
  timestamp?: Date;
}

export default function CommandCenter() {
  const [activeTab, setActiveTab] = useState<
    "detection" | "vessels" | "threats"
  >("detection");
  const [systemStatus] = useState("ACTIVE");
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>(
    () => {
      const stored = loadDetections();
      return stored.map((s) => ({
        originalImage: s.originalImage,
        detectedImage: s.detectedImage,
        detections: s.detections,
        processingTime: s.processingTime,
        totalObjects: s.totalObjects,
        overallThreatLevel: s.overallThreatLevel,
        overallThreatScore: s.overallThreatScore,
        threatCount: s.threatCount,
        timestamp: new Date(s.timestamp),
      }));
    },
  );

  const stats = getThreatStats();
  const totalThreats = stats.totalThreats;
  const avgAccuracy = stats.avgConfidence;
  const criticalThreats = stats.criticalThreats;

  const handleDetectionComplete = (results: DetectionResult[]) => {
    setDetectionResults(results);
  };

  return (
    <div className="relative w-full min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 overflow-hidden">
      <SonarGridBackground />

      <div className="relative z-10 pt-28">
        {/* Top navigation bar */}
        <nav className="border-b border-cyan-500/20 bg-slate-900/80 backdrop-blur-xl">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-cyan-500 rounded-lg opacity-20 blur-lg" />
                  <div className="relative bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-lg border border-cyan-400/50 shadow-lg shadow-cyan-500/30">
                    <Radar className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div>
                  <h1 className="text-xl font-bold font-orbitron tracking-wider text-cyan-300 text-glow-cyan">
                    MAREYE
                  </h1>
                  <p className="text-xs font-space-mono text-slate-400">
                    Marine Threat Detection System
                  </p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="text-[9px] font-space-mono text-emerald-400/80 uppercase tracking-wider">
                    Encrypted Channel
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-40" />
                  </div>
                  <span className="text-xs font-space-mono text-emerald-400 font-bold">
                    SYSTEM {systemStatus}
                  </span>
                </div>
                <div className="h-8 w-px bg-cyan-500/20" />

                <div className="flex gap-8">
                  <div className="text-center">
                    <div className="text-sm font-space-mono text-cyan-300 font-orbitron">
                      {detectionResults.length}
                    </div>
                    <p className="text-xs text-slate-500 font-space-mono">
                      Scans
                    </p>
                  </div>
                  <div className="text-center">
                    <div
                      className={`text-sm font-space-mono font-orbitron ${totalThreats > 0 ? "text-red-400" : "text-emerald-400"}`}
                    >
                      {totalThreats}
                    </div>
                    <p className="text-xs text-slate-500 font-space-mono">
                      Threats
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-space-mono text-emerald-400">
                      {avgAccuracy}%
                    </div>
                    <p className="text-xs text-slate-500">Confidence</p>
                  </div>
                </div>
              </div>

              <button className="p-2 hover:bg-cyan-500/10 rounded-lg transition-colors">
                <Settings className="w-5 h-5 text-slate-400 hover:text-cyan-400" />
              </button>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex border-t border-cyan-500/10 px-6">
            <TabButton
              active={activeTab === "detection"}
              onClick={() => setActiveTab("detection")}
              icon={<Eye className="w-4 h-4" />}
              label="Detection"
            />
            <TabButton
              active={activeTab === "vessels"}
              onClick={() => setActiveTab("vessels")}
              icon={<Map className="w-4 h-4" />}
              label="Threat Map"
              badge={totalThreats > 0 ? totalThreats : undefined}
            />
            <TabButton
              active={activeTab === "threats"}
              onClick={() => setActiveTab("threats")}
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Threat Timeline"
              badge={criticalThreats > 0 ? criticalThreats : undefined}
            />
          </div>
        </nav>

        {/* Main content area */}
        <main className="p-6 space-y-6 animate-ambient-hum">
          {activeTab === "detection" && (
            <DetectionView onResultsUpdate={handleDetectionComplete} />
          )}
          {activeTab === "vessels" && (
            <VesselTracking detectionResults={detectionResults} />
          )}
          {activeTab === "threats" && (
            <ThreatAnalysis detectionResults={detectionResults} />
          )}
        </main>
      </div>

      {/* Security Footer */}
      <SecurityFooter />
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

function TabButton({ active, onClick, icon, label, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-space-mono font-medium border-b-2 transition-all relative ${
        active
          ? "border-cyan-400 text-cyan-300"
          : "border-transparent text-slate-500 hover:text-slate-300"
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}
