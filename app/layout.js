import './globals.css';

export const metadata = {
  title: 'LectorApp — Verificación de libros',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
