export type AtlasAuthStatusResponse = {
  success?: boolean;
  authenticated?: boolean;
  error?: string;
};

export type AtlasAuthConfirmResponse = {
  success?: boolean;
  authenticated?: boolean;
  txHash?: string;
  error?: string;
};

export async function fetchAtlasAuthStatus() {
  const response = await fetch("/api/wallet/atlas-auth", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | AtlasAuthStatusResponse
    | null;

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    throw new Error(
      payload?.error || "Unable to check Atlas authentication right now.",
    );
  }

  return Boolean(payload?.authenticated);
}

export async function confirmAtlasAuthPayment(txHash: string) {
  const response = await fetch("/api/wallet/atlas-auth", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ txHash }),
  });

  const payload = (await response.json().catch(() => null)) as
    | AtlasAuthConfirmResponse
    | null;

  if (!response.ok || !payload?.success || !payload.authenticated) {
    throw new Error(
      payload?.error || "Unable to record Atlas authentication.",
    );
  }

  return payload;
}
