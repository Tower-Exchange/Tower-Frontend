const Q96 = 2n ** 96n;
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

  const absTick = tick < 0 ? -tick : tick;
  let ratio =
    (absTick & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;

  if ((absTick & 0x2) !== 0) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4) !== 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8) !== 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10) !== 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20) !== 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40) !== 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80) !== 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100) !== 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200) !== 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400) !== 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800) !== 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000) !== 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000) !== 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000) !== 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000) !== 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000) !== 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc50n) >> 128n;
  if ((absTick & 0x20000) !== 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000) !== 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000) !== 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) {
    ratio = (2n ** 256n - 1n) / ratio;
  }

  return ratio % (1n << 32n) === 0n ? ratio >> 32n : (ratio >> 32n) + 1n;
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
    const sqrtRatioTargetX96 = params.zeroForOne
      ? sqrtPriceNextX96 < sqrtPriceLimitX96
        ? sqrtPriceLimitX96
        : sqrtPriceNextX96
      : sqrtPriceNextX96 > sqrtPriceLimitX96
        ? sqrtPriceLimitX96
        : sqrtPriceNextX96;

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
