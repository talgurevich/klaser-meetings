import { useEffect, useState, type ReactNode } from "react";
import { api, apiErrorMessage, type MeetingInvite, type Participant } from "../lib/api";
import {
  Chip,
  CloseIcon,
  DsButton,
  DsCard,
  DsCheckbox,
  DsModal,
  DsTag,
  SearchIcon,
  SectionHeader,
  StatusPill,
  type StatusVariant,
} from "./klaser-ds";

const RSVP_LABELS: Record<MeetingInvite["status"], string> = {
  pending: "ממתין",
  confirmed_attend: "מאשר/ת ומגיע/ה",
  confirmed_absent: "מאשר/ת קבלה ולא מגיע/ה",
};

const RSVP_VARIANTS: Record<MeetingInvite["status"], StatusVariant> = {
  pending: "neutral",
  confirmed_attend: "success",
  confirmed_absent: "warning",
};

/** "מוזמנים" + "אישורי השתתפות" — who's invited to this meeting (from
 * either the member roster or the Participants directory, two different
 * id-spaces, see backend/app/models.py's MeetingInvite docstring) and
 * their RSVP status. Adding/removing invitees is editor-only, mirroring
 * the backend's gating (this is the organizer's job, not a member
 * action — contrast with the Participant-attach checkboxes elsewhere,
 * which are deliberately open to everyone). */
export default function InviteesPanel({
  meetingId,
  invites,
  editable,
  showRsvp,
  actions,
  onChanged,
}: {
  meetingId: string;
  invites: MeetingInvite[];
  editable: boolean;
  // RSVP-status block appears only once invites have actually been sent
  // (after "שלח לחברי ועד") — there's nothing to confirm before that.
  showRsvp: boolean;
  // Rendered between the invitees list and the RSVP block (the send/preview
  // actions live here).
  actions?: ReactNode;
  onChanged: () => void;
}) {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Invitees come only from the אלפון now — being an identity/system user is
  // unrelated to meeting invites. Committee members (flagged 'חבר ועד') are
  // auto-invited on create, so they show up as invitees already.
  useEffect(() => {
    if (!editable) return;
    api.listParticipants().then(setParticipants).catch(() => setParticipants([]));
  }, [editable]);

  const invitedParticipantIds = new Set(
    invites.filter((i) => i.invitee_kind === "participant").map((i) => i.invitee_id)
  );
  const availableParticipants = (participants || []).filter((p) => !invitedParticipantIds.has(p.id));

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const invitees = Array.from(selected).map((key) => {
        const [kind, id] = key.split(":") as ["member" | "participant", string];
        return { kind, id };
      });
      await api.addInvites(meetingId, invitees);
      setSelected(new Set());
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeInvite(inviteId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.removeInvite(meetingId, inviteId);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const confirmedCount = invites.filter((i) => i.status === "confirmed_attend").length;

  const q = query.trim().toLowerCase();
  const matches = (participants ? availableParticipants : []).filter(
    (p) =>
      !q ||
      [p.full_name, p.email, p.phone, p.roles.join(" ")]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q)),
  );

  function pickRow(p: Participant) {
    const key = `participant:${p.id}`;
    return (
      <div
        key={key}
        onClick={() => toggleSelected(key)}
        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-turquoise/5"
      >
        <DsCheckbox checked={selected.has(key)} onChange={() => toggleSelected(key)} ariaLabel={p.full_name} />
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span>{p.full_name}</span>
          {p.edit_permission && <DsTag>חבר ועד</DsTag>}
          {p.email && (
            <span className="truncate text-xs text-ink-soft" dir="ltr">
              {p.email}
            </span>
          )}
        </span>
      </div>
    );
  }

  const addButtons = selected.size > 0 && (
    <div className="mt-2 flex gap-2">
      <DsButton size="micro" onClick={addSelected} disabled={busy}>
        הוסף ({selected.size})
      </DsButton>
      <DsButton variant="ghost" size="micro" onClick={() => setSelected(new Set())} disabled={busy}>
        נקה בחירה
      </DsButton>
    </div>
  );

  return (
    <DsCard interactive={false} className="mb-4 p-4">
      <SectionHeader>מוזמנים ({invites.length})</SectionHeader>

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      {editable && (
        <div className="mb-4 rounded-md border border-line p-4">
          <p className="mb-2 font-rubik text-xs font-medium text-turquoise">הוסף מוזמנים מהאלפון</p>
          {!participants ? (
            <p className="text-sm text-ink-soft">טוען…</p>
          ) : availableParticipants.length === 0 ? (
            <p className="text-sm text-ink-soft">כל אנשי האלפון כבר מוזמנים.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft">
                    <SearchIcon />
                  </span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="חיפוש שם, אימייל או טלפון…"
                    className="w-full rounded-md border border-line bg-white py-2 pr-9 pl-3 font-rubik text-sm outline-none transition focus:border-turquoise focus:ring-2 focus:ring-turquoise/20"
                  />
                </div>
                <DsButton variant="secondary" size="compact" onClick={() => setPickerOpen(true)}>
                  עיין ברשימה
                </DsButton>
              </div>

              {q && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-line">
                  {matches.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-ink-soft">לא נמצאו תוצאות.</p>
                  ) : (
                    matches.slice(0, 50).map(pickRow)
                  )}
                </div>
              )}

              {addButtons}
            </>
          )}
        </div>
      )}

      {pickerOpen && participants && (
        <DsModal
          title="בחירה מהאלפון"
          subtitle={`${availableParticipants.length} אנשי קשר זמינים`}
          onClose={() => setPickerOpen(false)}
          actions={
            <>
              <DsButton
                size="compact"
                disabled={busy || selected.size === 0}
                onClick={async () => {
                  await addSelected();
                  setPickerOpen(false);
                }}
              >
                הוסף ({selected.size})
              </DsButton>
              <DsButton variant="ghost" size="compact" onClick={() => setPickerOpen(false)}>
                סגור
              </DsButton>
            </>
          }
        >
          <div className="relative mb-3">
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש…"
              className="w-full rounded-md border border-line bg-white py-2 pr-9 pl-3 font-rubik text-sm outline-none transition focus:border-turquoise focus:ring-2 focus:ring-turquoise/20"
            />
          </div>
          <div className="flex max-h-[55vh] flex-col gap-0.5 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="text-sm text-ink-soft">לא נמצאו תוצאות.</p>
            ) : (
              matches.map(pickRow)
            )}
          </div>
        </DsModal>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-ink-soft">אין עדיין מוזמנים.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {invites.map((inv) =>
            editable ? (
              <Chip
                key={inv.id}
                onClick={() => removeInvite(inv.id)}
                disabled={busy}
                title="הסר מוזמן"
              >
                <span>{inv.display_name || inv.email}</span>
                <CloseIcon />
              </Chip>
            ) : (
              <DsTag key={inv.id}>{inv.display_name || inv.email}</DsTag>
            )
          )}
        </div>
      )}

      {actions}

      {showRsvp && invites.length > 0 && (
        <div className="rounded-md border border-line p-4">
          <p className="mb-2 text-sm font-medium">
            אישורי השתתפות: {confirmedCount} מאשרים מתוך {invites.length} מוזמנים
          </p>
          <div className="flex flex-col gap-1">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 text-sm">
                <span>{inv.display_name || inv.email}</span>
                <StatusPill variant={RSVP_VARIANTS[inv.status]}>
                  {RSVP_LABELS[inv.status]}
                </StatusPill>
              </div>
            ))}
          </div>
        </div>
      )}
    </DsCard>
  );
}
