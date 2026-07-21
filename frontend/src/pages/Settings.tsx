import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type Member, type Signatory, type TenantSettings } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isAdmin } from "../lib/permissions";

// 0=Sunday .. 6=Saturday — see backend/app/models.py's TenantSettings
// docstring. Rendered in this order as flex children so the RTL layout
// naturally shows ראשון on the right / שבת on the left, matching the
// mockup.
const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const INPUT_CLS = "w-full rounded border border-line-strong px-3 py-2 text-sm";
const SECTION_CLS = "mb-4 rounded-lg border border-line bg-white p-5";

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
      <span>{title}</span>
      <span className="text-ink-soft">{icon}</span>
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
          className="shrink-0 text-xs text-red-700 hover:underline disabled:opacity-50"
        >
          ✕ הסר
        </button>
      )}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="shrink-0 rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-line disabled:opacity-50"
      >
        ⬆ {imageUrl ? "החלף" : "העלאה"}
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
        <img src={imageUrl} alt="" className="h-14 w-14 rounded border border-line bg-white object-contain p-1" />
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
          className={`rounded border px-3 py-1.5 text-sm disabled:opacity-50 ${
            value === i
              ? "border-accent bg-accent-dark text-white"
              : "border-line-strong text-ink hover:bg-line"
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
        className="w-full touch-none rounded-lg border border-dashed border-line-strong bg-surface"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={clear}
          disabled={saving || !hasDrawn}
          className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-line disabled:opacity-50"
        >
          🗑 נקה
        </button>
        <button
          onClick={save}
          disabled={saving || !hasDrawn}
          className="rounded bg-accent-dark px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          💾 שמור חתימה
        </button>
      </div>
    </div>
  );
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
  const [signatureText, setSignatureText] = useState(signatory.signature_text || "");
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      setPositionTitle(signatory.position_title || "");
      setSignatureText(signatory.signature_text || "");
      initialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch: { member_user_id?: string | null; position_title?: string; signature_text?: string }) {
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
          className="rounded px-1.5 py-0.5 text-ink-soft hover:bg-line hover:text-red-700"
          aria-label="מחק חתימה"
        >
          🗑
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">בעל התפקיד</label>
          <select
            value={signatory.member_user_id || ""}
            disabled={disabled || busy}
            onChange={(e) => save({ member_user_id: e.target.value || null })}
            className={INPUT_CLS}
          >
            <option value="">— ללא —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name || m.email}
              </option>
            ))}
          </select>
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
        <label className="mb-1 block text-xs font-medium text-ink-soft">טקסט חתימה</label>
        <textarea
          value={signatureText}
          disabled={disabled || busy}
          onChange={(e) => setSignatureText(e.target.value)}
          onBlur={() => save({ signature_text: signatureText })}
          rows={3}
          className={INPUT_CLS}
        />
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-ink-soft">תמונת חתימה (לפרוטוקולים)</label>
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
      </div>
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
  const initialized = useRef(false);

  useEffect(() => {
    api
      .getTenantSettings()
      .then(setSettings)
      .catch((err) => setError(apiErrorMessage(err)));
    api.listMembers().then(setMembers).catch(() => setMembers([]));
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
      <p className="text-sm text-red-700">{error}</p>
    ) : (
      <p className="text-sm text-ink-soft">טוען…</p>
    );
  }

  const editDisabled = !admin || busy;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">הגדרות מערכת</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
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
              className="mb-4 rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-line disabled:opacity-50"
            >
              + הוסף חתימה
            </button>
          )}
        </div>
        <p className="mb-4 -mt-2 text-xs text-ink-soft">
          עד 3 חתימות — יופיעו בתחתית פרוטוקולים ומיילים. ניתן להעלות גם תמונת חתימה לפרוטוקולים רשמיים.
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

        <hr className="my-5 border-line" />

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

        <hr className="my-5 border-line" />

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
              className="h-20 max-w-xs rounded border border-line bg-white object-contain p-2"
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
              className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-line disabled:opacity-50"
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
