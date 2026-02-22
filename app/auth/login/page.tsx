"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SonarGridBackground } from "@/components/sonar-grid-background";
// Security elements are now provided globally via ConditionalSecurityBar in layout
import { useEffect, useState, useRef } from "react";
import {
  Mail,
  Lock,
  Fingerprint,
  Shield,
  ShieldCheck,
  Radar,
  Anchor,
  AlertTriangle,
} from "lucide-react";
import { Eye, EyeOff } from "lucide-react";
import { GoogleSignInButton } from "@/components/google-signin-button";

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [typedText, setTypedText] = useState("");
  const terminalLines = useRef<string[]>([
    "> INIT SECURE_AUTH v4.2.1",
    "> LOADING ENCRYPTION MODULE...",
    "> AES-256-GCM CIPHER ACTIVE",
    "> TLS 1.3 HANDSHAKE COMPLETE",
    "> NAVAL FIREWALL: ONLINE",
    "> AWAITING CREDENTIALS...",
  ]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-IN", {
          hour12: false,
          timeZone: "Asia/Kolkata",
        }) + " IST",
      );
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // Typewriter effect for terminal
  useEffect(() => {
    let lineIdx = 0;
    let charIdx = 0;
    let current = "";
    const typeInterval = setInterval(() => {
      if (lineIdx < terminalLines.current.length) {
        const line = terminalLines.current[lineIdx];
        if (charIdx < line.length) {
          current += line[charIdx];
          charIdx++;
          setTypedText(current);
        } else {
          current += "\n";
          lineIdx++;
          charIdx = 0;
        }
      } else {
        clearInterval(typeInterval);
      }
    }, 30);
    return () => clearInterval(typeInterval);
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Login failed");
      if (data.user) localStorage.setItem("profile", JSON.stringify(data.user));
      router.push("/profile");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const sendLoginOtp = async () => {
    if (!email) {
      setError("Please enter your email first");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "login" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Failed to send OTP");
      setOtpSent(true);
      setCountdown(30);
      setSuccess("OTP dispatched! Check your email.");
      if (data?.devOtp) setOtp(String(data.devOtp));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      setError("Enter a valid 6-digit OTP");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp, type: "login" }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.message || "OTP verification failed");
      if (data.user) localStorage.setItem("profile", JSON.stringify(data.user));
      setSuccess("Access granted. Redirecting...");
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-slate-950 via-[#0a1628] to-slate-950">
      <SonarGridBackground />

      {/* Submarine hull ambient glow */}
      <div
        className="absolute top-1/3 -left-40 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl animate-pulse"
        style={{ animationDuration: "8s" }}
      />
      <div
        className="absolute bottom-1/3 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"
        style={{ animationDuration: "12s" }}
      />

      {/* Porthole glow effect in background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none">
        <div className="absolute inset-0 rounded-full border-[6px] border-slate-700/10" />
        <div className="absolute inset-4 rounded-full border border-cyan-500/5" />
        <div className="absolute inset-0 rounded-full bg-gradient-radial from-cyan-500/[0.02] to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-6 pt-20 pb-16 min-h-screen flex flex-col justify-center">
        {/* Indian Defence Header with enhanced animations */}
        <div className="text-center mb-6">
          <div className="relative inline-block mb-4">
            {/* Multiple spinning security rings */}
            <div
              className="absolute -inset-6 rounded-full border border-dashed border-cyan-500/10 animate-spin"
              style={{ animationDuration: "40s" }}
            />
            <div
              className="absolute -inset-4 rounded-full border border-dotted border-amber-500/10 animate-spin"
              style={{
                animationDuration: "25s",
                animationDirection: "reverse",
              }}
            />
            <div
              className="absolute -inset-2 rounded-full border border-dashed border-cyan-500/15 animate-spin"
              style={{ animationDuration: "30s" }}
            />

            {/* Sonar ping rings around emblem */}
            <div
              className="absolute -inset-8 rounded-full border border-cyan-500/5 animate-ping"
              style={{ animationDuration: "4s" }}
            />

            <div
              className="absolute inset-0 bg-cyan-500/20 rounded-full blur-2xl animate-pulse"
              style={{ animationDuration: "3s" }}
            />
            <div className="relative w-20 h-20 rounded-full border-2 border-amber-500/50 bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center shadow-2xl shadow-amber-500/10">
              <div className="absolute inset-1 rounded-full border border-amber-400/30" />
              <Anchor
                className="w-9 h-9 text-amber-400/90 animate-pulse"
                style={{ animationDuration: "4s" }}
              />
            </div>
          </div>

          <h1 className="font-orbitron text-xl font-bold tracking-[0.25em] text-amber-100/90 uppercase mb-1">
            Indian Naval Command
          </h1>
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-px flex-1 max-w-16 bg-gradient-to-r from-transparent to-cyan-500/30" />
            <span className="text-[9px] font-space-mono text-cyan-300/50 uppercase tracking-[0.4em]">
              MarEye Defence System
            </span>
            <div className="h-px flex-1 max-w-16 bg-gradient-to-l from-transparent to-cyan-500/30" />
          </div>

          {/* Restricted access badge with glow */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/25 rounded animate-pulse"
            style={{ animationDuration: "6s" }}
          >
            <Shield className="w-3 h-3 text-red-400" />
            <span className="text-[8px] font-space-mono text-red-300/80 uppercase tracking-[0.3em] font-bold">
              Restricted Access — Authorized Personnel Only
            </span>
          </div>

          <h2 className="font-orbitron text-3xl font-bold tracking-wider gradient-text-ocean mt-5 mb-1">
            SECURE LOGIN
          </h2>
          <p className="text-[10px] text-slate-400 font-space-mono uppercase tracking-widest">
            Identity verification required to proceed
          </p>
        </div>

        {/* Mini terminal readout */}
        <div className="mb-4 bg-slate-950/60 border border-cyan-500/10 rounded-lg p-3 overflow-hidden max-h-24">
          <pre className="text-[8px] font-space-mono text-cyan-400/40 leading-relaxed whitespace-pre-wrap">
            {typedText}
            <span className="animate-pulse text-cyan-400/80"></span>
          </pre>
        </div>

        {/* Security status indicators with animated connections */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[8px] font-space-mono text-emerald-300/60 uppercase tracking-wider">
              TLS 1.3
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radar
              className="w-3 h-3 text-cyan-400/50 animate-spin"
              style={{ animationDuration: "4s" }}
            />
            <span className="text-[8px] font-space-mono text-cyan-300/50 uppercase tracking-wider">
              Secure Channel
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-amber-400/60" />
            <span className="text-[8px] font-space-mono text-amber-300/50 uppercase tracking-wider">
              AES-256
            </span>
          </div>
        </div>

        {/* Method Toggle */}
        <div className="grid grid-cols-2 gap-1 bg-slate-900/60 backdrop-blur-md rounded-lg p-1 border border-cyan-500/10 mb-4">
          <button
            type="button"
            onClick={() => {
              setMethod("password");
              setError(null);
              setSuccess(null);
            }}
            className={`rounded-md px-3 py-2.5 text-[10px] font-space-mono font-bold uppercase tracking-wider transition-all ${method === "password" ? "bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 shadow-lg shadow-cyan-500/10" : "text-slate-500 hover:text-cyan-300 hover:bg-cyan-500/5"}`}
          >
            <Lock className="w-3 h-3 inline mr-1.5 -mt-0.5" />
            Password Auth
          </button>
          <button
            type="button"
            onClick={() => {
              setMethod("otp");
              setPassword("");
              setShowPassword(false);
              setOtp("");
              setOtpSent(false);
              setCountdown(0);
              setError(null);
              setSuccess(null);
            }}
            className={`rounded-md px-3 py-2.5 text-[10px] font-space-mono font-bold uppercase tracking-wider transition-all ${method === "otp" ? "bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 shadow-lg shadow-cyan-500/10" : "text-slate-500 hover:text-cyan-300 hover:bg-cyan-500/5"}`}
          >
            <Fingerprint className="w-3 h-3 inline mr-1.5 -mt-0.5" />
            OTP Verify
          </button>
        </div>

        {/* Login Form Card w/ enhanced submarine aesthetics */}
        <form
          onSubmit={
            method === "password" ? handlePasswordLogin : verifyLoginOtp
          }
        >
          <div className="relative bg-slate-900/70 backdrop-blur-xl rounded-2xl border border-cyan-500/15 shadow-2xl shadow-black/40 overflow-hidden animate-ambient-hum">
            {/* Terminal header with more indicators */}
            <div className="bg-gradient-to-r from-cyan-900/30 via-blue-900/20 to-cyan-900/30 px-4 py-2 border-b border-cyan-500/10 flex items-center justify-between">
              <span className="text-[8px] font-space-mono text-cyan-300/40 uppercase tracking-widest">
                Authentication Terminal
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"
                  style={{ animationDelay: "0.3s" }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"
                  style={{ animationDelay: "0.6s" }}
                />
                <span className="text-[7px] font-space-mono text-cyan-300/25 ml-1 uppercase">
                  ONLINE
                </span>
              </div>
            </div>

            {/* Animated HUD corners with glow */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/40 transition-all" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500/40" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-500/40" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/40" />

            {/* Scan line within card */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent animate-scan" />
            </div>

            <div className="p-6">
              {error && (
                <div
                  className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 animate-pulse"
                  style={{
                    animationDuration: "2s",
                    animationIterationCount: 3,
                  }}
                >
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-red-300 text-[11px] font-space-mono">
                    {error}
                  </span>
                </div>
              )}
              {success && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-emerald-300 text-[11px] font-space-mono">
                    {success}
                  </span>
                </div>
              )}

              <div className="space-y-4">
                {/* Email field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="text-[9px] font-space-mono uppercase tracking-[0.2em] text-slate-400 flex items-center gap-1.5"
                  >
                    <Mail className="w-3 h-3" />
                    Officer Email / Service ID
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/40 group-focus-within:text-cyan-400/70 transition-colors" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="officer@navy.gov.in"
                      className="w-full rounded-lg border border-cyan-500/15 bg-slate-800/60 pl-10 pr-3 py-2.5 text-sm text-cyan-100 placeholder:text-slate-600 outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 focus:shadow-lg focus:shadow-cyan-500/5 transition-all font-space-mono"
                    />
                    <div className="absolute inset-0 rounded-lg opacity-0 group-focus-within:opacity-100 pointer-events-none border border-cyan-400/20 transition-opacity" />
                  </div>
                </div>

                {method === "password" ? (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="password"
                      className="text-[9px] font-space-mono uppercase tracking-[0.2em] text-slate-400 flex items-center gap-1.5"
                    >
                      <Lock className="w-3 h-3" />
                      Access Code
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/40 group-focus-within:text-cyan-400/70 transition-colors" />
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter access code"
                        className="w-full rounded-lg border border-cyan-500/15 bg-slate-800/60 pl-10 pr-10 py-2.5 text-sm text-cyan-100 placeholder:text-slate-600 outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 focus:shadow-lg focus:shadow-cyan-500/5 transition-all font-space-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-400 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="otp"
                      className="text-[9px] font-space-mono uppercase tracking-[0.2em] text-slate-400 flex items-center gap-1.5"
                    >
                      <Fingerprint className="w-3 h-3" />
                      One-Time Verification Code
                    </label>
                    <input
                      id="otp"
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) =>
                        setOtp(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="------"
                      className="w-full rounded-lg border border-cyan-500/15 bg-slate-800/60 px-3 py-3 text-center text-lg tracking-[0.5em] text-cyan-100 outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 focus:shadow-lg focus:shadow-cyan-500/5 transition-all font-space-mono"
                      disabled={!otpSent}
                    />
                    <div className="flex items-center justify-between text-[9px] text-slate-500 font-space-mono mt-1">
                      <button
                        type="button"
                        onClick={sendLoginOtp}
                        disabled={loading || countdown > 0}
                        className="text-cyan-400 hover:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
                      >
                        {otpSent
                          ? countdown > 0
                            ? `Resend ${countdown}s`
                            : "Resend Code"
                          : "Send Verification Code"}
                      </button>
                      <span className="text-slate-600">
                        {otpSent ? "Expires 10 min" : "Secure OTP"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Submit button with enhanced animation */}
                <button
                  type="submit"
                  disabled={loading || (method === "otp" && !otpSent)}
                  className="relative w-full py-3 rounded-lg bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-600 text-white font-orbitron text-[10px] tracking-[0.3em] uppercase overflow-hidden group disabled:opacity-40 disabled:cursor-not-allowed border border-cyan-400/20 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:shadow-xl transition-all duration-300"
                >
                  {/* Shimmer sweep */}
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  {/* Pulse ring on hover */}
                  <span
                    className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ boxShadow: "inset 0 0 20px rgba(6,182,212,0.15)" }}
                  />
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      {method === "otp"
                        ? "Verifying Identity..."
                        : "Authenticating..."}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      {method === "otp"
                        ? "Verify & Authenticate"
                        : "Authenticate"}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-3 my-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-cyan-500/20" />
                  <span className="text-[8px] font-space-mono text-slate-600 uppercase tracking-widest">
                    or
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-cyan-500/20" />
                </div>

                <GoogleSignInButton label="Sign in with Google" />
              </div>
            </div>

            {/* Footer bar */}
            <div className="bg-gradient-to-r from-slate-900/80 via-cyan-900/10 to-slate-900/80 px-4 py-2 border-t border-cyan-500/10 flex items-center justify-between">
              <span className="text-[7px] font-space-mono text-slate-600 uppercase tracking-wider">
                Session: AES-256-GCM
              </span>
              <span className="text-[7px] font-space-mono text-slate-600 uppercase tracking-wider">
                Protocol: TLS 1.3
              </span>
            </div>
          </div>
        </form>

        <p className="mt-6 text-center text-[10px] text-slate-500 font-space-mono tracking-wider">
          New officer?{" "}
          <Link
            href="/auth/register"
            className="text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest font-bold"
          >
            Request Access
          </Link>
        </p>

        {/* Ministry Footer */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-700/50 rounded bg-slate-900/40">
            <Shield className="w-3 h-3 text-slate-600" />
            <span className="text-[7px] font-space-mono text-slate-600 uppercase tracking-[0.3em]">
              Ministry of Defence Government of India Naval Cyber Command
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
