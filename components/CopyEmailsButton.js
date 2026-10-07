'use client';

import { useState } from 'react';

// Copia al portapapeles una lista de correos separados por coma (formato que acepta Play Console).
export default function CopyEmailsButton({ emails, className = '' }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = emails.join(', ');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Respaldo para navegadores sin permiso de portapapeles.
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={emails.length === 0}
      className={`rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {copied ? `Copiados (${emails.length})` : 'Copiar correos'}
    </button>
  );
}
