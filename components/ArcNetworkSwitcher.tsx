"use client";

import Image from "next/image";

type ArcNetworkSwitcherProps = {
  compact?: boolean;
};

export default function ArcNetworkSwitcher({
  compact = false,
}: ArcNetworkSwitcherProps) {
  const currentLabel ="Arc";

  return (
    <div className="relative">
      <div
        className={`flex items-center rounded-lg bg-secondary ${
          compact ? "gap-2 px-3 py-2" : "gap-2 px-4 py-2"
        }`}
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/30">
          <Image
            src="/assets/ARCSvg.svg"
            alt=""
            width={40}
            height={40}
            className="object-contain"
          />
        </div>
        <span
          className={`font-medium text-foreground ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {currentLabel}
        </span>
      </div>
    </div>
  );
}

