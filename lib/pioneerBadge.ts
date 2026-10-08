export const PIONEER_BADGE_IDS = ["swap-pioneer", "bridge-pioneer"] as const;

export type PioneerBadgeId = (typeof PIONEER_BADGE_IDS)[number];

export type PioneerBadgeStatus = {
  walletAddress: string;
  badgeId: PioneerBadgeId;
  transactionCount: number;
  volumeUsd: number;
  startsAt: string;
  minimumTransactionCount: number;
  minimumVolumeUsd: number;
  isEligible: boolean;
  isClaimed: boolean;
};

export type PioneerBadgeApiResponse = {
  success: boolean;
  message?: string;
  debug?: string;
  badge?: PioneerBadgeStatus;
};

const getPioneerBadgeUrl = (walletAddress: string, badgeId: PioneerBadgeId) =>
  `/api/badges/pioneer?walletAddress=${encodeURIComponent(walletAddress)}&badgeId=${encodeURIComponent(badgeId)}`;

export const fetchPioneerBadgeStatus = async (
  walletAddress: string,
  badgeId: PioneerBadgeId,
) => {
  const response = await fetch(getPioneerBadgeUrl(walletAddress, badgeId), {
    cache: "no-store",
  });
  const result = (await response.json()) as PioneerBadgeApiResponse;

  return { response, result };
};

export const claimPioneerBadge = async (
  walletAddress: string,
  badgeId: PioneerBadgeId,
) => {
  const response = await fetch("/api/badges/pioneer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, badgeId }),
  });
  const result = (await response.json()) as PioneerBadgeApiResponse;

  return { response, result };
};
