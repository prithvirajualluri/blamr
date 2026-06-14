import React from 'react';

interface KeyboardOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { desc: 'Go to Monitor', key: 'G M' },
  { desc: 'Go to All runs', key: 'G R' },
  { desc: 'Connect agents', key: 'G C' },
  { desc: 'API & keys', key: 'G K' },
  { desc: 'Search', key: '/' },
  { desc: 'Back / close', key: 'Esc' },
  { desc: 'Next tab', key: ']' },
  { desc: 'Previous tab', key: '[' },
  { desc: 'This overlay', key: '?' },
];

export function KeyboardOverlay({ open, onClose }: KeyboardOverlayProps) {
  return (
    <div
      id="kb-overlay"
      className={open ? 'show' : ''}
      onClick={onClose}
      role="dialog"
      aria-hidden={!open}
    >
      <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
        <h3>⌨ Keyboard shortcuts</h3>
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="kb-row">
            <span className="kb-desc">{s.desc}</span>
            <span className="kb-key">{s.key}</span>
          </div>
        ))}
        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
