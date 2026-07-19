import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiErrorMessage, type RegistrationInfo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

const ROLE_LABELS: Record<string, string> = {
  admin: "מנהל/ת",
  user: "משתמש/ת",
  reviewer: "בודק/ת",
  secretary: "מזכיר/ה",
};

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; info: RegistrationInfo };

export default function Register() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { registerWithToken } = useAuth();

  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoad({ kind: "invalid", message: "קישור ההרשמה חסר טוקן." });
      return;
    }
    let cancelled = false;
    api
      .getRegistrationInfo(token)
      .then((info) => {
        if (cancelled) return;
        setLoad({ kind: "ready", info });
        setDisplayName(info.display_name || "");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoad({ kind: "invalid", message: apiErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function onGoogleDone() {
    navigate("/meetings");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }
    setBusy(true);
    try {
      await registerWithToken(token, password, displayName.trim() || undefined);
      navigate("/meetings");
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-ink">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8">
        <h1 className="text-center font-display text-2xl font-bold">הרשמה ל־Klaser Meetings</h1>

        {load.kind === "loading" && (
          <p className="mt-8 text-center text-sm text-ink-soft">בודק קישור…</p>
        )}

        {load.kind === "invalid" && (
          <div className="mt-8 flex flex-col gap-2 text-center">
            <p className="text-sm">{load.message}</p>
            <p className="text-xs text-ink-soft">
              הקישור אולי פג תוקף. פנה למנהל המערכת לקבלת הזמנה חדשה.
            </p>
          </div>
        )}

        {load.kind === "ready" && (
          <>
            <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
              מצטרף/ת לארגון <strong className="text-ink">{load.info.tenant_name}</strong> בתור{" "}
              <strong className="text-ink">{ROLE_LABELS[load.info.role] || load.info.role}</strong>
              <br />
              <span dir="ltr" className="text-xs">
                {load.info.email}
              </span>
            </p>

            <div className="mt-6 flex justify-center">
              <GoogleSignInButton onError={setError} onSuccess={onGoogleDone} />
            </div>

            <div className="my-6 flex items-center gap-3 text-ink-soft">
              <div className="h-px flex-1 bg-line" />
              <span className="text-xs uppercase tracking-widest">או</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="שם מלא"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="rounded border border-line-strong px-3 py-2 text-sm"
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                placeholder="סיסמה (לפחות 8 תווים)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded border border-line-strong px-3 py-2 text-sm"
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                placeholder="אימות סיסמה"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`rounded border px-3 py-2 text-sm ${
                  confirmPassword.length > 0
                    ? confirmPassword === password
                      ? "border-emerald-400"
                      : "border-red-400"
                    : "border-line-strong"
                }`}
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                {busy ? "יוצר חשבון…" : "יצירת חשבון וכניסה"}
              </button>
            </form>

            {error && (
              <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
