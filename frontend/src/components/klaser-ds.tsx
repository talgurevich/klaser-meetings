// klaser-ds.tsx — Klaser Design System shared components (v1)
// Spec: https://github.com/talgurevich/elrom-platform/blob/main/docs/klaser-ds.md
// Copy-paste target: every Klaser product surface. Keep in sync with Takanon.
//
// RTL reminders (spec §2.5):
//  - `justify-end` sends items LEFT. Use `justify-start` or omit.
//  - DOM order == visual order: first child is rightmost.
//  - Button icons go on the visual LEFT, so the icon element comes DOM-last.
import type React from "react";
import type { ReactNode, MouseEvent } from "react";

/* ─── Chips / Tags / Pills ────────────────────────────────────────── */

/**
 * Grey / active / teal-outlined chip. Interactive button variant.
 * Use for: filter chips, classify chips, small action buttons.
 */
export function Chip({
  children,
  variant = "grey",
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  variant?: "grey" | "active" | "teal-outline";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const styles =
    variant === "active"
      ? "bg-turquoise/10 text-turquoise hover:bg-turquoise/15"
      : variant === "teal-outline"
      ? "bg-white border border-turquoise text-turquoise hover:bg-turquoise/5"
      : "bg-line text-ink-soft hover:bg-line-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-rubik font-medium text-xs transition disabled:opacity-50 disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * Read-only rounded tag pill. Use for doc types, categories, section paths,
 * date labels — anything metadata-ish that shouldn't look clickable.
 */
export function DsTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-line text-ink-soft font-rubik text-xs">
      {children}
    </span>
  );
}

export type StatusVariant = "success" | "warning" | "danger" | "neutral" | "teal";

/**
 * Colored status pill — green (success), orange (warning), red (danger),
 * grey (neutral), teal (info). Optional icon rendered as first child.
 */
export function StatusPill({
  variant,
  children,
}: {
  variant: StatusVariant;
  children: ReactNode;
}) {
  const styles: Record<StatusVariant, string> = {
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning-dark",
    danger: "bg-danger/10 text-danger",
    neutral: "bg-line text-ink-soft",
    teal: "bg-turquoise/10 text-turquoise",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-rubik font-medium text-xs ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

/* ─── Buttons (spec §4.1) ─────────────────────────────────────────── */

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "md" | "compact" | "micro";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-turquoise text-white hover:bg-turquoise-dark",
  secondary:
    "bg-white border-2 border-turquoise text-turquoise hover:bg-turquoise hover:text-white",
  destructive:
    "bg-white border border-danger text-danger hover:bg-danger hover:text-white",
  ghost: "bg-transparent text-ink-soft hover:bg-line/60 hover:text-ink",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "h-12 px-8 text-base font-bold",
  compact: "h-10 px-4 text-sm font-bold",
  micro: "px-3 py-1.5 text-xs font-medium",
};

/**
 * Canonical DS button. Icons belong on the visual LEFT of the label, which in
 * RTL means passing them via `icon` — this renders them DOM-last for you.
 */
export function DsButton({
  children,
  icon,
  variant = "primary",
  size = "md",
  type = "button",
  onClick,
  disabled,
  title,
  className = "",
}: {
  children: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-rubik transition disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
    >
      <span>{children}</span>
      {icon}
    </button>
  );
}

/* ─── Form controls ───────────────────────────────────────────────── */

export function DsInput({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  type = "text",
  disabled,
  required,
  min,
  max,
  step,
  id,
  autoFocus,
  autoComplete,
  dir,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  id?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  /** Set "ltr" for URLs/emails; the field then aligns left. */
  dir?: "rtl" | "ltr";
  className?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      dir={dir}
      disabled={disabled}
      required={required}
      min={min}
      max={max}
      step={step}
      className={`w-full px-3 py-2.5 border border-line rounded-md bg-white text-sm text-ink font-rubik outline-none focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 transition disabled:bg-line/40 disabled:text-ink-soft disabled:cursor-not-allowed ${
        dir === "ltr" ? "text-left" : "text-right"
      } ${className}`}
    />
  );
}

export function DsTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 4,
  disabled,
  id,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={`w-full px-3 py-2.5 border border-line rounded-md bg-white text-sm text-ink font-rubik text-right outline-none focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 transition disabled:bg-line/40 disabled:text-ink-soft disabled:cursor-not-allowed ${className}`}
    />
  );
}

export function DsSelect({
  value,
  onChange,
  children,
  disabled,
  id,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none px-3 py-2.5 pl-9 border border-line rounded-md bg-white text-sm text-ink font-rubik text-right outline-none cursor-pointer focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 transition disabled:bg-line/40 disabled:text-ink-soft disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-soft">
        <ChevronDownIcon />
      </span>
    </div>
  );
}

/** Custom teal-filled checkbox. Do not use native `<input type="checkbox">`. */
export function DsCheckbox({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-5 h-5 rounded-md flex items-center justify-center transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked
          ? "bg-turquoise text-white"
          : "bg-white border border-line-strong hover:border-turquoise"
      }`}
    >
      {checked && <CheckMarkIcon />}
    </button>
  );
}

/** Custom teal radio button. */
export function DsRadio({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-5 h-5 rounded-full flex items-center justify-center transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked
          ? "border-2 border-turquoise"
          : "border border-line-strong hover:border-turquoise"
      }`}
    >
      {checked && <span className="w-2.5 h-2.5 rounded-full bg-turquoise" />}
    </button>
  );
}

/**
 * Teal on/off switch. Not in the DS spec — added here (rather than kept
 * local to a product screen) so both products share one switch. Colors and
 * radius follow the DS tokens.
 */
export function DsToggle({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
        checked ? "bg-turquoise" : "bg-line-strong"
      }`}
    >
      {/* RTL: the knob travels leftward when off. */}
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "-translate-x-1" : "-translate-x-5"
        }`}
      />
    </button>
  );
}

/** Teal small label above a control (spec §4.4). */
export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <div className="font-rubik font-medium text-xs text-turquoise mb-2 flex items-baseline gap-2 justify-start">
        <span>{label}</span>
        {hint && <span className="text-ink-soft font-normal">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

/* ─── Surfaces ────────────────────────────────────────────────────── */

/** Standard DS card shell (spec §4.2). */
export function DsCard({
  children,
  className = "",
  interactive = true,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-lg border border-line ${
        interactive ? "hover:border-turquoise/40" : ""
      } shadow-[0px_1px_0_rgba(0,0,0,0.03),0px_4px_16px_-4px_rgba(0,0,0,0.06)] transition ${className}`}
    >
      {children}
    </div>
  );
}

/** Hairline divider used between card rows (spec §4.2). */
export function DsDivider({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-line ${className}`} />;
}

/** Compact teal in-page section header with a trailing rule (spec §4.3). */
export function SectionHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`font-rubik font-bold text-base tracking-[0.15em] text-turquoise mb-3 flex items-center gap-3 ${className}`}
    >
      <span>{children}</span>
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}

/** Eyebrow (H5) + H2 pair used at the top of a page or top-level section. */
export function PageHeader({
  eyebrow,
  title,
  actions,
  description,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 mb-8">
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <div className="font-rubik font-bold text-[11px] uppercase tracking-[0.25em] text-turquoise mb-2 text-right">
            {eyebrow}
          </div>
        )}
        <h1 className="font-rubik font-bold text-[32px] leading-tight text-ink text-right">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-ink-soft text-right">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ─── Modals / drawers (spec §4.6) ────────────────────────────────── */

/**
 * Modal shell. Per DS §4.6: eyebrow + title on the RIGHT, close icon on the
 * LEFT. Pass the action row via `actions` — it is laid out `flex-row-reverse`
 * so the DOM-first (primary) button lands on the far LEFT.
 *
 * Renders as a `<form>` when `onSubmit` is given, so submit buttons inside
 * `actions` still work.
 */
export function DsModal({
  title,
  eyebrow,
  subtitle,
  children,
  actions,
  onClose,
  onSubmit,
  size = "md",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  size?: "sm" | "md" | "lg";
}) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };
  const Inner = onSubmit ? "form" : "div";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <Inner
        onSubmit={onSubmit}
        className={`flex max-h-[90vh] w-full ${widths[size]} flex-col overflow-hidden rounded-lg border border-line bg-white shadow-[0px_2px_0_rgba(0,0,0,0.05),0px_4px_25px_0px_rgba(0,0,0,0.08)]`}
      >
        {/* Title first in DOM → visually right; close button last → left. */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-8 py-4">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="font-rubik text-xs font-medium text-turquoise">{eyebrow}</div>
            )}
            <h2 className="font-rubik text-2xl font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="shrink-0 rounded-md p-1 text-ink-soft transition hover:bg-line hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="overflow-y-auto px-8 py-8">{children}</div>

        {actions && (
          <div className="flex flex-row-reverse justify-start gap-2 border-t border-line px-8 py-4">
            {actions}
          </div>
        )}
      </Inner>
    </div>
  );
}

/* ─── Icons — inline SVG, currentColor for tinting ───────────────── */

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h6v6M20 4L10 14M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckMarkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Circle-arrow-left — canonical primary-CTA icon, appears at the LEFT of button labels. */
export function ArrowCircleLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 8l-4 4 4 4M9 12h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UploadCloudIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="text-turquoise">
      <path d="M16 20V8m0 0l-5 5m5-5l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 20a2 2 0 002 2h12a2 2 0 002-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Icons added by Meetings — shared back to the DS ─────────────── */

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12l16-8-6 16-2.5-6L4 12z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Nav icons — sized by their wrapper, tinted via currentColor ── */

/**
 * Sidebar/nav glyphs. These have no intrinsic width/height so they fill the
 * wrapper element (e.g. `<span className="h-5 w-5">`).
 */
export const NavIcon = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11l8-7 8 7v9a2 2 0 0 1-2 2h-4v-6h-4v6H6a2 2 0 0 1-2-2z" />
    </svg>
  ),
  meetings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  ),
  committees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M15 20a4 4 0 0 1 6.5-3.1" />
    </svg>
  ),
  topicPool: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
      <circle cx="19" cy="18" r="1.5" />
    </svg>
  ),
  participants: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8.5 17c.7-1.8 2-2.5 3.5-2.5s2.8.7 3.5 2.5" />
    </svg>
  ),
  actionItems: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 20a4 4 0 0 1 6-3" />
    </svg>
  ),
} as const;

export function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {open ? (
        <>
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
  );
}

export function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {collapsed ? <polyline points="9 6 15 12 9 18" /> : <polyline points="15 6 9 12 15 18" />}
    </svg>
  );
}

/* ─── Composite: open-source link button ─────────────────────────── */

/**
 * Small teal-outlined button — DS pattern for "פתח מקור" links to a
 * document. Wraps an `<a target="_blank">` so it renders as a link but
 * looks like a button. `href` is opaque to the DS (product-specific).
 */
export function OpenSourceButton({
  href,
  onClick,
  label = "פתח מקור",
}: {
  href: string;
  onClick?: (e: MouseEvent) => void;
  label?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onClick}
      title="פתח את קובץ המקור"
      className="shrink-0 inline-flex items-center gap-1.5 border border-turquoise text-turquoise bg-white px-3 py-1.5 rounded-md font-rubik font-semibold text-xs hover:bg-turquoise hover:text-white transition"
    >
      <ExternalLinkIcon />
      <span>{label}</span>
    </a>
  );
}
