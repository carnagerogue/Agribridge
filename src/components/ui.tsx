import {
  useEffect,
  useRef,
  useState,
  useId,
  useCallback,
  useContext,
  createContext,
  type ReactNode,
  type FormEvent,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  LoaderCircle,
  Search,
  Inbox,
  ArrowRight,
  AlertCircle,
  Check,
  type LucideIcon,
} from "lucide-react";

// A dialog owns submission locks, including forms that mount inside its children.
const ModalSubmissionContext = createContext<(() => () => void) | null>(null);

export function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest('[inert],[hidden],[aria-hidden="true"]') &&
      element.getClientRects().length > 0,
  );
}

export function trapFocus(event: KeyboardEvent, container: HTMLElement) {
  if (event.key !== "Tab") return;
  const items = focusableElements(container);
  if (!items.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = items[0],
    last = items[items.length - 1];
  const active = container.ownerDocument.activeElement;
  if (
    event.shiftKey &&
    (active === first || !items.includes(active as HTMLElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (active === last || !items.includes(active as HTMLElement))
  ) {
    event.preventDefault();
    first.focus();
  }
}

export function Button({
  children,
  variant = "primary",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button button-${variant} ${props.className ?? ""}`}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-heading-actions">{action}</div>}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "red" | "neutral" | "blue";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Empty({
  title,
  body,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty">
      <Icon size={32} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return (
    <div role="alert" className="notice notice-error">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "success";
}) {
  return (
    <div className={`notice notice-${tone}`}>
      {tone === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
      <div>{children}</div>
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-input">
      <Search size={18} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const pending = useRef(new Set<symbol>());
  const [submitting, setSubmitting] = useState(false);
  closeRef.current = onClose;
  const acquireSubmission = useCallback(() => {
    const token = Symbol("dialog-submission");
    pending.current.add(token);
    setSubmitting(true);
    return () => {
      pending.current.delete(token);
      setSubmitting(pending.current.size > 0);
    };
  }, []);
  const requestClose = useCallback(() => {
    if (!pending.current.size) closeRef.current();
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
      if (ref.current) trapFocus(event, ref.current);
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, [requestClose]);
  const dialog = (
    <ModalSubmissionContext.Provider value={acquireSubmission}>
      <div
        className="modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <div
          className={`modal ${wide ? "modal-wide" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          aria-busy={submitting}
          tabIndex={-1}
          ref={ref}
        >
          <header>
            <div className="modal-heading-copy">
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descriptionId}>{description}</p>}
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close dialog"
              disabled={submitting}
              onClick={requestClose}
            >
              <X size={20} />
            </button>
          </header>
          {children}
        </div>
      </div>
    </ModalSubmissionContext.Provider>
  );
  // Query containers and transforms must never become the dialog's viewport.
  // Keep markup available to SSR while React context follows the client portal.
  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
export function Form({
  onSubmit,
  children,
  submitLabel = "Save changes",
  onCancel,
}: {
  onSubmit: (data: FormData) => Promise<void>;
  children: ReactNode;
  submitLabel?: string;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const acquireSubmission = useContext(ModalSubmissionContext);
  const releaseRef = useRef<(() => void) | null>(null);
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => releaseRef.current?.(), []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error, busy]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const data = new FormData(event.currentTarget);
    submittingRef.current = true;
    const release = acquireSubmission?.();
    releaseRef.current = release ?? null;
    setBusy(true);
    setError("");
    try {
      await onSubmit(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please try again.",
      );
    } finally {
      release?.();
      releaseRef.current = null;
      submittingRef.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="workspace-form" onSubmit={submit} aria-busy={busy}>
      <div className="form-content">
        {error && (
          <div className="form-error-summary" tabIndex={-1} ref={errorRef}>
            <ErrorMessage message={error} />
          </div>
        )}
        <div className="form-grid">{children}</div>
      </div>
      <footer className="form-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          {submitLabel}
          <ArrowRight size={16} />
        </Button>
      </footer>
    </form>
  );
}
export function Skeleton() {
  return (
    <div aria-label="Loading workspace" role="status" className="skeleton">
      <div />
      <div />
      <div />
    </div>
  );
}
export const fieldText = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
export const fieldNumber = (data: FormData, key: string) =>
  Number(data.get(key));
