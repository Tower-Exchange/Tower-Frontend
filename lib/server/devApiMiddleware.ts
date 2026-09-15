import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, AuthenticatedApiKey } from "./apiKeyAuth";
import { checkApiKeyScope } from "./scopeCheck";
import { enforceRateLimit, buildRateLimitHeaders } from "./rateLimiter";
import {
  recordApiRequestLog,
  recordApiUsage,
  stampApiKeyLastUsed,
} from "./telemetry";

export interface DevApiContext {
  key: AuthenticatedApiKey;
  grantedScopes: string[];
  rateLimitHeaders: Record<string, string>;
}

export type DevApiHandler = (
  request: NextRequest,
  context: DevApiContext
) => Promise<NextResponse>;

export interface DevApiOptions {
  requiredScope?: string | null;
  computeUnits?: number;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

export function handleCorsPreflight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export function withDevApiAuth(
  endpointPath: string,
  options: DevApiOptions,
  handler: DevApiHandler
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now();
    const method = request.method.toUpperCase();

    // Handle OPTIONS preflight
    if (method === "OPTIONS") {
      return handleCorsPreflight();
    }

    // 1. Authenticate API Key
    const authResult = await validateApiKey(request);
    if (!authResult.authenticated || !authResult.key) {
      const responseStatus = authResult.status || 401;
      const responseTimeMs = Date.now() - startTime;

      // Log unattributable or failed auth request
      void recordApiRequestLog({
        endpoint: endpointPath,
        method,
        statusCode: responseStatus,
        responseTimeMs,
        request,
      });

      return NextResponse.json(
        {
          success: false,
          error: authResult.error || "Unauthorized",
          code: "UNAUTHORIZED",
        },
        { status: responseStatus, headers: CORS_HEADERS }
      );
    }

    const key = authResult.key;

    // 2. Authorization (Scope check)
    const requiredScope = options.requiredScope ?? null;
    const scopeResult = await checkApiKeyScope(key.id, requiredScope);
    if (!scopeResult.allowed) {
      const responseStatus = scopeResult.status || 403;
      const responseTimeMs = Date.now() - startTime;

      void recordApiRequestLog({
        apiKeyId: key.id,
        userId: key.userId,
        endpoint: endpointPath,
        method,
        statusCode: responseStatus,
        responseTimeMs,
        request,
      });

      return NextResponse.json(
        {
          success: false,
          error: scopeResult.error || "Forbidden",
          code: "FORBIDDEN",
        },
        { status: responseStatus, headers: CORS_HEADERS }
      );
    }

    // 3. Rate Limiting
    const computeUnits = options.computeUnits ?? 1;
    const rateLimitDecision = await enforceRateLimit({
      userId: key.userId,
      apiKeyId: key.id,
      keyRateLimit: key.rateLimit,
      computeUnits,
    });

    const rateLimitHeaders = buildRateLimitHeaders(rateLimitDecision);

    if (!rateLimitDecision.allowed) {
      const responseStatus = 429;
      const responseTimeMs = Date.now() - startTime;

      void recordApiRequestLog({
        apiKeyId: key.id,
        userId: key.userId,
        endpoint: endpointPath,
        method,
        statusCode: responseStatus,
        responseTimeMs,
        request,
      });

      return NextResponse.json(
        {
          success: false,
          error:
            rateLimitDecision.reason ||
            "Rate limit exceeded. Please slow down.",
          code: "RATE_LIMITED",
        },
        {
          status: responseStatus,
          headers: { ...CORS_HEADERS, ...rateLimitHeaders },
        }
      );
    }

    // 4. Execute Route Handler
    let response: NextResponse;
    try {
      response = await handler(request, {
        key,
        grantedScopes: scopeResult.grantedScopes,
        rateLimitHeaders,
      });
    } catch (err: any) {
      console.error(`Error executing dev API endpoint [${endpointPath}]:`, err);
      response = NextResponse.json(
        {
          success: false,
          error: err.message || "Internal server error",
          code: "INTERNAL_ERROR",
        },
        { status: 500 }
      );
    }

    const responseTimeMs = Date.now() - startTime;
    const statusCode = response.status;

    // Attach CORS & Rate Limit headers
    Object.entries(CORS_HEADERS).forEach(([k, v]) => {
      if (!response.headers.has(k)) response.headers.set(k, v);
    });
    Object.entries(rateLimitHeaders).forEach(([k, v]) => {
      response.headers.set(k, v);
    });

    // 5. Record Telemetry & Stamp Last Used
    await recordApiRequestLog({
      apiKeyId: key.id,
      userId: key.userId,
      endpoint: endpointPath,
      method,
      statusCode,
      responseTimeMs,
      request,
    });

    if (statusCode >= 200 && statusCode < 300) {
      await recordApiUsage({
        apiKeyId: key.id,
        userId: key.userId,
        endpoint: endpointPath,
        method,
        computeUnits,
      });

      void stampApiKeyLastUsed(key.id);
    }

    return response;
  };
}
