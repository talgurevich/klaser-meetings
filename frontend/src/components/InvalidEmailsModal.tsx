import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InvalidRecipient } from "../lib/api";
import { DsButton, DsModal } from "./klaser-ds";

/** Shown after a send when some recipients had a malformed email address, so
 * nothing went out to them. Each name (when it's an אלפון contact) links to
 * edit that contact so the address can be fixed. */
export default function InvalidEmailsModal({
  recipients,
  onClose,
}: {
  recipients: InvalidRecipient[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [showList, setShowList] = useState(false);

  return (
    <DsModal
      title="חלק מהמיילים לא נשלחו"
      size="sm"
      onClose={onClose}
      actions={
        <DsButton size="compact" onClick={onClose}>
          סגור
        </DsButton>
      }
    >
      <p className="text-sm leading-relaxed text-ink">
        חלק מהמיילים לא נשלחו בגלל כתובת דוא״ל לא תקינה ({recipients.length}). ניתן לתקן את הכתובת
        באלפון ולשלוח שוב.
      </p>

      {!showList ? (
        <button
          onClick={() => setShowList(true)}
          className="mt-3 font-rubik text-sm font-semibold text-turquoise transition hover:underline"
        >
          ראה רשימה
        </button>
      ) : (
        <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {recipients.map((r, i) => (
            <li
              key={r.id ?? `${r.email}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-1.5 text-sm"
            >
              {r.id ? (
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/participants?edit=${r.id}`);
                  }}
                  className="font-rubik font-medium text-turquoise transition hover:underline"
                >
                  {r.name}
                </button>
              ) : (
                <span>{r.name}</span>
              )}
              <span className="truncate text-xs text-danger" dir="ltr">
                {r.email}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DsModal>
  );
}
