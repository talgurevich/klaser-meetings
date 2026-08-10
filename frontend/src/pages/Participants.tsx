import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type Participant } from "../lib/api";
import { useIsEditor } from "../components/Layout";
import ContactModal from "../components/ContactModal";
import {
  CheckMarkIcon,
  DsButton,
  PageHeader,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadCloudIcon,
} from "../components/klaser-ds";

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
  const [query, setQuery] = useState("");

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
    v ? (
      <span className="inline-flex text-success">
        <CheckMarkIcon />
      </span>
    ) : (
      <span className="text-ink-soft">—</span>
    );
  const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

  // Client-side search over name / email / phone / roles.
  const q = query.trim().toLowerCase();
  const filtered =
    items?.filter((p) =>
      !q
        ? true
        : [p.full_name, p.email, p.phone, p.roles.join(" ")]
            .filter(Boolean)
            .some((f) => f!.toLowerCase().includes(q)),
    ) ?? null;

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="קהילה"
        title="אלפון"
        description={
          <>
            אנשי הקשר של הארגון. "חבר" הוא איש מהציבור הכללי — מקבל את סיכום הישיבה כשמפרסמים לציבור,
            ויכול להיות מוזמן שאינו חבר ועד. "חבר ועד" מוזמן אוטומטית לכל פגישה, ונקבע לפי סימון ידני
            או התאמת האימייל למשתמש מערכת קיים.
          </>
        }
        actions={
          editor && (
            <>
              <DsButton
                variant="secondary"
                size="compact"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                icon={<UploadCloudIcon />}
              >
                ייבוא CSV
              </DsButton>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onImportFile}
              />
              <DsButton
                size="compact"
                onClick={() => setModal({ contact: null })}
                icon={<PlusIcon />}
              >
                חבר חדש
              </DsButton>
            </>
          )
        }
      />

      {importMsg && (
        <div className="mb-4 rounded-md border border-success/30 bg-success-soft p-4 text-sm text-success">
          {importMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {items && items.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם, אימייל, טלפון או תפקיד…"
            className="w-full rounded-md border border-line bg-white py-2.5 pr-10 pl-3 font-rubik text-sm text-ink outline-none transition focus:border-turquoise focus:ring-2 focus:ring-turquoise/20"
          />
        </div>
      )}

      {items === null && !error && <p className="animate-pulse text-sm text-ink-soft">טוען…</p>}
      {items && items.length === 0 && <p className="text-ink-soft">האלפון ריק.</p>}
      {items && items.length > 0 && filtered && filtered.length === 0 && (
        <p className="text-ink-soft">לא נמצאו תוצאות עבור "{query}".</p>
      )}

      {filtered && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-[0px_1px_0_rgba(0,0,0,0.03),0px_4px_16px_-4px_rgba(0,0,0,0.06)]">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface font-rubik text-xs uppercase tracking-[0.1em] text-ink-soft">
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
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-line transition hover:bg-turquoise/5">
                  <td className="px-3 py-2">{p.full_name}</td>
                  <td className="px-3 py-2" dir="ltr">{p.phone || "—"}</td>
                  <td className="px-3 py-2" dir="ltr">{p.email || "—"}</td>
                  <td className="px-3 py-2">{p.roles.length ? p.roles.join(", ") : "—"}</td>
                  <td className="px-3 py-2" dir="ltr">{fmtDate(p.join_date)}</td>
                  <td className="px-3 py-2 text-center">{yesNo(p.public_send)}</td>
                  <td className="px-3 py-2 text-center">{yesNo(p.edit_permission)}</td>
                  {editor && (
                    <td className="px-3 py-2 text-left">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <DsButton
                          variant="secondary"
                          size="micro"
                          className="border"
                          onClick={() => setModal({ contact: p })}
                          disabled={busy}
                          icon={<PencilIcon />}
                        >
                          ערוך
                        </DsButton>
                        <DsButton
                          variant="destructive"
                          size="micro"
                          onClick={() => remove(p.id)}
                          disabled={busy}
                          icon={<TrashIcon />}
                        >
                          הסר
                        </DsButton>
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
