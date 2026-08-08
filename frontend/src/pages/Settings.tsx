import { useEffect, useRef, useState } from "react";
import {
  api,
  apiErrorMessage,
  type Member,
  type Participant,
  type Signatory,
  type TenantSettings,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { isAdmin } from "../lib/permissions";
import { DsSelect, TrashIcon, UploadCloudIcon } from "../components/klaser-ds";

// 0=Sunday .. 6=Saturday — see backend/app/models.py's TenantSettings
// docstring. Rendered in this order as flex children so the RTL layout
// naturally shows ראשון on the right / שבת on the left, matching the
// mockup.
const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// Klaser DS tokens — these two constants style most controls on this page.
const INPUT_CLS =
  "w-full rounded-md border border-line bg-white px-3 py-2.5 font-rubik text-sm text-ink text-right outline-none transition focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 disabled:bg-line/40 disabled:text-ink-soft";
const SECTION_CLS =
  "mb-4 rounded-lg border border-line bg-white p-8 shadow-[0px_1px_0_rgba(0,0,0,0.03),0px_4px_16px_-4px_rgba(0,0,0,0.06)]";

/** DS §4.3 compact in-page header. `icon` is a decorative emoji kept from
 * the original layout; the rule fills the remaining width. */
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 font-rubik text-base font-bold tracking-[0.15em] text-turquoise">
      <span>{title}</span>
      <span aria-hidden>{icon}</span>
      <span className="h-px flex-1 bg-line" />
    </h2>
  );
}

function ImageField({
  imageUrl,
  disabled,
  hint,
  onUpload,
  onRemove,
}: {
  imageUrl: string | null;
  disabled: boolean;
  hint: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      {imageUrl && (
        <button
          onClick={onRemove}
          disabled={disabled}
          className="shrink-0 rounded-md p-2 text-ink-soft transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        >
          <TrashIcon />
        </button>
      )}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-turquoise bg-white px-3 py-1.5 font-rubik text-xs font-semibold text-turquoise transition hover:bg-turquoise hover:text-white disabled:opacity-50"
      >
        <span>{imageUrl ? "החלף" : "העלאה"}</span>
        <UploadCloudIcon />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-14 w-14 rounded-md border border-line bg-white object-contain p-1" />
      ) : (
        <span className="text-xs text-ink-soft">{hint}</span>
      )}
    </div>
  );
}

function WeekdayPicker({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAY_LABELS.map((label, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          disabled={disabled}
          className={`rounded-md border px-3 py-1.5 font-rubik text-sm font-medium transition disabled:opacity-50 ${
            value === i
              ? "border-turquoise bg-turquoise text-white"
              : "border-line text-ink-soft hover:border-turquoise hover:text-turquoise"
          }`}
        >
          יום {label}
        </button>
      ))}
    </div>
  );
}

// ─── Digital signature draw pad (personal, self-service) ──────────────
// Plain native <canvas> with pointer events — no drawing-library
// dependency added just for this one widget.

function SignaturePad({ onSave, saving }: { onSave: (dataUrl: string) => void; saving: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const ctx = canvas.getContext("2d");
    const { x, y } = pos(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawnRef.current) {
      hasDrawnRef.current = true;
      setHasDrawn(true);
    }
  }

  function end() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    setHasDrawn(false);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-lg border border-dashed border-line-strong bg-white"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={clear}
          disabled={saving || !hasDrawn}
          className="rounded-md px-3 py-1.5 font-rubik text-sm font-medium text-ink-soft transition hover:bg-line/60 hover:text-ink disabled:opacity-50"
        >
          🗑 נקה
        </button>
        <button
          onClick={save}
          disabled={saving || !hasDrawn}
          className="rounded-md bg-turquoise px-4 py-1.5 font-rubik text-sm font-bold text-white transition hover:bg-turquoise-dark disabled:opacity-50"
        >
          💾 שמור חתימה
        </button>
      </div>
    </div>
  );
}

// A drawn signature comes off the <canvas> as a data: URL, but the
// signatory image endpoint takes a multipart file upload — convert here.
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

// ─── One "חתימה N" card in the officials-signatures section ───────────

function SignatoryCard({
  signatory,
  index,
  members,
  disabled,
  onSaved,
  onDelete,
}: {
  signatory: Signatory;
  index: number;
  members: Member[];
  disabled: boolean;
  onSaved: (s: Signatory) => void;
  onDelete: () => void;
}) {
  const [positionTitle, setPositionTitle] = useState(signatory.position_title || "");
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      setPositionTitle(signatory.position_title || "");
      initialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch: { member_user_id?: string | null; position_title?: string }) {
    setBusy(true);
    try {
      const updated = await api.updateSignatory(signatory.id, patch);
      onSaved(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded border border-line p-4 last:mb-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-soft">חתימה {index + 1}</h3>
        <button
          onClick={onDelete}
          disabled={disabled || busy}
          className="rounded-md px-1.5 py-0.5 text-ink-soft transition hover:bg-danger/10 hover:text-danger"
          aria-label="מחק חתימה"
        >
          🗑
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">בעל התפקיד</label>
          <DsSelect
            value={signatory.member_user_id || ""}
            disabled={disabled || busy}
            onChange={(v) => save({ member_user_id: v || null })}
          >
            <option value="">— ללא —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name || m.email}
              </option>
            ))}
          </DsSelect>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">שם התפקיד</label>
          <input
            type="text"
            value={positionTitle}
            disabled={disabled || busy}
            onChange={(e) => setPositionTitle(e.target.value)}
            onBlur={() => save({ position_title: positionTitle })}
            className={INPUT_CLS}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-ink-soft">חתימה (לפרוטוקולים)</label>
        <ImageField
          imageUrl={signatory.signature_image_url}
          disabled={disabled || busy}
          hint="עד 2MB — PNG/SVG/JPG"
          onUpload={async (file) => {
            setBusy(true);
            try {
              onSaved(await api.uploadSignatoryImage(signatory.id, file));
            } finally {
              setBusy(false);
            }
          }}
          onRemove={async () => {
            setBusy(true);
            try {
              onSaved(await api.deleteSignatoryImage(signatory.id));
            } finally {
              setBusy(false);
            }
          }}
        />
        {!signatory.signature_image_url && (
          <div className="mt-3">
            <div className="mb-1 text-xs text-ink-soft">או ציירו חתימה:</div>
            <SignaturePad
              saving={busy}
              onSave={async (dataUrl) => {
                setBusy(true);
                try {
                  const file = dataUrlToFile(dataUrl, `signature-${signatory.id}.png`);
                  onSaved(await api.uploadSignatoryImage(signatory.id, file));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── One role-holder's signature row (name + roles + signature) ──────────

function RoleHolderSignatureCard({
  contact,
  disabled,
  onSaved,
}: {
  contact: Participant;
  disabled: boolean;
  onSaved: (p: Participant) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mb-3 rounded border border-line p-4 last:mb-0">
      <div className="mb-3">
        <p className="text-sm font-semibold">{contact.full_name}</p>
        <p className="text-xs text-ink-soft">{contact.roles.join(" · ")}</p>
      </div>
      <ImageField
        imageUrl={contact.signature_image_url}
        disabled={disabled || busy}
        hint="עד 2MB — PNG/SVG/JPG"
        onUpload={async (file) => {
          setBusy(true);
          try {
            onSaved(await api.uploadParticipantSignature(contact.id, file));
          } finally {
            setBusy(false);
          }
        }}
        onRemove={async () => {
          setBusy(true);
          try {
            onSaved(await api.deleteParticipantSignature(contact.id));
          } finally {
            setBusy(false);
          }
        }}
      />
      {!contact.signature_image_url && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-ink-soft">או ציירו חתימה:</div>
          <SignaturePad
            saving={busy}
            onSave={async (dataUrl) => {
              setBusy(true);
              try {
                const file = dataUrlToFile(dataUrl, `signature-${contact.id}.png`);
                onSaved(await api.uploadParticipantSignature(contact.id, file));
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────

export default function Settings() {
  const { state } = useAuth();
  const currentUser = state.kind === "signed_in" ? state.user : null;
  const admin = isAdmin(currentUser);

  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mySignatureUrl, setMySignatureUrl] = useState<string | null>(null);
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [roleHolders, setRoleHolders] = useState<Participant[]>([]);
  const [roleHoldersOpen, setRoleHoldersOpen] = useState(false);

  function loadRoleHolders() {
    api
      .listParticipants()
      .then((all) => setRoleHolders(all.filter((p) => p.roles.length > 0)))
      .catch(() => setRoleHolders([]));
  }

  // Local field drafts — seeded once from `settings` on first load (see
  // module note in SignatoryCard for why: these must NOT re-sync every
  // time `settings` changes from an unrelated section's save, or the
  // user's in-progress keystrokes elsewhere on the page would get
  // clobbered).
  const [orgName, setOrgName] = useState("");
  const [emailSignature, setEmailSignature] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [assemblyLocation, setAssemblyLocation] = useState("");
  const [firstTopicTitle, setFirstTopicTitle] = useState("");
  const [firstTopicDuration, setFirstTopicDuration] = useState("");
  const [lastTopicTitle, setLastTopicTitle] = useState("");
  const [lastTopicDuration, setLastTopicDuration] = useState("");
  const [aFirstTopicTitle, setAFirstTopicTitle] = useState("");
  const [aFirstTopicDuration, setAFirstTopicDuration] = useState("");
  const [aLastTopicTitle, setALastTopicTitle] = useState("");
  const [aLastTopicDuration, setALastTopicDuration] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    api
      .getTenantSettings()
      .then(setSettings)
      .catch((err) => setError(apiErrorMessage(err)));
    api.listMembers().then(setMembers).catch(() => setMembers([]));
    loadRoleHolders();
    api
      .getMySignature()
      .then((r) => setMySignatureUrl(r.signature_image_url))
      .catch(() => setMySignatureUrl(null));
  }, []);

  useEffect(() => {
    if (settings && !initialized.current) {
      setOrgName(settings.org_name || "");
      setEmailSignature(settings.email_signature || "");
      setMeetingLocation(settings.meeting_location || "");
      setAssemblyLocation(settings.assembly_location || "");
      setFirstTopicTitle(settings.recurring_topic_first_title || "");
      setFirstTopicDuration(settings.recurring_topic_first_duration?.toString() || "");
      setLastTopicTitle(settings.recurring_topic_last_title || "");
      setLastTopicDuration(settings.recurring_topic_last_duration?.toString() || "");
      setAFirstTopicTitle(settings.assembly_recurring_topic_first_title || "");
      setAFirstTopicDuration(settings.assembly_recurring_topic_first_duration?.toString() || "");
      setALastTopicTitle(settings.assembly_recurring_topic_last_title || "");
      setALastTopicDuration(settings.assembly_recurring_topic_last_duration?.toString() || "");
      initialized.current = true;
    }
  }, [settings]);

  async function saveField(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      setSettings(await api.updateTenantSettings(patch));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <p className="text-sm text-ink-soft">טוען…</p>
    );
  }

  const editDisabled = !admin || busy;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <div className="font-rubik text-[11px] font-bold uppercase tracking-[0.15em] text-turquoise">תצורה</div>
        <h1 className="mt-1 font-rubik text-[32px] font-bold leading-tight text-ink">
          הגדרות מערכת
        </h1>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">{error}</div>
      )}
      {!admin && (
        <div className="mb-4 rounded border border-line bg-surface p-3 text-sm text-ink-soft">
          חלק זה של ההגדרות זמין לצפייה בלבד — עריכה מוגבלת למנהלי מערכת.
        </div>
      )}

      {/* פרטי הארגון */}
      <div className={SECTION_CLS}>
        <SectionHeader icon="🛡" title="פרטי הארגון" />
        <label className="mb-1 block text-xs font-medium text-ink-soft">שם האגודה / הארגון</label>
        <input
          type="text"
          value={orgName}
          disabled={editDisabled}
          onChange={(e) => setOrgName(e.target.value)}
          onBlur={() => saveField({ org_name: orgName || null })}
          className={INPUT_CLS}
        />
        <p className="mt-1.5 text-xs text-ink-soft">יופיע בכותרת כל מסמך מודפס</p>
      </div>

      {/* לוגו האגודה */}
      <div className={SECTION_CLS}>
        <SectionHeader icon="🖼" title="לוגו האגודה" />
        <ImageField
          imageUrl={settings.logo_url}
          disabled={editDisabled}
          hint="עד 2MB — PNG/SVG/JPG"
          onUpload={async (file) => {
            setBusy(true);
            setError(null);
            try {
              setSettings(await api.uploadLogo(file));
            } catch (err) {
              setError(apiErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
          onRemove={async () => {
            setBusy(true);
            setError(null);
            try {
              setSettings(await api.deleteLogo());
            } catch (err) {
              setError(apiErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
        <p className="mt-3 text-xs text-ink-soft">
          הלוגו יופיע בכותרת האפליקציה, בראש פרוטוקולים ומודפסים ובכותרת מיילים.
        </p>
      </div>

      {/* חתימת מייל כללית */}
      <div className={SECTION_CLS}>
        <SectionHeader icon="✉" title="חתימת מייל כללית" />
        <textarea
          value={emailSignature}
          disabled={editDisabled}
          onChange={(e) => setEmailSignature(e.target.value)}
          onBlur={() => saveField({ email_signature: emailSignature || null })}
          rows={4}
          className={INPUT_CLS}
        />
      </div>

      {/* חתימות בעלי תפקידים */}
      <div className={SECTION_CLS}>
        <div className="mb-1 flex items-center justify-between">
          <SectionHeader icon="✍" title="חתימות בעלי תפקידים" />
          {admin && settings.signatories.length < 3 && (
            <button
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const created = await api.addSignatory({});
                  setSettings((prev) => (prev ? { ...prev, signatories: [...prev.signatories, created] } : prev));
                } catch (err) {
                  setError(apiErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="mb-4 rounded-md border-2 border-turquoise bg-white px-3 py-1.5 font-rubik text-sm font-bold text-turquoise transition hover:bg-turquoise hover:text-white disabled:opacity-50"
            >
              + הוסף חתימה
            </button>
          )}
        </div>
        <p className="mb-4 -mt-2 text-xs text-ink-soft">
          עד 3 חתימות — העלו קובץ חתימה או ציירו אותה. החתימות יופיעו בתחתית פרוטוקולים ומיילים.
        </p>
        {settings.signatories.length === 0 ? (
          <p className="text-sm text-ink-soft">אין עדיין חתימות מוגדרות.</p>
        ) : (
          settings.signatories.map((s, i) => (
            <SignatoryCard
              key={s.id}
              signatory={s}
              index={i}
              members={members}
              disabled={editDisabled}
              onSaved={(updated) =>
                setSettings((prev) =>
                  prev
                    ? { ...prev, signatories: prev.signatories.map((x) => (x.id === updated.id ? updated : x)) }
                    : prev
                )
              }
              onDelete={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api.deleteSignatory(s.id);
                  setSettings(await api.getTenantSettings());
                } catch (err) {
                  setError(apiErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          ))
        )}

        {/* בעלי תפקידים מהאלפון — auto-listed from role assignments, collapsible */}
        <div className="mt-4 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setRoleHoldersOpen((o) => !o)}
            className="flex w-full items-center justify-between text-right"
          >
            <span className="text-sm font-semibold text-ink-soft">
              בעלי תפקידים מהאלפון
              {roleHolders.length > 0 && (
                <span className="mr-1.5 font-normal text-ink-soft">({roleHolders.length})</span>
              )}
            </span>
            <span className="text-ink-soft">{roleHoldersOpen ? "﹀" : "︿"}</span>
          </button>

          {roleHoldersOpen && (
            <div className="mt-3">
              <p className="mb-3 text-xs text-ink-soft">
                כל איש קשר שהוגדר לו תפקיד מרשימת התפקידים מופיע כאן. הוסיפו לו חתימה שתופיע בפרוטוקולים ובהזמנות.
              </p>
              {roleHolders.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  אין בעלי תפקידים. הגדירו תפקיד לאיש קשר באלפון כדי שיופיע כאן.
                </p>
              ) : (
                roleHolders.map((c) => (
                  <RoleHolderSignatureCard
                    key={c.id}
                    contact={c}
                    disabled={editDisabled}
                    onSaved={(updated) =>
                      setRoleHolders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                    }
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* חותמת ופרטים תפעוליים */}
      <div className={SECTION_CLS}>
        <SectionHeader icon="🖨" title="חותמת ופרטים תפעוליים" />

        <label className="mb-1 block text-xs font-medium text-ink-soft">חותמת האגודה</label>
        <p className="mb-2 text-xs text-ink-soft">תופיע בפרוטוקולים רשמיים. PNG שקוף מומלץ.</p>
        <ImageField
          imageUrl={settings.stamp_url}
          disabled={editDisabled}
          hint="PNG שקוף מומלץ"
          onUpload={async (file) => {
            setBusy(true);
            setError(null);
            try {
              setSettings(await api.uploadStamp(file));
            } catch (err) {
              setError(apiErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
          onRemove={async () => {
            setBusy(true);
            setError(null);
            try {
              setSettings(await api.deleteStamp());
            } catch (err) {
              setError(apiErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />

        <hr className="my-4 border-line" />

        <h3 className="mb-3 text-sm font-semibold">ברירות מחדל לישיבות</h3>
        <label className="mb-1 block text-xs font-medium text-ink-soft">מקום ברירת מחדל לישיבות</label>
        <p className="mb-1.5 text-xs text-ink-soft">המקום יתמלא אוטומטית בכל ישיבה חדשה.</p>
        <input
          type="text"
          value={meetingLocation}
          disabled={editDisabled}
          onChange={(e) => setMeetingLocation(e.target.value)}
          onBlur={() => saveField({ meeting_location: meetingLocation || null })}
          className={`${INPUT_CLS} mb-4`}
        />

        <label className="mb-1 block text-xs font-medium text-ink-soft">יום ברירת מחדל לישיבה</label>
        <p className="mb-1.5 text-xs text-ink-soft">יום בשבוע שבו הישיבות מתקיימות בדרך כלל.</p>
        <div className="mb-4">
          <WeekdayPicker
            value={settings.meeting_weekday}
            disabled={editDisabled}
            onChange={(v) => saveField({ meeting_weekday: v })}
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-soft">שעות ברירת מחדל לישיבה</label>
        <p className="mb-1.5 text-xs text-ink-soft">יתמלאו אוטומטית בכל ישיבה חדשה.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-soft">שעת התחלה</label>
            <input
              type="time"
              value={settings.meeting_start_time || ""}
              disabled={editDisabled}
              onChange={(e) => saveField({ meeting_start_time: e.target.value || null })}
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">שעת סיום</label>
            <input
              type="time"
              value={settings.meeting_end_time || ""}
              disabled={editDisabled}
              onChange={(e) => saveField({ meeting_end_time: e.target.value || null })}
              className={INPUT_CLS}
            />
          </div>
        </div>

        <hr className="my-4 border-line" />

        <h3 className="mb-3 text-sm font-semibold">ברירות מחדל לאסיפות</h3>
        <label className="mb-1 block text-xs font-medium text-ink-soft">מקום ברירת מחדל לאסיפות</label>
        <p className="mb-1.5 text-xs text-ink-soft">המקום יתמלא אוטומטית בכל אסיפה חדשה.</p>
        <input
          type="text"
          value={assemblyLocation}
          disabled={editDisabled}
          onChange={(e) => setAssemblyLocation(e.target.value)}
          onBlur={() => saveField({ assembly_location: assemblyLocation || null })}
          className={`${INPUT_CLS} mb-4`}
        />

        <label className="mb-1 block text-xs font-medium text-ink-soft">יום ברירת מחדל לאסיפה</label>
        <p className="mb-1.5 text-xs text-ink-soft">יום בשבוע שבו האסיפות מתקיימות בדרך כלל.</p>
        <div className="mb-4">
          <WeekdayPicker
            value={settings.assembly_weekday}
            disabled={editDisabled}
            onChange={(v) => saveField({ assembly_weekday: v })}
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-soft">שעות ברירת מחדל לאסיפה</label>
        <p className="mb-1.5 text-xs text-ink-soft">יתמלאו אוטומטית בכל אסיפה חדשה.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-soft">שעת התחלה</label>
            <input
              type="time"
              value={settings.assembly_start_time || ""}
              disabled={editDisabled}
              onChange={(e) => saveField({ assembly_start_time: e.target.value || null })}
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">שעת סיום</label>
            <input
              type="time"
              value={settings.assembly_end_time || ""}
              disabled={editDisabled}
              onChange={(e) => saveField({ assembly_end_time: e.target.value || null })}
              className={INPUT_CLS}
            />
          </div>
        </div>
      </div>

      {/* בעלי תפקיד — role types for the אלפון */}
      <div className={SECTION_CLS}>
        <SectionHeader icon="🏷" title="בעלי תפקיד" />
        <p className="mb-3 text-xs text-ink-soft">
          סוגי תפקידים לארגון. הרשימה מופיעה כאפשרויות בשדה "תפקיד" באלפון.
        </p>
        {settings.role_titles.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {settings.role_titles.map((r) => (
              <span key={r} className="flex items-center gap-1.5 rounded-full bg-line px-3 py-1 text-sm">
                {r}
                {admin && (
                  <button
                    onClick={() => saveField({ role_titles: settings.role_titles.filter((x) => x !== r) })}
                    disabled={busy}
                    className="rounded-md p-1 text-ink-soft transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    aria-label="הסר תפקיד"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-sm text-ink-soft">לא הוגדרו תפקידים עדיין.</p>
        )}
        {admin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = newRole.trim();
              if (!v || settings.role_titles.includes(v)) {
                setNewRole("");
                return;
              }
              saveField({ role_titles: [...settings.role_titles, v] });
              setNewRole("");
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="שם תפקיד חדש"
              className={INPUT_CLS}
            />
            <button
              type="submit"
              disabled={busy || !newRole.trim()}
              className="inline-flex h-10 shrink-0 items-center rounded-md bg-turquoise px-4 font-rubik text-sm font-bold text-white transition hover:bg-turquoise-dark disabled:opacity-50"
            >
              הוסף
            </button>
          </form>
        )}
      </div>

      {/* נושאים קבועים בכל ישיבה */}
      <div className={SECTION_CLS}>
        <SectionHeader icon="📋" title="נושאים קבועים בכל ישיבה" />
        <p className="mb-4 text-xs text-ink-soft">
          שני הנושאים האלו נוספים אוטומטית בכל ישיבה חדשה. נושאים חדשים שתוסיפו ייכנסו בין שניהם.
        </p>

        <label className="mb-1 block text-xs font-medium text-ink-soft">נושא ראשון</label>
        <div className="mb-4 flex gap-2">
          <div className="w-24">
            <input
              type="number"
              min={0}
              value={firstTopicDuration}
              disabled={editDisabled}
              onChange={(e) => setFirstTopicDuration(e.target.value)}
              onBlur={() =>
                saveField({ recurring_topic_first_duration: firstTopicDuration ? Number(firstTopicDuration) : null })
              }
              placeholder="דקות"
              className={INPUT_CLS}
            />
          </div>
          <input
            type="text"
            value={firstTopicTitle}
            disabled={editDisabled}
            onChange={(e) => setFirstTopicTitle(e.target.value)}
            onBlur={() => saveField({ recurring_topic_first_title: firstTopicTitle || null })}
            className={`${INPUT_CLS} flex-1`}
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-soft">נושא אחרון</label>
        <div className="flex gap-2">
          <div className="w-24">
            <input
              type="number"
              min={0}
              value={lastTopicDuration}
              disabled={editDisabled}
              onChange={(e) => setLastTopicDuration(e.target.value)}
              onBlur={() =>
                saveField({ recurring_topic_last_duration: lastTopicDuration ? Number(lastTopicDuration) : null })
              }
              placeholder="דקות"
              className={INPUT_CLS}
            />
          </div>
          <input
            type="text"
            value={lastTopicTitle}
            disabled={editDisabled}
            onChange={(e) => setLastTopicTitle(e.target.value)}
            onBlur={() => saveField({ recurring_topic_last_title: lastTopicTitle || null })}
            className={`${INPUT_CLS} flex-1`}
          />
        </div>
      </div>

      {/* נושאים קבועים בכל אסיפה */}
      <div className={SECTION_CLS}>
        <SectionHeader icon="📋" title="נושאים קבועים בכל אסיפה" />
        <p className="mb-4 text-xs text-ink-soft">
          שני הנושאים האלו נוספים אוטומטית בכל אסיפה חדשה. נושאים חדשים שתוסיפו ייכנסו בין שניהם.
        </p>

        <label className="mb-1 block text-xs font-medium text-ink-soft">נושא ראשון</label>
        <div className="mb-4 flex gap-2">
          <div className="w-24">
            <input
              type="number"
              min={0}
              value={aFirstTopicDuration}
              disabled={editDisabled}
              onChange={(e) => setAFirstTopicDuration(e.target.value)}
              onBlur={() =>
                saveField({
                  assembly_recurring_topic_first_duration: aFirstTopicDuration
                    ? Number(aFirstTopicDuration)
                    : null,
                })
              }
              placeholder="דקות"
              className={INPUT_CLS}
            />
          </div>
          <input
            type="text"
            value={aFirstTopicTitle}
            disabled={editDisabled}
            onChange={(e) => setAFirstTopicTitle(e.target.value)}
            onBlur={() => saveField({ assembly_recurring_topic_first_title: aFirstTopicTitle || null })}
            className={`${INPUT_CLS} flex-1`}
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-soft">נושא אחרון</label>
        <div className="flex gap-2">
          <div className="w-24">
            <input
              type="number"
              min={0}
              value={aLastTopicDuration}
              disabled={editDisabled}
              onChange={(e) => setALastTopicDuration(e.target.value)}
              onBlur={() =>
                saveField({
                  assembly_recurring_topic_last_duration: aLastTopicDuration
                    ? Number(aLastTopicDuration)
                    : null,
                })
              }
              placeholder="דקות"
              className={INPUT_CLS}
            />
          </div>
          <input
            type="text"
            value={aLastTopicTitle}
            disabled={editDisabled}
            onChange={(e) => setALastTopicTitle(e.target.value)}
            onBlur={() => saveField({ assembly_recurring_topic_last_title: aLastTopicTitle || null })}
            className={`${INPUT_CLS} flex-1`}
          />
        </div>
      </div>

      {/* חתימה דיגיטלית — אישית, לכל משתמש */}
      <div className={SECTION_CLS}>
        <SectionHeader icon="🖋" title="חתימה דיגיטלית" />
        <p className="mb-4 text-xs text-ink-soft">
          ציירו את חתימתכם. תשמר בפרופיל שלכם לשימוש עתידי בפרוטוקולים דיגיטליים.
        </p>
        {mySignatureUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={mySignatureUrl}
              alt="החתימה שלי"
              className="h-20 max-w-xs rounded border border-line bg-surface object-contain p-2"
            />
            <button
              onClick={async () => {
                setSignatureBusy(true);
                try {
                  await api.deleteMySignature();
                  setMySignatureUrl(null);
                } catch (err) {
                  setError(apiErrorMessage(err));
                } finally {
                  setSignatureBusy(false);
                }
              }}
              disabled={signatureBusy}
              className="rounded-md px-3 py-1.5 font-rubik text-sm font-medium text-ink-soft transition hover:bg-line/60 hover:text-ink disabled:opacity-50"
            >
              🗑 מחק וצייר מחדש
            </button>
          </div>
        ) : (
          <SignaturePad
            saving={signatureBusy}
            onSave={async (dataUrl) => {
              setSignatureBusy(true);
              setError(null);
              try {
                const r = await api.setMySignature(dataUrl);
                setMySignatureUrl(r.signature_image_url);
              } catch (err) {
                setError(apiErrorMessage(err));
              } finally {
                setSignatureBusy(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
