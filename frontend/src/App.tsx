import { useEffect, useState } from "react";
import { useAuth } from "./lib/auth";
import { api, apiErrorMessage } from "./lib/api";

const IDENTITY_BASE =
  import.meta.env.VITE_IDENTITY_BASE_URL || "http://localhost:8001";

/** No local /login page — login lives on identity. Redirect there with
 * a return path, matching the flow in docs/klaser-platform-infra.md. */
function redirectToLogin() {
  const redirect = encodeURIComponent(window.location.href);
  window.location.href = `${IDENTITY_BASE}/login?redirect=${redirect}`;
}

export default function App() {
  const { state, signOut } = useAuth();
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  useEffect(() => {
    if (state.kind !== "signed_in") return;
    api
      .ping()
      .then((r) => setPingResult(JSON.stringify(r, null, 2)))
      .catch((err) => setPingError(apiErrorMessage(err)));
  }, [state.kind]);

  if (state.kind === "loading") {
    return <div className="p-8 text-ink-soft">טוען…</div>;
  }

  if (state.kind === "anonymous") {
    redirectToLogin();
    return <div className="p-8 text-ink-soft">מפנה להתחברות…</div>;
  }

  return (
    <div className="min-h-screen bg-surface p-8 text-ink">
      <h1 className="text-2xl font-display font-bold">Klaser Meetings</h1>
      <p className="mt-2 text-ink-soft">
        מחובר כ־{state.user.display_name || state.user.email} · ארגון{" "}
        {state.user.tenant_name || state.user.tenant_id}
      </p>
      <button
        onClick={() => signOut()}
        className="mt-4 rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-line"
      >
        התנתק
      </button>

      <div className="mt-8 rounded border border-line bg-white p-4">
        <h2 className="font-semibold">Identity wiring smoke test</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Calls this backend's <code>/api/meetings/ping</code>, which is
          gated by <code>require_entitlement("meetings")</code> and
          resolves the user via identity's <code>/api/introspect</code>.
        </p>
        {pingError && <p className="mt-2 text-sm text-accent-dark">{pingError}</p>}
        {pingResult && (
          <pre className="mt-2 whitespace-pre-wrap text-xs">{pingResult}</pre>
        )}
      </div>
    </div>
  );
}
