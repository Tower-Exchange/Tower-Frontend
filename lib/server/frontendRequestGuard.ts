import { NextRequest, NextResponse } from "next/server";

const FORBIDDEN = NextResponse.json({ error: "Forbidden" }, { status: 403 });

const DEFAULT_FRONTEND_HOSTS = new Set([
  "tower.exchange",
  "www.tower.exchange",
  "app.tower.exchange",
]);

const stripWww = (host: string) => host.replace(/^www\./, "");

const hostFromUrl = (value: string) => {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
};

const getRequestHost = (request: NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-host");
  const hostHeader =
    forwarded || request.headers.get("host") || request.nextUrl.host;
  return hostHeader.split(",")[0]?.trim().toLowerCase() || "";
};

const extraAllowedOriginHosts = () => {
  const extra = [
    process.env.TOWER_AI_ALLOWED_ORIGINS,
    process.env.TOWER_ALLOWED_ORIGINS,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(",");

  return extra
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => hostFromUrl(origin) || origin.toLowerCase())
    .filter(Boolean);
};

const isKnownFrontendHost = (host: string) => {
  if (!host) {
    return false;
  }

  if (
    DEFAULT_FRONTEND_HOSTS.has(host) ||
    DEFAULT_FRONTEND_HOSTS.has(stripWww(host))
  ) {
    return true;
  }

  for (const extraHost of extraAllowedOriginHosts()) {
    if (extraHost === host || stripWww(extraHost) === stripWww(host)) {
      return true;
    }
  }

  return false;
};

const hostsMatch = (left: string, right: string) =>
  Boolean(left && right && stripWww(left) === stripWww(right));

/**
 * True for browser calls from the Tower app (same-origin fetch, or Origin /
 * Referer on a known frontend host). Terminal curl and other sites fail.
 *
 * On Vercel, `request.nextUrl.origin` is often the *.vercel.app host while
 * the browser Origin is tower.exchange — never require those to be equal.
 */
export const isFrontendBrowserRequest = (request: NextRequest) => {
  const secFetchSite = (
    request.headers.get("sec-fetch-site") || ""
  ).toLowerCase();

  if (secFetchSite === "same-origin") {
    return true;
  }

  const requestHost = getRequestHost(request);
  const originHost = request.headers.get("origin")
    ? hostFromUrl(request.headers.get("origin") || "")
    : null;
  const refererHost = request.headers.get("referer")
    ? hostFromUrl(request.headers.get("referer") || "")
    : null;

  if (
    originHost &&
    (hostsMatch(originHost, requestHost) || isKnownFrontendHost(originHost))
  ) {
    return true;
  }

  if (
    !originHost &&
    refererHost &&
    (hostsMatch(refererHost, requestHost) || isKnownFrontendHost(refererHost))
  ) {
    return true;
  }

  return false;
};

export const rejectNonFrontendRequest = (request: NextRequest) => {
  if (isFrontendBrowserRequest(request)) {
    return null;
  }

  return FORBIDDEN;
};

export const withFrontendOriginGate = <
  TArgs extends unknown[],
  TResult extends Response | Promise<Response>,
>(
  handler: (request: NextRequest, ...args: TArgs) => TResult,
) => {
  return (request: NextRequest, ...args: TArgs) => {
    const blocked = rejectNonFrontendRequest(request);
    if (blocked) {
      return blocked;
    }

    return handler(request, ...args);
  };
};
