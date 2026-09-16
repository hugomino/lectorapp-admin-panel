export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const hasError = params?.error === '1';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        action="/api/login"
        method="POST"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-6 text-lg font-semibold text-slate-900">Panel de verificación</h1>
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        {hasError && <p className="mb-4 text-sm text-red-600">Contraseña incorrecta.</p>}
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
