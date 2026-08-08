import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiErrorMessage, type RegistrationInfo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { DsButton, DsInput } from "../components/klaser-ds";

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
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8 shadow-[0px_1px_0_rgba(0,0,0,0.03),0px_4px_16px_-4px_rgba(0,0,0,0.06)]">
        <h1 className="text-center font-rubik text-2xl font-bold text-ink">הרשמה לאוגדן</h1>

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
              <span className="font-rubik text-xs tracking-[0.15em]">או</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <DsInput placeholder="שם מלא" value={displayName} onChange={setDisplayName} />
              <DsInput
                type="password"
                required
                autoComplete="new-password"
                placeholder="סיסמה (לפחות 8 תווים)"
                value={password}
                onChange={setPassword}
              />
              <DsInput
                type="password"
                required
                autoComplete="new-password"
                placeholder="אימות סיסמה"
                value={confirmPassword}
                onChange={setConfirmPassword}
                className={
                  confirmPassword.length > 0
                    ? confirmPassword === password
                      ? "!border-success"
                      : "!border-danger"
                    : ""
                }
              />
              <DsButton type="submit" size="compact" disabled={busy} className="w-full">
                {busy ? "יוצר חשבון…" : "יצירת חשבון וכניסה"}
              </DsButton>
            </form>

            {error && (
              <div className="mt-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-center text-sm text-danger">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
