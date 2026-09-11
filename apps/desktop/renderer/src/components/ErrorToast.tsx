import { useState, useEffect, useCallback } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "error" | "warning" | "info";
  timestamp: number;
}

let _nextId = 0;
const _listeners: Set<(toasts: Toast[]) => void> = new Set();
let _toasts: Toast[] = [];

function _notify() {
  for (const listener of _listeners) {
    listener([..._toasts]);
  }
}

export function showToast(message: string, type: Toast["type"] = "error"): string {
  const id = `toast-${++_nextId}`;
  const toast: Toast = { id, message, type, timestamp: Date.now() };
  _toasts = [..._toasts, toast];
  _notify();
  return id;
}

export function dismissToast(id: string): void {
  _toasts = _toasts.filter((t) => t.id !== id);
  _notify();
}

export function clearAllToasts(): void {
  _toasts = [];
  _notify();
}

const AUTO_DISMISS_MS = 5000;

export function ErrorToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    _listeners.add(setToasts);
    return () => { _listeners.delete(setToasts); };
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      dismissToast(toasts[0].id);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div style={toastContainer}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const borderColor = toast.type === "error" ? "#a33" : toast.type === "warning" ? "#a80" : "#38a";
  const bgColor = toast.type === "error" ? "#2a1115" : toast.type === "warning" ? "#2a2011" : "#111a2a";

  return (
    <div style={{ ...toastItem, borderColor, background: bgColor }}>
      <span style={{ flex: 1, fontSize: "0.85em" }}>{toast.message}</span>
      <button onClick={onDismiss} style={dismissBtn}>
        ×
      </button>
    </div>
  );
}

const toastContainer: React.CSSProperties = {
  position: "fixed",
  top: "1rem",
  right: "1rem",
  zIndex: 200,
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  maxWidth: "350px",
};

const toastItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.6rem 0.8rem",
  border: "1px solid",
  borderRadius: "6px",
  color: "#eee",
  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
};

const dismissBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#aaa",
  cursor: "pointer",
  fontSize: "1.1em",
  padding: "0 0.2rem",
};
