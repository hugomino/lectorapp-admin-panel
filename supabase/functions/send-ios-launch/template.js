// Correo "¡LectorApp ya está en iPhone!" (HTML compatible con Gmail, Outlook y Apple Mail + versión de texto).
// Sin dependencias: se usa desde la función de Supabase (Deno).

const BLUE = "#3478f6";
const INK = "#1b2236";
const SOFT = "#414963";
const MUTE = "#6b7288";

const COPY = {
  es: {
    subject: "¡LectorApp ya está disponible en iPhone!",
    preheader: "Te apuntaste para que te avisara. Ya puedes descargarla en la App Store.",
    title: "¡LectorApp ya está en iPhone!",
    intro: "Te apuntaste en lectorapp.es para que te avisara cuando saliera en iOS. Ya está disponible y puedes descargarla en la App Store.",
    button: "Descargar en la App Store",
    thanks: "Gracias por la paciencia,",
    role: "Creador de LectorApp",
    noreply: "Este correo se envía desde una dirección que no admite respuestas.",
    contact: "Si necesitas escribirme, usa contacto@lectorapp.es.",
    footer: "Recibes este correo porque pediste que te avisáramos del lanzamiento en iOS en lectorapp.es. Es el único correo que te enviaremos por esto. Si no fuiste tú, ignora este mensaje.",
    privacy: "Política de privacidad",
    privacyPath: "/es/privacy/",
  },
  en: {
    subject: "LectorApp is now available on iPhone!",
    preheader: "You asked to be notified. You can now get it on the App Store.",
    title: "LectorApp is now on iPhone!",
    intro: "You signed up at lectorapp.es to be told when the iOS version was out. It's available now and you can download it from the App Store.",
    button: "Download on the App Store",
    thanks: "Thanks for your patience,",
    role: "Creator of LectorApp",
    noreply: "This email is sent from an address that doesn't accept replies.",
    contact: "If you need to reach me, write to contacto@lectorapp.es.",
    footer: "You're receiving this email because you asked to be notified of the iOS launch at lectorapp.es. It's the only email we'll send you about this. If it wasn't you, just ignore this message.",
    privacy: "Privacy policy",
    privacyPath: "/en/privacy/",
  },
};

const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderLaunch({ lang = "es", appUrl, siteUrl = "https://www.lectorapp.es" }) {
  const c = COPY[lang === "en" ? "en" : "es"];
  const logo = `${siteUrl}/assets/img/email-logo.png`;

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escHtml(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f8ff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f8ff;">${escHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f8ff;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:20px;border:1px solid #e3e8f4;overflow:hidden;">
      <tr><td style="font-size:0;line-height:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="52%" height="8" style="background:${BLUE};font-size:0;line-height:0;">&nbsp;</td>
          <td width="12%" height="8" style="background:#fbbf42;font-size:0;line-height:0;">&nbsp;</td>
          <td width="12%" height="8" style="background:#e7434b;font-size:0;line-height:0;">&nbsp;</td>
          <td width="12%" height="8" style="background:#209d76;font-size:0;line-height:0;">&nbsp;</td>
          <td width="12%" height="8" style="background:#6f4892;font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:30px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle"><img src="${logo}" width="48" height="41" alt="" style="display:block;border:0;width:48px;height:41px;"></td>
          <td valign="middle" style="padding-left:12px;font:700 20px Arial,Helvetica,sans-serif;color:${INK};letter-spacing:-0.3px;">LectorApp</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 0 32px;">
        <h1 style="margin:0;font:500 30px/1.15 Georgia,'Times New Roman',serif;color:${INK};letter-spacing:-0.5px;">${escHtml(c.title)}</h1>
        <p style="margin:14px 0 0 0;font:400 16px/1.55 Arial,Helvetica,sans-serif;color:${SOFT};">${escHtml(c.intro)}</p>
      </td></tr>
      <tr><td align="left" style="padding:26px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="${BLUE}" style="border-radius:999px;background:${BLUE};">
            <a href="${escHtml(appUrl)}" style="display:inline-block;padding:15px 30px;font:700 16px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:999px;">${escHtml(c.button)}</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:28px 32px 30px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e3e8f4;"><tr><td style="padding-top:20px;">
          <p style="margin:0;font:400 15px/1.5 Arial,Helvetica,sans-serif;color:${SOFT};">${escHtml(c.thanks)}</p>
          <p style="margin:10px 0 0 0;font:500 20px Georgia,'Times New Roman',serif;color:${INK};">Hugo Miño</p>
          <p style="margin:2px 0 0 0;font:400 14px Arial,Helvetica,sans-serif;color:${MUTE};">${escHtml(c.role)} · <a href="${siteUrl}" style="color:${BLUE};text-decoration:none;">lectorapp.es</a></p>
        </td></tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr><td style="background:#f5f8ff;border-radius:12px;padding:12px 14px;font:400 13px/1.5 Arial,Helvetica,sans-serif;color:${SOFT};">
          <b>${escHtml(c.noreply)}</b> ${escHtml(c.contact)}
        </td></tr></table>
      </td></tr>
    </table>
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
      <tr><td align="center" style="padding:18px 16px 0 16px;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${MUTE};">
        ${escHtml(c.footer)}<br><a href="${siteUrl}${c.privacyPath}" style="color:${MUTE};text-decoration:underline;">${escHtml(c.privacy)}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    c.title,
    "",
    c.intro,
    "",
    `${c.button}: ${appUrl}`,
    "",
    c.thanks,
    "Hugo Miño",
    `${c.role} · ${siteUrl}`,
    "",
    `${c.noreply} ${c.contact}`,
    "",
    "--",
    c.footer,
  ].join("\n");

  return { subject: c.subject, html, text };
}
