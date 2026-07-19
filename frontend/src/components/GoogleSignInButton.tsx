import { useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "small" | "medium" | "large";
              shape?: "rectangular" | "pill" | "circle" | "square";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              locale?: string;
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * Renders Google's own "Sign in with Google" button and wires it to our
 * session-based auth (POST /api/auth/google, matched by email — see
 * klaser-identity/app/routes/auth.py::google_login).
 *
 * Works for both login and invite-registration: the backend only
 * requires a User row with a matching email (no password needed), and
 * that row already exists the moment an admin invites someone via the
 * Users section — so an invited user can sign in with Google immediately
 * instead of setting a password. Ported from elrom-platform's component
 * of the same name; keep the two in sync if the GIS wiring changes.
 */
export function GoogleSignInButton({
  onError,
  onSuccess,
}: {
  onError: (msg: string | null) => void;
  onSuccess?: () => void;
}) {
  const { signInWithGoogle } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) {
      // Not an error state worth surfacing to the user — just omit the
      // button silently, same as the login page does server-side.
      return;
    }

    const SCRIPT_ID = "google-identity-services";
    if (document.getElementById(SCRIPT_ID)) {
      init();
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = init;
    document.head.appendChild(s);

    function init() {
      if (!window.google || !btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID!,
        callback: async (response) => {
          setBusy(true);
          onError(null);
          try {
            await signInWithGoogle(response.credential);
            onSuccess?.();
          } catch (err) {
            onError(apiErrorMessage(err));
            setBusy(false);
          }
        },
      });
      btnRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        locale: "he",
        width: 280,
      });
    }
    // signInWithGoogle/onError/onSuccess are stable enough in practice;
    // re-running this on every render would re-inject the script and
    // thrash the rendered button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signInWithGoogle]);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={btnRef} className={busy ? "pointer-events-none opacity-50" : ""} />
      {busy && <div className="animate-pulse text-xs text-ink-soft">מתחבר…</div>}
    </div>
  );
}
