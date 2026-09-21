const parseBooleanEnv = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  if (normalized === "true" || normalized === "1" || normalized === "on") {
    return true;
  }

  return null;
};

export const isKyberEnabled = () =>
  parseBooleanEnv(process.env.KYBERSWAP_ENABLED) ??
  parseBooleanEnv(process.env.NEXT_PUBLIC_KYBERSWAP_ENABLED) ??
  true;
