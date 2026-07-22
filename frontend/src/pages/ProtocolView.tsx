import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiErrorMessage, type Meeting, type TenantSettings } from "../lib/api";
import { KIND_LABELS } from "../lib/meetingLabels";

const PRINT_CSS = `
@media print {
  header { display: none !important; }
  main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .no-print { display: none !important; }
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
}
.protocol { color: #171717; background: #fff; direction: rtl; }
.protocol h1 { font-size: 22px; font-weight: 900; margin: 0; }
.protocol .sub { font-size: 12px; color: #525252; }
.protocol .doc-title { text-align: center; font-size: 17px; font-weight: 800; margin: 22px 0 16px; }
.protocol .rule { border-top: 2px solid #171717; margin: 14px 0; }
.protocol .box { border: 1px solid #d6d3d1; border-radius: 6px; }
.protocol .box .row { display: flex; justify-content: space-between; gap: 16px; padding: 14px 18px; }
.protocol .box .row + .row { border-top: 1px solid #e7e5e4; }
.protocol .lbl { font-size: 11px; color: #737373; margin-bottom: 2px; }
.protocol .val { font-size: 15px; font-weight: 700; }
.protocol .section-title { font-size: 15px; font-weight: 800; margin: 22px 0 8px; }
.protocol table { width: 100%; border-collapse: collapse; }
.protocol thead th { background: #fafaf9; color: #525252; font-weight: 600; font-size: 12px;
  text-align: right; padding: 8px 12px; border: 1px solid #e7e5e4; }
.protocol td { padding: 10px 12px; border: 1px solid #e7e5e4; vertical-align: top; }
.protocol .topic-title { font-weight: 700; }
.protocol .decision { margin-top: 6px; font-size: 13px; color: #404040;
  border-inline-start: 3px solid #d6d3d1; padding-inline-start: 8px; }
.protocol .att { margin: 4px 0; padding-inline-start: 18px; }
.protocol .sigs { display: flex; justify-content: center; align-items: flex-end;
  gap: 40px; flex-wrap: wrap; margin-top: 40px; }
.protocol .sig { text-align: center; width: 200px; }
.protocol .sig-img { height: 60px; object-fit: contain; margin-bottom: 4px; }
.protocol .stamp-img { height: 90px; object-fit: contain; }
.protocol .sig-space { height: 60px; }
.protocol .sig-line { border-top: 1px solid #171717; margin-top: 4px; padding-top: 6px; }
.protocol .sig-role { font-weight: 700; font-size: 13px; }
.protocol .sig-name { font-size: 12px; color: #525252; }
.protocol .foot { display: flex; justify-content: space-between; gap: 16px; margin-top: 34px;
  padding-top: 14px; border-top: 1px solid #e7e5e4; font-size: 11px; color: #737373; }
`;

function hm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

export default function ProtocolView() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [attendance, setAttendance] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getMeeting(id), api.getTenantSettings(), api.getAttendance(id)])
      .then(([m, s, a]) => {
        setMeeting(m);
        setSettings(s);
        setAttendance(a);
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!meeting || !settings) return <p className="text-ink-soft">טוען…</p>;

  const kindLabel = KIND_LABELS[meeting.kind];
  const dateHe = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${meeting.date}T00:00:00`));
  const timeRange = [hm(meeting.time_start), hm(meeting.time_end)].filter(Boolean).join(" – ");
  const agenda = (meeting.topics || [])
    .filter((t) => !t.is_private)
    .sort((a, b) => a.order - b.order);
  const printDate = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // Signature blocks: the officials, with the stamp placed in the middle.
  const sigBlocks = settings.signatories.map((s) => (
    <div className="sig" key={s.id}>
      {s.signature_image_url ? (
        <img className="sig-img" src={s.signature_image_url} alt="" />
      ) : (
        <div className="sig-space" />
      )}
      <div className="sig-line">
        <div className="sig-role">{s.position_title || s.member_role || ""}</div>
        <div className="sig-name">{s.member_display_name || ""}</div>
      </div>
    </div>
  ));
  if (settings.stamp_url) {
    const stampBlock = (
      <div className="sig" key="stamp">
        <img className="stamp-img" src={settings.stamp_url} alt="" />
        <div className="sig-line">
          <div className="sig-role">חותמת</div>
        </div>
      </div>
    );
    sigBlocks.splice(Math.floor(sigBlocks.length / 2), 0, stampBlock);
  }

  return (
    <div>
      <style>{PRINT_CSS}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <Link to={`/meetings/${meeting.id}`} className="text-sm text-accent-dark hover:underline">
          ← חזרה לישיבה
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          הפק PDF
        </button>
      </div>

      <div className="protocol">
        {/* Header — logo right, org details left */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ textAlign: "left" }}>
            <h1>{settings.org_name || "ארגון"}</h1>
            <div className="sub">{kindLabel}</div>
          </div>
          {settings.logo_url && (
            <img src={settings.logo_url} alt="לוגו" style={{ height: 56, objectFit: "contain" }} />
          )}
        </div>
        <div className="rule" />

        <div className="doc-title">פרוטוקול {kindLabel}</div>

        {/* Details box */}
        <div className="box">
          <div className="row">
            <div>
              <div className="lbl">מספר ישיבה</div>
              <div className="val">{meeting.number || "—"}</div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div className="lbl">תאריך</div>
              <div className="val">{dateHe}</div>
              {timeRange && <div className="val">{timeRange}</div>}
            </div>
          </div>
          {meeting.location && (
            <div className="row">
              <div>
                <div className="lbl">מקום</div>
                <div className="val">{meeting.location}</div>
              </div>
            </div>
          )}
        </div>

        {/* Attendance */}
        <div className="section-title">נוכחים ({attendance.length})</div>
        {attendance.length === 0 ? (
          <p className="sub">לא נרשמה נוכחות.</p>
        ) : (
          <ul>
            {attendance.map((n, i) => (
              <li className="att" key={i}>
                {n}
              </li>
            ))}
          </ul>
        )}

        {/* Agenda + protocol */}
        <div className="section-title">סדר יום ופרוטוקול</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>נושא</th>
              <th style={{ width: 70 }}>זמן</th>
            </tr>
          </thead>
          <tbody>
            {agenda.map((t, i) => (
              <tr key={t.id}>
                <td>{i + 1}</td>
                <td>
                  <div className="topic-title">{t.title}</div>
                  {t.decision_text && <div className="decision">החלטה: {t.decision_text}</div>}
                  {t.action_item && <div className="decision">משימה: {t.action_item}</div>}
                </td>
                <td>{t.duration_minutes ? `${t.duration_minutes} ד׳` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Signatures */}
        {sigBlocks.length > 0 && <div className="sigs">{sigBlocks}</div>}

        <div className="foot">
          <div>
            {(settings.org_name || "") + " — פרוטוקול " + kindLabel}
          </div>
          <div>תאריך הפקה: {printDate}</div>
        </div>
      </div>
    </div>
  );
}
