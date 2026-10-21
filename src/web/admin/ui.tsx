import { LoaderCircle, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import type { RoomStatusKind } from '../../shared/model.ts';

// Small set of admin UI pieces, so pages stay consistent.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-900 text-white shadow-sm hover:bg-brand-800 disabled:bg-brand-900/50',
  secondary: 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-600/50',
};

/** Button look, also for links that act as buttons. */
export function buttonClass(variant: Variant = 'secondary', size: 'sm' | 'md' = 'md'): string {
  const sizing = size === 'sm' ? 'h-8 gap-1.5 px-2.5 text-sm' : 'h-10 gap-2 px-4 text-sm';
  return `inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]}`;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button type="button" {...props} disabled={props.disabled || busy} className={`${buttonClass(variant, size)} ${className}`}>
      {busy && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-slate-900 shadow-sm ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm';

export function Field({
  label,
  error,
  hint,
  children,
  className = '',
}: {
  label: ReactNode;
  error?: string | undefined;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-sm font-medium text-slate-700">{label}</div>
      {children}
      {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'red' | 'brand' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    brand: 'bg-brand-100 text-brand-900',
  };
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Spinner({ className = '' }: { className?: string }) {
  return <LoaderCircle className={`size-5 animate-spin text-slate-400 ${className}`} />;
}

export function PageLoading() {
  return (
    <div className="grid place-items-center py-24">
      <Spinner className="size-8" />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{children}</div>;
}

export const STATUS_LABELS: Record<RoomStatusKind, string> = { free: 'Libera', occupied: 'Occupata', reserved: 'Riservata' };

const STATUS_DOTS: Record<RoomStatusKind, string> = { free: 'bg-free', occupied: 'bg-occupied', reserved: 'bg-reserved' };

export function StatusDot({ status, className = '' }: { status: RoomStatusKind; className?: string }) {
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${STATUS_DOTS[status]} ${className}`} />;
}

/** Modal built on <dialog>, so focus handling and Escape come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm ${wide ? 'max-w-2xl' : 'max-w-md'}`}
    >
      {open && (
        <>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Chiudi">
              <X className="size-5" />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

// Confirmation dialog returning a promise, so callers can write `if (await confirm(...))`.

interface ConfirmRequest {
  message: ReactNode;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

type Toast = { id: number; message: string; kind: 'success' | 'error' };

interface Feedback {
  confirm: (message: ReactNode, options?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  toast: (message: string, kind?: Toast['kind']) => void;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback<Feedback['confirm']>(
    (message, options = {}) =>
      new Promise((resolve) =>
        setRequest({ message, confirmLabel: options.confirmLabel ?? 'Conferma', danger: options.danger ?? false, resolve }),
      ),
    [],
  );

  const toast = useCallback<Feedback['toast']>((message, kind = 'success') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      <Dialog
        open={request !== null}
        onClose={() => answer(false)}
        title="Conferma"
        footer={
          <>
            <Button onClick={() => answer(false)}>Annulla</Button>
            <Button variant={request?.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
              {request?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="text-sm text-slate-700">{request?.message}</div>
      </Dialog>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): Feedback {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error('useFeedback outside FeedbackProvider');
  return feedback;
}
