import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// CSV con los correos pendientes de aprobar (uno por línea), listo para subir a Play Console.
// La sesión ya la exige el middleware (todas las rutas salvo /login).
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('beta_testers_android')
    .select('email')
    .eq('is_tester_added', false)
    .order('created_at', { ascending: true });
  if (error) return new Response(error.message, { status: 500 });

  const body = data.map((r) => r.email).join('\r\n') + (data.length ? '\r\n' : '');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="testers-pendientes.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
