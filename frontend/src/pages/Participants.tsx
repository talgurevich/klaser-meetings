import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type Participant } from "../lib/api";
import { useIsEditor } from "../components/Layout";
import ContactModal from "../components/ContactModal";

/** אלפון — the organisation's contacts. "חבר" is someone from the general
 * public (receives the published summary, can be a non-committee invitee).
 * "עורך" is a committee member (auto-invited to every meeting), derived from
 * a manual mark or an email match with a system user. Supports CSV import. */
export default function Participants() {
  const editor = useIsEditor();
  const [items, setItems] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // null = modal closed; {contact:null} = create; {contact:p} = edit
  const [modal, setModal] = useState<{ contact: Participant | null } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function load() {
    api
      .listParticipants()
      .then(setItems)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteParticipant(id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    setImportMsg(null);
    try {
      const r = await api.importParticipants(file);
      setImportMsg(`יובאו ${r.imported} אנשי קשר${r.skipped ? `, דולגו ${r.skipped} (כפילויות אימייל)` : ""}.`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const yesNo = (v: boolean) =>
    v ? <span className="text-emerald-700">✓</span> : <span className="text-ink-soft">—</span>;
  const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

  return (
    <div className="max-w-5xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">אלפון</h1>
        {editor && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded border border-line-strong px-3 py-2 text-sm hover:bg-line disabled:opacity-50"
            >
              ⬆ ייבוא CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImportFile} />
            <button
              onClick={() => setModal({ contact: null })}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
            >
              + חבר חדש
            </button>
          </div>
        )}
      </div>
      <p className="mb-6 text-sm text-ink-soft">
        אנשי הקשר של הארגון. "חבר" הוא איש מהציבור הכללי — מקבל את סיכום הישיבה כשמפרסמים לציבור, ויכול
        להיות מוזמן שאינו חבר ועד. "חבר ועד" מוזמן אוטומטית לכל פגישה, ונקבע לפי סימון ידני או התאמת
        האימייל למשתמש מערכת קיים.
      </p>

      {importMsg && (
        <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {importMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {items === null && !error && <p className="text-ink-soft">טוען…</p>}
      {items && items.length === 0 && <p className="text-ink-soft">האלפון ריק.</p>}

      {items && items.length > 0 && (
        <div className="overflow-x-auto rounded border border-line bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface text-ink-soft">
              <tr>
                <th className="px-3 py-2 font-medium">שם</th>
                <th className="px-3 py-2 font-medium">נייד</th>
                <th className="px-3 py-2 font-medium">אימייל</th>
                <th className="px-3 py-2 font-medium">תפקיד</th>
                <th className="px-3 py-2 font-medium">הצטרפות לתפקיד</th>
                <th className="px-3 py-2 text-center font-medium">חבר</th>
                <th className="px-3 py-2 text-center font-medium">חבר ועד</th>
                {editor && <th className="px-3 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-2">{p.full_name}</td>
                  <td className="px-3 py-2" dir="ltr">{p.phone || "—"}</td>
                  <td className="px-3 py-2" dir="ltr">{p.email || "—"}</td>
                  <td className="px-3 py-2">{p.roles.length ? p.roles.join(", ") : "—"}</td>
                  <td className="px-3 py-2" dir="ltr">{fmtDate(p.join_date)}</td>
                  <td className="px-3 py-2 text-center">{yesNo(p.public_send)}</td>
                  <td className="px-3 py-2 text-center">{yesNo(p.is_system_user || p.edit_permission)}</td>
                  {editor && (
                    <td className="px-3 py-2 text-left">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button onClick={() => setModal({ contact: p })} disabled={busy} className="text-xs text-accent-dark hover:underline disabled:opacity-50">
                          ערוך
                        </button>
                        <button onClick={() => remove(p.id)} disabled={busy} className="text-xs text-red-700 hover:underline disabled:opacity-50">
                          הסר
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ContactModal
          contact={modal.contact}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
