import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Meetings from "./pages/Meetings";
import MeetingDetail from "./pages/MeetingDetail";
import TopicPool from "./pages/TopicPool";
import Register from "./pages/Register";
import Users from "./pages/Users";
import Participants from "./pages/Participants";
import ActionItems from "./pages/ActionItems";
import Settings from "./pages/Settings";
import Rsvp from "./pages/Rsvp";

const IDENTITY_BASE =
  import.meta.env.VITE_IDENTITY_BASE_URL || "http://localhost:8001";

/** No local /login page — login lives on identity. Redirect there with
 * a return path, matching the flow in docs/klaser-platform-infra.md. */
function redirectToLogin() {
  const redirect = encodeURIComponent(window.location.href);
  window.location.href = `${IDENTITY_BASE}/login?redirect=${redirect}`;
}

/** Everything except /register lives behind this — loading state, then
 * redirect-to-identity-login if anonymous, then the real app in Layout. */
function AuthGate() {
  const { state } = useAuth();

  if (state.kind === "loading") {
    return <div className="p-8 text-ink-soft">טוען…</div>;
  }

  if (state.kind === "anonymous") {
    redirectToLogin();
    return <div className="p-8 text-ink-soft">מפנה להתחברות…</div>;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/meetings" element={<Meetings />} />
        {/* No separate creation form — "+ ישיבה חדשה" instant-creates a
         * draft and redirects straight here (see Home.tsx / Meetings.tsx),
         * since this setup screen already covers everything a wizard
         * would (and more: invitees, send actions). */}
        <Route path="/meetings/:id" element={<MeetingDetail />} />
        <Route path="/topic-pool" element={<TopicPool />} />
        <Route path="/participants" element={<Participants />} />
        <Route path="/action-items" element={<ActionItems />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/users" element={<Users />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Reachable while anonymous — an invited user completing
         * registration isn't logged in yet, so this must not go through
         * AuthGate's redirect-to-login. */}
        <Route path="/register" element={<Register />} />
        {/* Also anonymous-reachable — an invitation recipient clicking an
         * RSVP link from their email was never asked to log in at all. */}
        <Route path="/rsvp/:token" element={<Rsvp />} />
        <Route path="/*" element={<AuthGate />} />
      </Routes>
    </BrowserRouter>
  );
}
