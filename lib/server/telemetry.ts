import { getTrustedClientIp } from "@/lib/server/clientIp";
import { supabaseAdmin } from "./devApiSupabase";

export interface LogRequestParams {
  apiKeyId?: string | null;
  userId?: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  request?: Request;
}

export interface RecordUsageParams {
  apiKeyId: string;
  userId: string;
  endpoint: string;
  method: string;
  computeUnits?: number;
}

function extractIpAddress(request?: Request): string | null {
  if (!request) return null;
  const ip = getTrustedClientIp(request.headers, "");
  return ip || null;
}

function extractUserAgent(request?: Request): string | null {
  if (!request) return null;
  return request.headers.get("user-agent") || null;
}

export async function recordApiRequestLog(params: LogRequestParams): Promise<void> {
  try {
    const ipAddress = extractIpAddress(params.request);
    const userAgent = extractUserAgent(params.request);

    await supabaseAdmin.from("api_request_logs").insert({
      api_key_id: params.apiKeyId || null,
      user_id: params.userId || null,
      endpoint: params.endpoint,
      method: params.method,
      status_code: params.statusCode,
      response_time_ms: Math.max(0, Math.round(params.responseTimeMs)),
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (err: any) {
    console.error("Failed to write api_request_logs:", err?.message || err);
  }
}

export async function recordApiUsage(params: RecordUsageParams): Promise<void> {
  try {
    await supabaseAdmin.from("api_usage").insert({
      user_id: params.userId,
      api_key_id: params.apiKeyId,
      endpoint: params.endpoint,
      method: params.method,
      requests_count: 1,
      compute_units: params.computeUnits || 1,
    });
  } catch (err: any) {
    console.error("Failed to write api_usage:", err?.message || err);
  }
}

export async function stampApiKeyLastUsed(apiKeyId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKeyId);
  } catch (err: any) {
    console.error("Failed to update api_keys.last_used_at:", err?.message || err);
  }
}
