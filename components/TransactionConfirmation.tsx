"use client";

import { motion } from "framer-motion";
import { Check, Loader, Copy, ExternalLink, X } from "lucide-react";
import { useState } from "react";

import { ErrorBadge } from "@/components/ui/error-badge";

interface TransactionConfirmationProps {
  status:
    | "idle"
    | "signing"
    | "broadcasting"
    | "confirming"
    | "confirmed"
    | "error";
  statusMessage?: string;
  transactionHash?: string;
  blockNumber?: number;
  error?: string | null;
  onClose?: () => void;
  title?: string;
  errorLayout?: "inline" | "stacked";
  explorerUrl?: string;
}

export const TransactionConfirmation: React.FC<
  TransactionConfirmationProps
> = ({
  status,
  statusMessage,
  transactionHash,
  blockNumber,
  error,
  onClose,
  title,
  errorLayout = "inline",
  explorerUrl,
}) => {
  const [copied, setCopied] = useState(false);
  const showInlineError =
    status === "error" && Boolean(error) && errorLayout === "inline";
  const showStackedError =
    status === "error" && Boolean(error) && errorLayout === "stacked";

  const handleCopyHash = () => {
    if (transactionHash) {
      navigator.clipboard.writeText(transactionHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "signing":
      case "broadcasting":
      case "confirming":
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Loader size={24} className="text-primary" />
          </motion.div>
        );
      case "confirmed":
        return (
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-green-500">
            <Check className="h-4 w-4 text-foreground" strokeWidth={3} />
          </div>
        );
      case "error":
        return null;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "signing":
      case "broadcasting":
      case "confirming":
        return "border-primary/50 bg-primary/5";
      case "confirmed":
        return "border-green-500/50 bg-green-500/5";
      case "error":
        return "border-red-500/50 bg-red-500/5";
      default:
        return "border-gray-500/50 bg-gray-500/5";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "signing":
        return "Signing Transaction";
      case "broadcasting":
        return "Broadcasting Transaction";
      case "confirming":
        return "Confirming on Blockchain";
      case "confirmed":
        return "Swap Confirmed";
      case "error":
        return "Transaction Failed";
      default:
        return "Processing";
    }
  };

  const statusTitle = title ?? getStatusText();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-lg border ${showInlineError ? "px-3 py-3 pr-10 sm:p-4 sm:pr-10" : "p-4 pr-10"} ${getStatusColor()}`}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Dismiss transaction message"
        >
          <X size={15} />
        </button>
      )}

      <div
        className={
          showInlineError || showStackedError
            ? "block"
            : "flex items-start gap-3"
        }
      >
        {!showInlineError && (
          <div className="mt-1 shrink-0">{getStatusIcon()}</div>
        )}

        <div className="min-w-0 flex-1">
          {showInlineError ? (
            <ErrorBadge
              message={error}
              fallback="Transaction failed."
              className="align-top"
            />
          ) : (
            <>
              <h3 className="mb-1 font-semibold text-foreground">{statusTitle}</h3>
              {showStackedError ? (
                <div className="mt-2">
                  <ErrorBadge message={error} fallback="Transaction failed." />
                </div>
              ) : (
                statusMessage && (
                  <p className="mb-3 text-sm text-muted-foreground">{statusMessage}</p>
                )
              )}
            </>
          )}

          {transactionHash && (
            <div
              className="mb-3 min-w-0 overflow-hidden rounded bg-black/30 p-2 font-sora text-xs [font-family:var(--font-sora)]"
              style={{ fontFamily: "var(--font-sora)" }}
            >
              <div className="flex flex-wrap min-w-0 items-center justify-between gap-x-2 gap-y-1">
                <span className="shrink-0 text-muted-foreground">TX Hash:</span>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {transactionHash.slice(0, 6)}...
                    {transactionHash.slice(-6)}
                  </span>
                  <button
                    onClick={handleCopyHash}
                    className="shrink-0 rounded p-1 transition-colors hover:bg-accent"
                    title="Copy full hash"
                  >
                    <Copy size={14} />
                  </button>
                  <a
                    href={
                      explorerUrl ||
                      `https://testnet.arcscan.app/tx/${transactionHash}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded p-1 transition-colors hover:bg-accent"
                    title="View on Arcscan Testnet"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
              {copied && (
                <p className="text-xs text-green-400 mt-1">
                  Copied to clipboard!
                </p>
              )}
            </div>
          )}

          {blockNumber && status === "confirmed" && (
            <p className="text-xs text-muted-foreground">Block: {blockNumber}</p>
          )}

          {error && !showInlineError && !showStackedError && (
            <div className="mt-2">
              <ErrorBadge message={error} fallback="Transaction failed." />
            </div>
          )}

          {status === "confirmed" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 flex gap-2"
            >
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded text-sm bg-primary hover:bg-[#629ee2] text-black transition-colors"
                >
                  Close
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
