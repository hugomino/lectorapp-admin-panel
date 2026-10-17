'use client';

import { useState } from 'react';
import { isValidVersion, compareVersions } from '@/lib/version';

// Formulario de la versión mínima. Valida el formato al escribir y pide confirmación
// con el valor concreto, porque subirla bloquea la app a quien tenga una versión anterior.
export default function MinVersionForm({ action, current }) {
  const [value, setValue] = useState(current);
  const version = value.trim();
  const valid = isValidVersion(version);
  const same = valid && compareVersions(version, current) === 0;
  const raising = valid && compareVersions(version, current) > 0;

  let hint = null;
  if (version && !valid) hint = { kind: 'error', text: 'Formato 1.3.0: tres números separados por puntos.' };
  else if (same) hint = { kind: 'info', text: 'Es la versión que ya está activa.' };
  else if (raising) {
    hint = { kind: 'warn', text: `Quien tenga una versión anterior a ${version} verá la pantalla de actualizar y no podrá usar la app.` };
  } else if (valid) {
    hint = { kind: 'info', text: `Bajas la versión mínima: volverán a poder entrar los que tengan ${version} o posterior.` };
  }

  const confirmText = raising
    ? `Vas a OBLIGAR a actualizar a todos los que tengan una versión anterior a ${version}.\n\n¿Ya está ${version} publicada en producción en Google Play?\nSi no lo está, nadie podrá usar la app hasta que lo esté.\n\n¿Continuar?`
    : `Vas a cambiar la versión mínima de ${current} a ${version}. ¿Continuar?`;

  const hintColor = {
    error: 'text-red-700',
    warn: 'text-amber-800',
    info: 'text-slate-500',
  };

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
      className="mt-4"
    >
      <label htmlFor="version" className="block text-sm font-medium text-slate-700">
        Versión mínima permitida
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          id="version"
          name="version"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="1.3.0"
          className="w-40 rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={!valid || same}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {raising ? 'Obligar a actualizar' : 'Guardar'}
        </button>
      </div>
      {hint && <p className={`mt-2 text-sm ${hintColor[hint.kind]}`}>{hint.text}</p>}
    </form>
  );
}
