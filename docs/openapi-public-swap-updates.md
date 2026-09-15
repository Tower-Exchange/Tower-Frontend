# OpenAPI updates: public swap API (self-custody wallets)

Hand-off for [docs.tower.exchange](https://docs.tower.exchange) / `openapi.json`.

These changes are **already live in the Tower-Finance public API**. This file is only the documentation work: additive fields on `POST /api/public/swap/quote` and `POST /api/public/swap/build-tx`, plus a machine-readable `code` on errors.

Suggested spec version: `1.0.0` → `1.1.0`.

## Why this update

Self-custody wallets call Tower from a backend, then pass **unsigned** approval + swap txs to the device. Keys never leave the phone. The current spec made that integration harder in four places:

1. Amount units were mixed. `GET /api/public/tokens` lists EURC as **6 decimals**, but quote examples labelled `outputAmount: "92450000000000000000"` as “18-decimal normalized” without a token-decimal field to format from.
2. Overview §6 documented `QUOTE_EXPIRED` and a 60s window, but the quote object had no `expiresAt` / `validForSeconds`.
3. `approval` only had `to` / `data`. Wallets that inspect the allowance target before signing need explicit `spender` + `amountRaw`.
4. Errors were prose in `error` only. Wallets map codes to their own copy and must not show provider text to users.

The API now covers all four. Internal `/api/swap/*` (Tower UI) is unchanged.

## Compatibility

- Additive JSON fields only. Existing clients that ignore unknown properties keep working.
- Do **not** change the meaning of legacy quote fields `inputAmount`, `outputAmount`, `minOut`, `swapInputAmount`, `platformFeeAmount`. They stay 18-decimal normalized.
- Do **not** change `GET /api/public/tokens` `decimals` (EURC = 6, USDC = 6, cirBTC = 8, etc.).
- Tell integrators: **echo the quote object from `/quote` into `/build-tx` unchanged.** Do not rebuild a subset (the current cURL example does this and will miss `expiresAt`).

---

## 1. Amount units (fix the EURC confusion)

Document two scales clearly. The current Overview “Expected Response Shape” is internally inconsistent: it shows quote `inputAmount` as token-decimal (`100000000` for 100 USDC) and `outputAmount` as 1e18 (`92450000000000000000` for 92.45 EURC).

### Request (`POST /api/public/swap/quote`)

| Field | Unit | Example (100 USDC → EURC) |
| --- | --- | --- |
| `inputAmount` | Token decimals from `/tokens` | `"100000000"` (100 USDC, 6 decimals) |

`requestAmountUnit` on the quote response is always `"token_decimals"` and refers to this **request** field.

### Response quote amounts

| Field | Unit | Use for |
| --- | --- | --- |
| `inputAmount`, `swapInputAmount`, `outputAmount`, `minOut`, `platformFeeAmount` | 18-decimal normalized (`amountScale: "normalized_1e18"`) | Legacy / Tower UI |
| `inputAmountRaw`, `swapInputAmountRaw`, `outputAmountRaw`, `minOutRaw`, `platformFeeAmountRaw` | Token decimals (`inputTokenDecimals` / `outputTokenDecimals`) | Wallet display, signing checks, `parseUnits` / `formatUnits` |
| `inputAmountNative`, `outputAmountNative`, `minOutNative`, … | Same as `*Raw` when present | On-chain build path |

**Guidance for wallets:** format display from `*Raw` + `/tokens.decimals` (or `inputTokenDecimals` / `outputTokenDecimals`). Do not treat `outputAmount` as EURC-6 raw.

Worked example, 100 USDC → 92.45 EURC, 50 bps slippage, 25 bps protocol fee:

| Field | Value | Meaning |
| --- | --- | --- |
| Request `inputAmount` | `"100000000"` | 100 USDC @ 6 decimals |
| `inputAmount` (legacy) | `"100000000000000000000"` | 100 × 10^18 |
| `inputAmountRaw` | `"100000000"` | 100 USDC @ 6 decimals |
| `outputAmount` (legacy) | `"92450000000000000000"` | 92.45 × 10^18 |
| `outputAmountRaw` | `"92450000"` | 92.45 EURC @ 6 decimals |
| `minOut` (legacy) | `"91987750000000000000"` | 91.98775 × 10^18 |
| `minOutRaw` | `"91987750"` | 91.98775 EURC @ 6 decimals |
| `platformFeeAmount` (legacy) | `"250000000000000000"` | 0.25 × 10^18 |
| `platformFeeAmountRaw` | `"250000"` | 0.25 USDC @ 6 decimals |
| `inputTokenDecimals` | `6` | USDC |
| `outputTokenDecimals` | `6` | EURC |
| `amountScale` | `"normalized_1e18"` | Legacy amount fields |
| `requestAmountUnit` | `"token_decimals"` | Request `inputAmount` |

Replace the Overview and `POST /swap/quote` examples that currently say `inputAmount: "100000000"` **on the quote response**. That value belongs on `inputAmountRaw` (and on the request), not on response `inputAmount`.

Also fix `platformFeeAmount: "250000000000000"` in the current spec. 25 bps of 100 USDC is `0.25`, which is `"250000000000000000"` at 1e18 or `"250000"` at 6 decimals.

---

## 2. Quote lifetime

Add to every public quote (including nested `routeOptions[].quote`):

| Field | Type | Notes |
| --- | --- | --- |
| `quotedAt` | string (ISO-8601) | Server time when the quote was produced |
| `expiresAt` | string (ISO-8601) | `quotedAt + validForSeconds` |
| `validForSeconds` | integer | Default **120**, clamp 5–600 (`SWAP_QUOTE_TTL_SECONDS`) |

`POST /api/public/swap/build-tx` rejects an expired quote with HTTP 400:

```json
{
  "success": false,
  "error": "Quote expired. Request a new quote before building the transaction.",
  "code": "QUOTE_EXPIRED"
}
```

Update Overview §6: it currently says retry after 60 seconds. Change that to **120 seconds** (or “use `expiresAt` / `validForSeconds` from the quote”).

Call out for self-custody wallets: start the signing UI only while `Date.now() < Date.parse(quote.expiresAt)`. If the user is slow, fetch a new quote before `build-tx`.

Expiry is enforced from the `expiresAt` on the quote object the client sends back. That is why the full quote must be echoed, not rebuilt.

---

## 3. Approval `token` / `spender` / `amountRaw`

`data.approval` remains `object | object[] | null`. When non-null, add:

| Field | Type | Source |
| --- | --- | --- |
| `token` | string (checksum address) | ERC-20 being approved. For a normal `approve`, this is `to`. For Permit2 `approve`, this is the token argument in calldata (not the Permit2 contract). |
| `spender` | string (checksum address) | Allowance target decoded from calldata |
| `amountRaw` | string (decimal integer) | Approve amount decoded from calldata |

These fields are derived from `data` (ERC-20 `approve(address,uint256)` or Permit2 `approve(address,address,uint160,uint48)`). Wallets should still verify calldata; JSON is a convenience for the pre-sign allowance-target check.

`amountRaw` is often `maxUint256` (`115792089237316195423570985008687907853269984665640564039457584007913129639935`) for ERC-20 infinite approve. Document that. Do not keep the current example amount `0x…0005f5e100` (100000000) if the live payload is max approval.

Keep existing fields: `to`, `data`, `from`, `gasLimit`, optional `value` / `label`.

---

## 4. Machine error `code`

Every failed public swap (and auth/rate-limit) JSON body should include `code` next to `error`.

```json
{
  "success": false,
  "error": "No valid route found",
  "code": "NO_ROUTE_FOUND"
}
```

Wallets must key off `code`, never show `error` to end users.

### Codes to document (actual API)

| `code` | Typical HTTP | When |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | Missing/invalid JSON or required fields |
| `UNSUPPORTED_TOKEN` | 400 | Token symbol/address not supported |
| `NO_ROUTE_FOUND` | 400 | No valid route / insufficient liquidity |
| `QUOTE_EXPIRED` | 400 | `expiresAt` has passed on `build-tx` |
| `SWAPS_DISABLED` | 503 | Swap engine paused |
| `BUILD_TX_FAILED` | 500 | Transaction construction failed |
| `UNAUTHORIZED` | 401 | Missing/invalid API key |
| `FORBIDDEN` | 403 | Missing `swaps` scope |
| `RATE_LIMITED` | 429 | Rate limit |
| `METHOD_NOT_ALLOWED` | 405 | Wrong HTTP method |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Align Overview §6 with the API

The current Overview lists names that **do not match** the live `code` field. Update or add a mapping:

| Spec today (Overview) | Live `code` | Notes |
| --- | --- | --- |
| `INVALID_API_KEY` | `UNAUTHORIZED` | Rename in docs |
| `INSUFFICIENT_LIQUIDITY` | `NO_ROUTE_FOUND` | Same condition; API uses this code. HTTP is **400**, not 404 |
| `INVALID_TOKEN` | `UNSUPPORTED_TOKEN` | Rename in docs |
| `RATE_LIMIT_EXCEEDED` | `RATE_LIMITED` | Rename in docs |
| `QUOTE_EXPIRED` | `QUOTE_EXPIRED` | Keep; now actually returned by `build-tx` |
| `SLIPPAGE_EXCEEDED` | — | Not returned by quote/build-tx. Slippage is enforced on-chain via `minOut` |
| `UNSUPPORTED_CHAIN` | — | RPC/bridge only, not swap quote |
| `WALLET_NOT_FOUND` | — | Not used by swap quote/build-tx |

Add `SWAPS_DISABLED` (503) and `METHOD_NOT_ALLOWED` (405) to the swap operations.

---

## OpenAPI schema patches

### `components.schemas.ErrorResponse`

Add required `code`:

```yaml
ErrorResponse:
  type: object
  required: [success, error, code]
  properties:
    success:
      type: boolean
      example: false
    error:
      type: string
      description: Human-readable message. Do not display to end users; map `code` instead.
      example: No valid route found
    code:
      $ref: "#/components/schemas/SwapApiErrorCode"
    status:
      type: integer
      example: 400
```

### `components.schemas.SwapApiErrorCode` (new)

```yaml
SwapApiErrorCode:
  type: string
  enum:
    - INVALID_REQUEST
    - UNSUPPORTED_TOKEN
    - NO_ROUTE_FOUND
    - QUOTE_EXPIRED
    - SWAPS_DISABLED
    - BUILD_TX_FAILED
    - UNAUTHORIZED
    - FORBIDDEN
    - RATE_LIMITED
    - METHOD_NOT_ALLOWED
    - INTERNAL_ERROR
```

### `components.schemas.SwapQuote` (extract `data` from `SwapQuoteResponse`)

Add properties (all additive):

```yaml
inputTokenDecimals:
  type: integer
  example: 6
  description: Decimals of inputToken (same as GET /api/public/tokens)
outputTokenDecimals:
  type: integer
  example: 6
amountScale:
  type: string
  enum: [normalized_1e18]
  description: Scale of legacy inputAmount, outputAmount, minOut, swapInputAmount, platformFeeAmount
requestAmountUnit:
  type: string
  enum: [token_decimals]
  description: Scale of the quote request's inputAmount
inputAmountRaw:
  type: string
  example: "100000000"
  description: Input amount in inputToken decimals
swapInputAmountRaw:
  type: string
  nullable: true
  description: Net input after protocol fee, in inputToken decimals
outputAmountRaw:
  type: string
  example: "92450000"
  description: Expected output in outputToken decimals. Use this for wallet display.
minOutRaw:
  type: string
  example: "91987750"
  description: Slippage-protected minimum output in outputToken decimals
platformFeeAmountRaw:
  type: string
  example: "250000"
quotedAt:
  type: string
  format: date-time
  example: "2026-09-11T12:00:00.000Z"
expiresAt:
  type: string
  format: date-time
  example: "2026-09-11T12:02:00.000Z"
validForSeconds:
  type: integer
  example: 120
  minimum: 5
  maximum: 600
```

Tighten descriptions on legacy fields:

- `inputAmount` / `outputAmount` / `minOut`: “18-decimal normalized string. **Not** token decimals. See `*Raw`.”
- Request `inputAmount`: “Token base units from `/tokens.decimals` (e.g. 100 USDC with 6 decimals = `100000000`).”

Apply the same new fields to nested `routeOptions[].quote`.

### `components.schemas.SwapBuildTxRequest`

```yaml
quote:
  description: >
    Pass the full `data` object from POST /api/public/swap/quote without
    stripping fields. build-tx uses expiresAt for QUOTE_EXPIRED.
```

### `components.schemas` approval object

```yaml
token:
  type: string
  description: ERC-20 whose allowance is being set
  example: "0x3600000000000000000000000000000000000000"
spender:
  type: string
  description: Allowance target decoded from calldata (router, executor, or Permit2 spender)
  example: "0x2De8906a641d65d490bC60A4179d961d59742bCb"
amountRaw:
  type: string
  description: Approve amount decoded from calldata (often maxUint256)
  example: "115792089237316195423570985008687907853269984665640564039457584007913129639935"
```

Allow `approval` to be an object, an array of that object, or `null`.

### Operation responses

On `POST /api/public/swap/quote` and `POST /api/public/swap/build-tx`:

- Add `405` → `METHOD_NOT_ALLOWED`
- Add `503` → `SWAPS_DISABLED`
- Change the “no route” example from HTTP 404 + prose-only to HTTP **400** + `code: NO_ROUTE_FOUND` (implementation returns 400)
- Auth examples: add `"code": "UNAUTHORIZED"` / `"FORBIDDEN"` / `"RATE_LIMITED"`

---

## Copy updates (Overview markdown in `info.description`)

1. **§3 Quick Start, Step 1** — After “100 USDC equals `100000000`”, add: quote **responses** also include `outputAmountRaw` in the output token’s decimals. For EURC (6 decimals), 92.45 EURC is `"92450000"`, not the 1e18 `outputAmount`.
2. **§3 Step 2** — “Pass `quote` from Step 1 as-is, including `expiresAt`.” Remove the reconstructed mini-quote in the cURL sample.
3. **§3 Step 3 / §4 Transaction Signing** — Keep non-custodial language. Add: Tower never signs or holds funds. Self-custody wallets should send unsigned `approval` (if any) then `swap` to the device. Before signing approval, check `approval.spender` (and calldata) against the expected router/executor.
4. **§3 JS sample** — Replace `quote.outputAmount` logging with `quote.outputAmountRaw` + `quote.outputTokenDecimals`. On failure, throw/map `quoteResult.code`.
5. **§3 Python sample** — Same.
6. **§3 Expected Response Shape** — Replace with the example below.
7. **§6 Error Handling** — Add `code` to the standard error JSON; replace the mismatched code names (table above). Change quote window from 60s to 120s / `validForSeconds`.

### Replacement quote example

```json
{
  "success": true,
  "data": {
    "inputToken": "0x3600000000000000000000000000000000000000",
    "outputToken": "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    "inputTokenDecimals": 6,
    "outputTokenDecimals": 6,
    "amountScale": "normalized_1e18",
    "requestAmountUnit": "token_decimals",
    "inputAmount": "100000000000000000000",
    "inputAmountRaw": "100000000",
    "outputAmount": "92450000000000000000",
    "outputAmountRaw": "92450000",
    "minOut": "91987750000000000000",
    "minOutRaw": "91987750",
    "platformFeeAmount": "250000000000000000",
    "platformFeeAmountRaw": "250000",
    "quotedAt": "2026-09-11T12:00:00.000Z",
    "expiresAt": "2026-09-11T12:02:00.000Z",
    "validForSeconds": 120,
    "priceImpact": 0.02,
    "gasEstimate": "200000",
    "feeBps": 25,
    "dexId": "tower-dex",
    "dexName": "Tower",
    "route": {
      "type": "single",
      "hops": [
        {
          "dexId": "tower-dex",
          "amountIn": "100000000000000000000",
          "amountOut": "92450000000000000000",
          "priceImpact": 0.02
        }
      ]
    },
    "routeOptions": []
  }
}
```

### Replacement `build-tx` approval example

```json
{
  "success": true,
  "data": {
    "approval": {
      "to": "0x3600000000000000000000000000000000000000",
      "token": "0x3600000000000000000000000000000000000000",
      "spender": "0x2De8906a641d65d490bC60A4179d961d59742bCb",
      "amountRaw": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      "data": "0x095ea7b3…",
      "from": "0xa54FFd258815Ee711bA0d3Dbb7fA786AEA6095Fb",
      "gasLimit": "0x186a0",
      "label": "Executor approval"
    },
    "swap": {
      "to": "0x2De8906a641d65d490bC60A4179d961d59742bCb",
      "data": "0xcd6267d5…",
      "value": "0x0",
      "from": "0xa54FFd258815Ee711bA0d3Dbb7fA786AEA6095Fb",
      "gasLimit": "0x7a120",
      "chainId": 5042002
    }
  }
}
```

`gasLimit` is hex in the live Tower DEX builder (`0x186a0`). If the published spec keeps decimal strings, note that both may appear; clients should parse with `BigInt`.

### Replacement `build-tx` request example

```json
{
  "quote": { "...": "entire data object from /swap/quote, including expiresAt and *Raw fields" },
  "userAddress": "0xa54FFd258815Ee711bA0d3Dbb7fA786AEA6095Fb"
}
```

Do not invent a partial quote in cURL.

---

## Optional new Overview subsection

Add under §4 Core Concepts, after Transaction Signing:

### Self-custody wallets

Tower’s public swap API is quote → unsigned txs → you sign. Tower does not hold keys or submit swaps on your behalf.

Recommended flow:

1. `POST /api/public/swap/quote` with `inputAmount` in token decimals.
2. Show the user `outputAmountRaw` / `minOutRaw` using `/tokens.decimals`.
3. If `Date.now()` is past `expiresAt`, request a new quote.
4. `POST /api/public/swap/build-tx` with the **full** quote and `userAddress`.
5. If `approval` is present, confirm `spender` (and calldata) then sign on device.
6. Sign `swap` on device and broadcast (wallet RPC or `POST /api/public/rpc/{chainId}`).
7. On `success: false`, map `code` to your own strings. Do not display `error` to users.

---

## Docs checklist

- [ ] Bump `info.version` to `1.1.0`
- [ ] Fix Overview quote example units (`inputAmount` vs `inputAmountRaw`, `platformFeeAmount`)
- [ ] Document `*Raw`, decimals, `amountScale`, `requestAmountUnit`
- [ ] Document `quotedAt`, `expiresAt`, `validForSeconds` (default 120)
- [ ] Document approval `token`, `spender`, `amountRaw`
- [ ] Add `code` to `ErrorResponse` and all error examples
- [ ] Replace Overview §6 code names with live codes
- [ ] Echo-full-quote warning on `build-tx`
- [ ] JS/Python samples: `outputAmountRaw` + `code`
- [ ] Self-custody unsigned-tx note
- [ ] `NO_ROUTE_FOUND` as 400, `SWAPS_DISABLED` as 503, `QUOTE_EXPIRED` on `build-tx`

Source of truth in this repo: `lib/swapApiContract.ts`, `app/api/public/swap/quote/route.ts`, `app/api/public/swap/build-tx/route.ts`.
