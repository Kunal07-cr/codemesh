import { useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

const demoAccounts = [
  "owner@codemesh.dev",
  "maintainer@codemesh.dev",
  "contributor@codemesh.dev",
  "viewer@codemesh.dev"
];

const fieldClass = "mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/15";

export function AuthPanel() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("owner@codemesh.dev");
  const [password, setPassword] = useState("CodeMesh123!");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <div className="rounded border border-line bg-panel p-4">
        <div className="text-sm text-steel">Signed in as</div>
        <div className="mt-1 font-semibold text-white">{user.name}</div>
        <div className="text-sm text-steel">{user.email}</div>
        <Link className="action-primary mt-4 w-full justify-center" to="/dashboard">Open dashboard</Link>
      </div>
    );
  }

  function selectMode(nextMode: "login" | "register") {
    if (nextMode === mode || busy) return;
    setMode(nextMode);
    setError("");
    setShowPassword(false);
    setConfirmPassword("");
    if (nextMode === "register") {
      setName("");
      setEmail("");
      setPassword("");
    } else {
      setEmail("owner@codemesh.dev");
      setPassword("CodeMesh123!");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
      if (mode === "login") {
        await login({ email: normalizedEmail, password });
      } else {
        if (name.trim().length < 2) throw new Error("Enter your full name.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        await register({ name: name.trim(), email: normalizedEmail, password });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="rounded border border-line bg-panel p-4" onSubmit={submit}>
      <div className="grid grid-cols-2 rounded border border-line bg-ink p-1" role="tablist" aria-label="Account access">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`rounded px-3 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-panel text-white shadow" : "text-steel hover:text-white"}`}
          onClick={() => selectMode("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`rounded px-3 py-2 text-sm font-semibold transition ${mode === "register" ? "bg-panel text-white shadow" : "text-steel hover:text-white"}`}
          onClick={() => selectMode("register")}
        >
          Create account
        </button>
      </div>
      <div className="mt-4">
        <h2 className="text-lg font-semibold text-white">{mode === "login" ? "Welcome back" : "Join CodeMesh"}</h2>
        <p className="mt-1 text-sm text-steel">
          {mode === "login" ? "Use your CodeMesh email and password." : "Create an account with your email address."}
        </p>
      </div>
      {mode === "register" && (
        <label className="mt-4 block text-sm">
          <span className="text-steel">Name</span>
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            minLength={2}
            maxLength={80}
            required
          />
        </label>
      )}
      <label className="mt-4 block text-sm">
        <span className="text-steel">Email</span>
        <input
          className={fieldClass}
          type="email"
          list={mode === "login" ? "codemesh-demo-accounts" : undefined}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <datalist id="codemesh-demo-accounts">
          {demoAccounts.map((account) => <option key={account} value={account} />)}
        </datalist>
      </label>
      <label className="mt-4 block text-sm">
        <span className="text-steel">Password</span>
        <span className="relative mt-1 block">
          <input
            className={`${fieldClass} mt-0 pr-11`}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
          <button
            type="button"
            className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded text-steel transition hover:bg-line hover:text-white"
            title={showPassword ? "Hide password" : "Show password"}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>
      {mode === "register" && (
        <label className="mt-4 block text-sm">
          <span className="text-steel">Confirm password</span>
          <input
            className={fieldClass}
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
      )}
      {error && <div className="mt-3 rounded border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral" role="alert">{error}</div>}
      <button className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-mint px-3 py-2 font-semibold text-ink transition hover:bg-mint/90 disabled:opacity-60" disabled={busy}>
        {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
