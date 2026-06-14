import React, { useEffect, useState } from 'react';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const ICONS = { info: 'ℹ', success: '✓', warn: '⚠', error: '✗' };

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [out, setOut] = useState(false);

  useEffect(() => {
    const dur = toast.type === 'warn' || toast.type === 'error' ? 3500 : 3000;
    const t1 = setTimeout(() => setOut(true), dur - 200);
    const t2 = setTimeout(() => onDismiss(toast.id), dur);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [toast.id, toast.type, onDismiss]);

  return (
    <div className={`toast${out ? ' out' : ''}`}>
      <span>{ICONS[toast.type]}</span>
      <span>{toast.message}</span>
      <button type="button" style={{ marginLeft: 'auto', cursor: 'pointer', opacity: 0.5, background: 'none', border: 'none', color: 'inherit' }} onClick={() => onDismiss(toast.id)}>×</button>
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const addToast = (type: ToastMessage['type'], message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  };

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return { toasts, addToast, dismiss };
}
