import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from '../../../lib/session';

export async function POST(request) {
  const formData = await request.formData();
  const password = formData.get('password');

  if (!password || password !== process.env.ADMIN_PANEL_PASSWORD) {
    const url = new URL('/login?error=1', request.url);
    return NextResponse.redirect(url, { status: 303 });
  }

  const token = await createSessionToken(process.env.ADMIN_SESSION_SECRET);
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
