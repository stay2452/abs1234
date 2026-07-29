import { NextResponse } from "next/server";

/**
 * CORS para a extensão Chrome/Edge (MV3) falar com o app local.
 * Só libera chrome-extension / moz-extension / localhost do app.
 */
export function isExtensionOrigin(origin: string | null) {
  if (!origin || origin === "null") {
    return true;
  }
  return (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://") ||
    origin === "http://127.0.0.1:3000" ||
    origin === "http://localhost:3000"
  );
}

export function corsHeaders(origin: string | null): HeadersInit {
  const allowed = isExtensionOrigin(origin) ? origin || "*" : "http://127.0.0.1:3000";
  return {
    "Access-Control-Allow-Origin": allowed === "null" ? "*" : allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function withCors(response: NextResponse, origin: string | null) {
  const headers = corsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export function optionsCors(origin: string | null) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
