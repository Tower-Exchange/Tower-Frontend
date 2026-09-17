const Q96 = 2n ** 96n;
const Q192 = Q96 * Q96;

export function token1PerToken0FromSqrtPriceX96(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number,
) {
  if (sqrtPriceX96 <= 0n) {
    return 0;
  }

  const precision = 18n;
  const scale = 10n ** precision;
  const priced =
    (sqrtPriceX96 * sqrtPriceX96 * 10n ** BigInt(token0Decimals) * scale) /
    (Q192 * 10n ** BigInt(token1Decimals));

  return Number(priced) / Number(scale);
}

const MIN_TICK = -887272;
const MAX_TICK = 887272;
const MIN_SQRT_RATIO = 4295128739n;
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
const FEE_DENOMINATOR = 1_000_000n;

export const AERO_MIN_SQRT_RATIO = MIN_SQRT_RATIO;
export const AERO_MAX_SQRT_RATIO = MAX_SQRT_RATIO;

const mulDiv = (a: bigint, b: bigint, denominator: bigint) => (a * b) / denominator;

const mulDivRoundingUp = (a: bigint, b: bigint, denominator: bigint) => {
  const product = a * b;
  const result = product / denominator;
  return product % denominator === 0n ? result : result + 1n;
};

const divRoundingUp = (a: bigint, denominator: bigint) => {
  const result = a / denominator;
  return a % denominator === 0n ? result : result + 1n;
};

export function getAmount0Delta(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
  roundUp: boolean,
) {
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }

  const numerator1 = liquidity << 96n;
  const numerator2 = sqrtRatioBX96 - sqrtRatioAX96;

  return roundUp
    ? mulDivRoundingUp(mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96), 1n, sqrtRatioAX96)
    : (numerator1 * numerator2) / sqrtRatioBX96 / sqrtRatioAX96;
}

export function getAmount1Delta(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
  roundUp: boolean,
) {
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }

  return roundUp
    ? mulDivRoundingUp(liquidity, sqrtRatioBX96 - sqrtRatioAX96, Q96)
    : (liquidity * (sqrtRatioBX96 - sqrtRatioAX96)) / Q96;
}

function getNextSqrtPriceFromAmount0RoundingUp(
  sqrtPX96: bigint,
  liquidity: bigint,
  amount: bigint,
  add: boolean,
) {
  if (amount === 0n) {
    return sqrtPX96;
  }

  const numerator1 = liquidity << 96n;

  if (add) {
    const product = amount * sqrtPX96;
    if (product / amount === sqrtPX96) {
      const denominator = numerator1 + product;
      if (denominator >= numerator1) {
        return mulDivRoundingUp(numerator1, sqrtPX96, denominator);
      }
    }

    return divRoundingUp(numerator1, numerator1 / sqrtPX96 + amount);
  }

  const product = amount * sqrtPX96;
  if (product / amount !== sqrtPX96 || numerator1 <= product) {
    throw new Error("Price overflow");
  }

  const denominator = numerator1 - product;
  return mulDivRoundingUp(numerator1, sqrtPX96, denominator);
}

function getNextSqrtPriceFromAmount1RoundingDown(
  sqrtPX96: bigint,
  liquidity: bigint,
  amount: bigint,
  add: boolean,
) {
  if (add) {
    const quotient =
      amount <= 2n ** 160n - 1n
        ? (amount << 96n) / liquidity
        : mulDiv(amount, Q96, liquidity);
    const next = sqrtPX96 + quotient;
    if (next < sqrtPX96) {
      throw new Error("Price overflow");
    }
    return next;
  }

  const quotient = mulDivRoundingUp(amount, Q96, liquidity);
  if (sqrtPX96 <= quotient) {
    throw new Error("Price underflow");
  }
  return sqrtPX96 - quotient;
}

function getNextSqrtPriceFromInput(
  sqrtPX96: bigint,
  liquidity: bigint,
  amountIn: bigint,
  zeroForOne: boolean,
) {
  if (sqrtPX96 === 0n || liquidity === 0n) {
    throw new Error("Invalid price or liquidity");
  }

  return zeroForOne
    ? getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true)
    : getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
}

function computeSwapStep(params: {
  sqrtRatioCurrentX96: bigint;
  sqrtRatioTargetX96: bigint;
  liquidity: bigint;
  amountRemaining: bigint;
  feePips: bigint;
}) {
  const { sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, amountRemaining, feePips } =
    params;
  const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;
  const exactIn = amountRemaining >= 0n;

  let sqrtRatioNextX96: bigint;
  let amountIn: bigint;
  let amountOut: bigint;
  let feeAmount: bigint;

  if (exactIn) {
    const amountRemainingLessFee = mulDiv(
      amountRemaining,
      FEE_DENOMINATOR - feePips,
      FEE_DENOMINATOR,
    );
    amountIn = zeroForOne
      ? getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true)
      : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);

    if (amountRemainingLessFee >= amountIn) {
      sqrtRatioNextX96 = sqrtRatioTargetX96;
    } else {
      sqrtRatioNextX96 = getNextSqrtPriceFromInput(
        sqrtRatioCurrentX96,
        liquidity,
        amountRemainingLessFee,
        zeroForOne,
      );
    }

    const max = sqrtRatioTargetX96 === sqrtRatioNextX96;
    if (zeroForOne) {
      amountIn = max
        ? amountIn
        : getAmount0Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, true);
      amountOut = getAmount1Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, false);
    } else {
      amountIn = max
        ? amountIn
        : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, true);
      amountOut = getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, false);
    }

    if (!max && amountRemainingLessFee > amountIn) {
      feeAmount = amountRemaining - amountIn;
    } else {
      feeAmount = mulDivRoundingUp(amountIn, feePips, FEE_DENOMINATOR - feePips);
    }
  } else {
    throw new Error("Exact output quotes are not supported");
  }

  return { sqrtRatioNextX96, amountIn, amountOut, feeAmount };
}

export function getSqrtRatioAtTick(tick: number) {
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error("Tick out of range");
  }

  if (tick === 0) {
    return Q96;
  }

  // 1.0001^(tick/2) * 2^96. The Uniswap Q128 lookup table is wrong in JS at
  // high ticks (cirBTC is ~66400) and inverts USDC→cirBTC quotes.
  const factor = Math.exp(tick * 0.5 * Math.log(1.0001));
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error("Tick out of range");
  }

  const scale = 1_000_000_000_000_000_000n;
  const factorScaled = BigInt(Math.round(factor * 1e18));
  const sqrtPriceX96 = (Q96 * factorScaled) / scale;

  if (sqrtPriceX96 <= MIN_SQRT_RATIO) {
    return MIN_SQRT_RATIO + 1n;
  }
  if (sqrtPriceX96 >= MAX_SQRT_RATIO) {
    return MAX_SQRT_RATIO - 1n;
  }

  return sqrtPriceX96;
}

function mostSignificantBit(x: bigint) {
  if (x === 0n) {
    throw new Error("MSB of zero");
  }
  return x.toString(2).length - 1;
}

function leastSignificantBit(x: bigint) {
  if (x === 0n) {
    throw new Error("LSB of zero");
  }

  let bit = 0;
  while ((x & (1n << BigInt(bit))) === 0n) {
    bit += 1;
  }
  return bit;
}

const tickWordPosition = (compressed: number) => {
  const wordPos = compressed >> 8;
  const bitPos = compressed & 0xff;
  return { wordPos, bitPos };
};

export function nextInitializedTickWithinOneWord(params: {
  tick: number;
  tickSpacing: number;
  lte: boolean;
  bitmap: bigint;
}) {
  const { tick, tickSpacing, lte, bitmap } = params;
  let compressed = Math.trunc(tick / tickSpacing);
  if (tick < 0 && tick % tickSpacing !== 0) {
    compressed -= 1;
  }

  if (lte) {
    const { bitPos } = tickWordPosition(compressed);
    const mask = (1n << BigInt(bitPos + 1)) - 1n;
    const masked = bitmap & mask;
    const initialized = masked !== 0n;
    const next = initialized
      ? (compressed - (bitPos - mostSignificantBit(masked))) * tickSpacing
      : (compressed - bitPos) * tickSpacing;
    return { next, initialized };
  }

  const { bitPos } = tickWordPosition(compressed + 1);
  const mask = ~((1n << BigInt(bitPos)) - 1n) & ((1n << 256n) - 1n);
  const masked = bitmap & mask;
  const initialized = masked !== 0n;
  const next = initialized
    ? (compressed + 1 + (leastSignificantBit(masked) - bitPos)) * tickSpacing
    : (compressed + 1 + (255 - bitPos)) * tickSpacing;
  return { next, initialized };
}

export type AeroTickReader = (tick: number) => Promise<{
  liquidityNet: bigint;
  initialized: boolean;
}>;

export type AeroBitmapReader = (wordPos: number) => Promise<bigint>;

export async function quoteExactInputOnPool(params: {
  zeroForOne: boolean;
  amountIn: bigint;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  tickSpacing: number;
  feePips: number;
  sqrtPriceLimitX96?: bigint;
  readTick: AeroTickReader;
  readBitmap: AeroBitmapReader;
}) {
  if (params.amountIn <= 0n || params.liquidity <= 0n) {
    return 0n;
  }

  const sqrtPriceLimitX96 =
    params.sqrtPriceLimitX96 ??
    (params.zeroForOne ? MIN_SQRT_RATIO + 1n : MAX_SQRT_RATIO - 1n);

  let amountSpecifiedRemaining = params.amountIn;
  let amountCalculated = 0n;
  let sqrtPriceX96 = params.sqrtPriceX96;
  let tick = params.tick;
  let liquidity = params.liquidity;
  const feePips = BigInt(params.feePips);

  while (amountSpecifiedRemaining !== 0n && sqrtPriceX96 !== sqrtPriceLimitX96) {
    const sqrtPriceStartX96 = sqrtPriceX96;
    let compressed = Math.trunc(tick / params.tickSpacing);
    if (tick < 0 && tick % params.tickSpacing !== 0) {
      compressed -= 1;
    }
    const wordPos = params.zeroForOne
      ? tickWordPosition(compressed).wordPos
      : tickWordPosition(compressed + 1).wordPos;
    const bitmap = await params.readBitmap(wordPos);
    let { next: tickNext, initialized } = nextInitializedTickWithinOneWord({
      tick,
      tickSpacing: params.tickSpacing,
      lte: params.zeroForOne,
      bitmap,
    });

    if (tickNext < MIN_TICK) {
      tickNext = MIN_TICK;
    } else if (tickNext > MAX_TICK) {
      tickNext = MAX_TICK;
    }

    const sqrtPriceNextX96 = getSqrtRatioAtTick(tickNext);
    // Never quote in the opposite direction of the swap. A bad tick→price
    // conversion previously made USDC→cirBTC look like selling cirBTC.
    const sqrtPriceNextOnPath = params.zeroForOne
      ? sqrtPriceNextX96 < sqrtPriceX96
        ? sqrtPriceNextX96
        : sqrtPriceLimitX96
      : sqrtPriceNextX96 > sqrtPriceX96
        ? sqrtPriceNextX96
        : sqrtPriceLimitX96;
    const sqrtRatioTargetX96 = params.zeroForOne
      ? sqrtPriceNextOnPath < sqrtPriceLimitX96
        ? sqrtPriceLimitX96
        : sqrtPriceNextOnPath
      : sqrtPriceNextOnPath > sqrtPriceLimitX96
        ? sqrtPriceLimitX96
        : sqrtPriceNextOnPath;

    const step = computeSwapStep({
      sqrtRatioCurrentX96: sqrtPriceX96,
      sqrtRatioTargetX96,
      liquidity,
      amountRemaining: amountSpecifiedRemaining,
      feePips,
    });

    sqrtPriceX96 = step.sqrtRatioNextX96;
    amountSpecifiedRemaining -= step.amountIn + step.feeAmount;
    amountCalculated -= step.amountOut;

    if (sqrtPriceX96 === sqrtPriceNextX96) {
      if (initialized) {
        const tickInfo = await params.readTick(tickNext);
        let liquidityNet = tickInfo.liquidityNet;
        if (params.zeroForOne) {
          liquidityNet = -liquidityNet;
        }
        liquidity += liquidityNet;
        if (liquidity < 0n) {
          throw new Error("Liquidity underflow");
        }
      }
      tick = params.zeroForOne ? tickNext - 1 : tickNext;
    } else if (sqrtPriceX96 !== sqrtPriceStartX96) {
      tick = nearestTickAtPrice(sqrtPriceX96, params.tickSpacing);
    }
  }

  return -amountCalculated;
}

function nearestTickAtPrice(sqrtPriceX96: bigint, tickSpacing: number) {
  let low = MIN_TICK;
  let high = MAX_TICK;

  while (low <= high) {
    const mid = Math.trunc((low + high) / 2);
    const midPrice = getSqrtRatioAtTick(mid);
    if (midPrice === sqrtPriceX96) {
      return mid;
    }
    if (midPrice < sqrtPriceX96) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const tick = high;
  const compressed = Math.trunc(tick / tickSpacing);
  return compressed * tickSpacing;
}
