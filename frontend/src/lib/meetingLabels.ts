import type { MeetingKind, MeetingStatus, TopicPoolStatus, TopicStatus } from "./api";

export const KIND_LABELS: Record<MeetingKind, string> = {
  meeting: "ישיבת ועד",
  assembly: "אסיפה",
};

export const STATUS_LABELS: Record<MeetingStatus, string> = {
  draft: "טיוטה",
  invited_internal: "הוזמן (פנימי)",
  invited_public: "הוזמן (ציבורי)",
  active: "פעילה",
  pending_approval: "ממתין לאישור",
  approved: "אושר",
  published: "פורסם",
  archived: "בארכיון",
};

// Fixed milestone order for the progress stepper on the meeting detail
// page (see components/StatusStepper.tsx) — mirrors MeetingDetail.tsx's
// own STATUS_ORDER, which drives the "next status" transition button.
// Kept here too since the stepper needs it independent of that page.
//
// "invited_public" is deliberately NOT in this list — the "שלח לציבור"
// step was pulled out of the active flow (not needed for now). The
// status value itself, its label/color/description below, and the
// backend's send-public endpoint are all left in place untouched — this
// only removes it from the flow a NEW meeting walks through. A meeting
// that already happens to be sitting in that status from before this
// change still works fine everywhere else; it just won't show up in the
// stepper's step list.
export const STATUS_ORDER: MeetingStatus[] = [
  "draft",
  "invited_internal",
  "active",
  "pending_approval",
  "approved",
  "published",
  "archived",
];

// Longer, plain-language explanation of each milestone — shown as a
// hover tooltip on the stepper so a user unfamiliar with the workflow
// can tell what each step actually means, not just its short label.
export const STATUS_DESCRIPTIONS: Record<MeetingStatus, string> = {
  draft: "טיוטה — הישיבה נוצרה. ניתן לערוך את הפרטים, לבנות את סדר היום ולהוסיף מוזמנים לפני השליחה.",
  invited_internal: "הוזמן פנימית — הזמנה נשלחה בדוא\"ל לחברי הוועד/הגוף הפנימי, כולל קישור לאישור הגעה.",
  invited_public: "הוזמן לציבור — הזמנה נשלחה גם לציבור הרחב, בנוסף להזמנה הפנימית.",
  active: "פעילה — הישיבה מתקיימת כעת. ניתן לסמן נוכחות, לנהל את סדר היום בזמן אמת ולתעד החלטות ומשימות המשך.",
  pending_approval: "ממתין לאישור — הישיבה ננעלה וממתינה לפחות לאישור פנימי אחד לפני שתיחשב מאושרת.",
  approved: "אושר — התקבל אישור פנימי. כעת יש לאשר את נוסח הפרוטוקול לפני שהוא יפורסם.",
  published: "פורסם — הפרוטוקול אושר ופורסם רשמית, וזמין לצפייה.",
  archived: "בארכיון — הישיבה הסתיימה במלואה ואוחסנה בארכיון.",
};

export const STATUS_COLORS: Record<MeetingStatus, string> = {
  draft: "bg-line text-ink-soft",
  invited_internal: "bg-blue-100 text-blue-800",
  invited_public: "bg-blue-100 text-blue-800",
  active: "bg-emerald-100 text-emerald-800",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  published: "bg-emerald-100 text-emerald-800",
  archived: "bg-line text-ink-soft",
};

export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  pending: "ממתין",
  in_progress: "בדיון",
  done: "הסתיים",
  deferred: "נדחה",
  skipped: "דולג",
  cancelled: "בוטל",
};

export const TOPIC_STATUS_COLORS: Record<TopicStatus, string> = {
  pending: "bg-line text-ink-soft",
  in_progress: "bg-blue-100 text-blue-800",
  done: "bg-emerald-100 text-emerald-800",
  deferred: "bg-amber-100 text-amber-800",
  skipped: "bg-line text-ink-soft",
  cancelled: "bg-red-100 text-red-800",
};

export const TOPIC_POOL_STATUS_LABELS: Record<TopicPoolStatus, string> = {
  pending_review: "ממתין לבדיקה",
  approved: "אושר",
  in_meeting: "בישיבה",
  used: "נוצל",
  rejected: "נדחה",
};

/** Today's date as YYYY-MM-DD in the browser's local timezone — used as
 * the starting-point date when instant-creating a draft meeting (see
 * Home.tsx / Meetings.tsx). Deliberately not `Date.toISOString()`, which
 * converts to UTC first and can land on the wrong day near midnight in
 * timezones ahead of UTC (e.g. Israel). */
export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
