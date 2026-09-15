export const isPositiveDecimalAmount = (value: unknown): boolean => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("-")) {
    return false;
  }

  try {
    return BigInt(trimmed) > 0n;
  } catch {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0;
  }
};

export const sanitizeAmountInput = (value: string) => {
  const numeric = value.replace(/\$/g, "").replace(/[^0-9.]/g, "");
  const [whole, ...fractionParts] = numeric.split(".");
  return fractionParts.length > 0
    ? `${whole}.${fractionParts.join("")}`
    : whole;
};
