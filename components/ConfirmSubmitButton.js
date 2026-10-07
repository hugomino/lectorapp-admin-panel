'use client';

// Botón de envío que pide confirmación antes de lanzar la acción del formulario.
export default function ConfirmSubmitButton({ confirmText, className = '', children, ...props }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
      {...props}
    >
      {children}
    </button>
  );
}
