import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, MailCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, jsonBody } from "../lib/api";

export function AccountActionPage({ mode }: { mode: "reset" | "verify" }) {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "reset" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const path = mode === "reset" ? "/api/auth/password/reset" : "/api/auth/email/verify";
      await api(path, { method: "POST", body: jsonBody(mode === "reset" ? { token, password } : { token }) });
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account action failed.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = mode === "reset" ? KeyRound : MailCheck;
  return <section className="mx-auto max-w-xl px-4 py-16"><div className="surface-panel cm-hero-panel p-6 md:p-8"><Icon className="h-7 w-7 text-mint" /><h1 className="mt-5 text-2xl font-bold text-white">{mode === "reset" ? "Reset your password" : "Verify your email"}</h1>{complete ? <div className="mt-6"><div className="flex items-center gap-2 text-mint"><CheckCircle2 className="h-5 w-5" /> Account updated successfully</div><Link className="action-primary mt-5 inline-flex" to="/">Return to sign in</Link></div> : <form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm text-steel">Secure token<input className="field mt-1 font-mono text-xs" value={token} onChange={(event) => setToken(event.target.value)} minLength={32} required /></label>{mode === "reset" && <><label className="block text-sm text-steel">New password<input className="field mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} required /></label><label className="block text-sm text-steel">Confirm password<input className="field mt-1" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={10} maxLength={128} required /></label></>}{error && <div className="border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</div>}<button className="action-primary w-full justify-center" type="submit" disabled={busy || token.length < 32}>{busy ? "Verifying..." : mode === "reset" ? "Update password" : "Verify email"}</button></form>}</div></section>;
}
