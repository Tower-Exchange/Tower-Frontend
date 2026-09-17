"use client";

import { useEffect, useRef } from "react";
import Image, { type StaticImageData } from "next/image";
import { motion } from "framer-motion";
import { ChevronDown, Info } from "lucide-react";
import { formatUnits } from "viem";

import { formatUsdAmount } from "@/lib/formatUsdAmount";
import quotesIcon from "@/public/assets/quotes icon.svg";
import synthraLogo from "@/public/assets/synthralogo.svg";
import towerLogo from "@/public/assets/Tower Logo.svg";
import unitflowLogo from "@/public/assets/unitflow.svg";
import xylonetLogo from "@/public/assets/xylonetlogo.svg";
import aeroLogo from "@/public/assets/aero-icon 1.svg";
import routeIcon from "@/public/assets/route icon.svg";

interface RouteOption {
  dexId: string;
  dexName: string;
  outputAmount: string;
  routeType: string;
  isFallback?: boolean;
}

interface RouterDisplayProps {
  selectedRouterId?: string;
  routeOptions?: RouteOption[];
  inputUsdValue?: number;
  outputTokenUsdPrice?: number;
  outputTokenSymbol?: string;
  availableRouterIds?: string[];
}

type SupportedRouter = {
  id: "xylonet-adapter" | "synthra" | "unitflow" | "tower-dex" | "aero";
  aliases: string[];
  name: string;
  logo: StaticImageData | string;
};

const SUPPORTED_ROUTERS: SupportedRouter[] = [
  {
    id: "xylonet-adapter",
    aliases: ["xylonet", "xylonet-adapter"],
    name: "XyloNet",
    logo: xylonetLogo,
  },
  {
    id: "synthra",
    aliases: ["synthra", "synthra-v3"],
    name: "Synthra",
    logo: synthraLogo,
  },
  {
    id: "unitflow",
    aliases: ["unitflow", "unitflow-v3", "unitflow-finance"],
    name: "UnitFlow",
    logo: unitflowLogo,
  },
  {
    id: "tower-dex",
    aliases: ["tower-dex", "tower-amm", "tower"],
    name: "Tower",
    logo: towerLogo,
  },
  {
    id: "aero",
    aliases: ["aero", "aerodrome", "aero-cl", "aero-slipstream", "slipstream"],
    name: "Aero",
    logo: aeroLogo,
  },
];

const ROUTE_OUTPUT_DISPLAY_DECIMALS: Record<string, number> = {
  USDC: 2,
  EURC: 2,
  USDT: 2,
  cirBTC: 8,
  cNGN: 2,
  QCAD: 2,
};

const getRouteOutputDisplayDecimals = (symbol?: string) =>
  symbol ? (ROUTE_OUTPUT_DISPLAY_DECIMALS[symbol] ?? 6) : 6;

const normalizeRouterId = (id = "") => {
  const normalizedId = id.toLowerCase();

  return (
    SUPPORTED_ROUTERS.find((router) => router.aliases.includes(normalizedId))
      ?.id || normalizedId
  );
};

const outputAmountToBigInt = (amount?: string) => {
  try {
    return BigInt(amount || "0");
  } catch {
    return 0n;
  }
};

const routeTokenAmountFromOutput = (amount?: string) => {
  const rawAmount = outputAmountToBigInt(amount);

  if (rawAmount <= 0n) {
    return null;
  }

  const tokenAmount = Number.parseFloat(formatUnits(rawAmount, 18));
  return Number.isFinite(tokenAmount) ? tokenAmount : null;
};

const formatRouteTokenAmount = (amount?: string, outputTokenSymbol?: string) => {
  const tokenAmount = routeTokenAmountFromOutput(amount);

  if (tokenAmount === null) {
    return "-";
  }

  return tokenAmount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: getRouteOutputDisplayDecimals(outputTokenSymbol),
  });
};

const getRouteUsdValue = (amount?: string, outputTokenUsdPrice?: number) => {
  const tokenAmount = routeTokenAmountFromOutput(amount);

  if (tokenAmount === null) {
    return null;
  }

  if (typeof outputTokenUsdPrice !== "number" || outputTokenUsdPrice <= 0) {
    return null;
  }

  const usdValue = tokenAmount * outputTokenUsdPrice;
  return Number.isFinite(usdValue) && usdValue > 0 ? usdValue : null;
};

const formatRouteUsdValue = (usdValue: number | null) =>
  usdValue === null ? null : formatUsdAmount(usdValue, 1);

const formatRouteAddedValue = (
  routeUsdValue: number | null,
  inputUsdValue?: number,
) => {
  if (
    routeUsdValue === null ||
    typeof inputUsdValue !== "number" ||
    !Number.isFinite(inputUsdValue) ||
    inputUsdValue <= 0
  ) {
    return null;
  }

  const addedValue = routeUsdValue - inputUsdValue;

  if (!Number.isFinite(addedValue) || addedValue <= 0) {
    return null;
  }

  return `+${formatUsdAmount(addedValue, 1)}`;
};

export default function RouterDisplay({
  selectedRouterId,
  routeOptions = [],
  inputUsdValue,
  outputTokenUsdPrice,
  outputTokenSymbol,
  availableRouterIds = [],
}: RouterDisplayProps) {
  const routesDetailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (
        routesDetailsRef.current &&
        routesDetailsRef.current.hasAttribute("open") &&
        !routesDetailsRef.current.contains(event.target as Node)
      ) {
        routesDetailsRef.current.removeAttribute("open");
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, []);

  const routeOptionByDexId = routeOptions.reduce((optionsByDexId, option) => {
    const dexId = normalizeRouterId(option.dexId);
    const existingOption = optionsByDexId.get(dexId);

    if (
      !existingOption ||
      outputAmountToBigInt(option.outputAmount) >
        outputAmountToBigInt(existingOption.outputAmount)
    ) {
      optionsByDexId.set(dexId, option);
    }

    return optionsByDexId;
  }, new Map<string, RouteOption>());

  const normalizedAvailableRouterIds = Array.from(
    new Set(availableRouterIds.map((routerId) => normalizeRouterId(routerId))),
  );
  const availableRouterIdSet = new Set(normalizedAvailableRouterIds);
  const routeIdsFromOptions = Array.from(routeOptionByDexId.keys());
  const routerCandidates = [
    ...SUPPORTED_ROUTERS.filter((router) =>
      availableRouterIdSet.size === 0
        ? routeIdsFromOptions.includes(router.id)
        : availableRouterIdSet.has(router.id),
    ),
    ...routeIdsFromOptions
      .filter((routeId) => !SUPPORTED_ROUTERS.some((router) => router.id === routeId))
      .map((routeId) => ({
        id: routeId,
        aliases: [routeId],
        name: routeId,
        logo: towerLogo,
      })),
  ];
  const routersToDisplay = routerCandidates.map((router, index) => ({ router, index }));

  const allQuotedRoutes = routersToDisplay
    .map(({ router, index }) => {
      const option = routeOptionByDexId.get(router.id) ?? null;
      const outputAmount = outputAmountToBigInt(option?.outputAmount);

      return {
        router: {
          ...router,
          id: router.id,
          name: router.name,
          logo: router.logo,
        },
        option,
        outputAmount,
        hasQuote: outputAmount > 0n,
        index,
      };
    })
    .filter((route) => route.option !== null && route.hasQuote)
    .sort((leftRoute, rightRoute) => {
      if (leftRoute.hasQuote && rightRoute.hasQuote) {
        if (leftRoute.outputAmount === rightRoute.outputAmount) {
          const leftFallback = leftRoute.option?.isFallback === true;
          const rightFallback = rightRoute.option?.isFallback === true;
          if (leftFallback !== rightFallback) {
            return leftFallback ? 1 : -1;
          }
          return leftRoute.index - rightRoute.index;
        }

        return leftRoute.outputAmount > rightRoute.outputAmount ? -1 : 1;
      }

      if (leftRoute.hasQuote !== rightRoute.hasQuote) {
        return leftRoute.hasQuote ? -1 : 1;
      }

      return leftRoute.index - rightRoute.index;
    });

  if (allQuotedRoutes.length === 0) {
    return null;
  }

  const displayedRoutes = allQuotedRoutes.slice(0, 3);
  const bestQuotedRoute = allQuotedRoutes[0] ?? null;
  const bestOutputAmount = bestQuotedRoute?.outputAmount ?? 0n;
  const bestPriceRouterId = bestQuotedRoute?.router.id;
  const normalizedSelectedRouterId = selectedRouterId
    ? normalizeRouterId(selectedRouterId)
    : undefined;
  const dexCount = allQuotedRoutes.length;
  const primaryDexName = allQuotedRoutes[0]?.router.name || "Router";
  const otherDexNames = allQuotedRoutes.slice(1).map(({ router }) => router.name);
  const dexNamesLabel = otherDexNames.length
    ? `${primaryDexName} and ${otherDexNames.length} other${
        otherDexNames.length === 1 ? "" : "s"
      }`
    : primaryDexName;

  return (
    <section className="relative w-full overflow-visible rounded-2xl border border-border bg-card shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
      <div className="flex flex-nowrap items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Image
            src={quotesIcon}
            alt=""
            width={16}
            height={16}
            aria-hidden
            className="h-4 w-4 shrink-0 object-contain"
          />
          <span className="text-sm font-semibold text-foreground">Quotes</span>
        </div>
        <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
            <span
              className="inline-flex h-[18px] min-w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-muted px-1 text-foreground"
              aria-label={`${dexCount} DEX routes available`}
            >
              <span className="flex items-center justify-center gap-0.5 text-[9px] font-bold leading-none">
                <span>{dexCount}</span>
                <Image
                  src={routeIcon}
                  alt=""
                  width={7}
                  height={7}
                  className="h-[7px] w-[7px] shrink-0 object-contain"
                />
              </span>
            </span>
            {otherDexNames.length > 0 ? (
              <details ref={routesDetailsRef} className="group/routes relative min-w-0">
                <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground outline-none [&::-webkit-details-marker]:hidden">
                  <span className="text-[9px] font-normal leading-none text-muted-foreground/80">
                    Via
                  </span>
                  <span className="truncate text-white">{dexNamesLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-open/routes:rotate-180" />
                </summary>
                <div className="absolute right-0 top-full z-50 mt-2 min-w-36 rounded-lg border border-border bg-popover px-2 py-1.5 text-[11px] text-muted-foreground shadow-[0_16px_32px_rgba(0,0,0,0.45)]">
                  {otherDexNames.map((name) => (
                    <div key={name} className="whitespace-nowrap px-2 py-1">
                      {name}
                    </div>
                  ))}
                </div>
              </details>
            ) : (
              <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground">
                <span className="text-[9px] font-normal leading-none text-muted-foreground/80">
                  Via
                </span>
                <span className="truncate">{dexNamesLabel}</span>
              </span>
            )}
          </div>
          <span className="group relative flex h-4 w-4 shrink-0 items-center justify-center">
            <Info
              className="h-3.5 w-3.5 text-muted-foreground outline-none"
              tabIndex={0}
              aria-describedby="router-quotes-info"
            />
            <span
              id="router-quotes-info"
              role="tooltip"
              className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border border-border bg-popover px-3 py-2 text-left text-[11px] font-normal leading-4 text-muted-foreground opacity-0 shadow-[0_16px_32px_rgba(0,0,0,0.45)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              Quotes from major routers on Tower are simulated on the same block
              to find the best executable prices.
            </span>
          </span>
        </div>
      </div>

      <div className="space-y-1 p-1.5">
        {displayedRoutes.map(({ router, option, outputAmount, hasQuote }) => {
          const isBestPrice =
            hasQuote &&
            outputAmount > 0n &&
            outputAmount === bestOutputAmount &&
            router.id === bestPriceRouterId;
          const isSelected =
            normalizedSelectedRouterId === router.id ||
            (!normalizedSelectedRouterId && isBestPrice);
          const routeUsdAmount = hasQuote
            ? getRouteUsdValue(option?.outputAmount, outputTokenUsdPrice)
            : null;
          const routeUsdValue = formatRouteUsdValue(routeUsdAmount);
          const routeAddedValue = formatRouteAddedValue(
            routeUsdAmount,
            inputUsdValue,
          );

          return (
            <motion.div
              key={router.id}
              role="listitem"
              className={`flex min-h-[52px] w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-left transition-colors sm:gap-3 sm:px-3 ${
                isSelected
                  ? `
    border border-primary/40
    bg-accent
    shadow-[inset_0_1px_0_rgba(255,255,255,.06),inset_0_-1px_0_rgba(0,0,0,.45),0_2px_6px_rgba(0,0,0,.35)]
  `
                  : "border border-transparent"
              }`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
                <Image
                  src={router.logo}
                  alt={`${router.name} logo`}
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] shrink-0 object-contain"
                />
                <span className="min-w-[3.4rem] truncate text-sm font-medium text-foreground sm:min-w-0">
                  {router.name}
                </span>
                {isBestPrice && (
                  <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium leading-none text-primary">
                    Best Price
                  </span>
                )}
              </span>
              <span className="flex min-w-[7.4rem] shrink-0 flex-col items-end text-right leading-tight sm:min-w-[168px]">
                <span className="flex w-full min-w-0 items-center justify-end gap-1.5 sm:gap-2">
                  {isBestPrice && routeAddedValue ? (
                    <span className="whitespace-nowrap text-[10px] font-normal tabular-nums leading-none text-[#07D54F]">
                      {routeAddedValue}
                    </span>
                  ) : null}
                  <span
                    className={`text-sm tabular-nums ${
                      hasQuote ? "text-foreground" : "text-muted-foreground/80"
                    }`}
                  >
                    {formatRouteTokenAmount(option?.outputAmount, outputTokenSymbol)}
                  </span>
                </span>
                {routeUsdValue ? (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    ~ {routeUsdValue}
                  </span>
                ) : null}
              </span>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}