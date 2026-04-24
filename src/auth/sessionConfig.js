/**
 * Cookie de sesión del portal de facturación (distinta de contabilidad).
 */
export function getSessionMiddleware(Session) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET debe definirse en .env con al menos 32 caracteres (p. ej. npm run gen:session-secret en IntimoAccounting)."
    );
  }

  const isProd = process.env.NODE_ENV === "production";

  return Session({
    name: "intimo.inv.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    },
  });
}
