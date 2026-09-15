"use client";

import Image, { type StaticImageData } from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Circle,
  Hourglass,
  Loader2,
  Wallet,
  X,
} from "lucide-react";

export type TransactionStepStatus = "complete" | "active" | "pending" | "failed";

export type TransactionStep = {
  id: string;
  label: string;
  status: TransactionStepStatus;
  detail?: string;
  kind?: "wallet" | "wait" | "mint";
  icon?: StepModalImage;
};

type StepModalImage = StaticImageData | string;

type TransactionStepsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  variant: "swap" | "bridge";
  fromIcon?: StepModalImage;
  toIcon?: StepModalImage;
  fromBadgeIcon?: StepModalImage;
  toBadgeIcon?: StepModalImage;
  steps: TransactionStep[];
};

const statusRank: Record<TransactionStepStatus, number> = {
  failed: 0,
  pending: 1,
  active: 2,
  complete: 3,
};

const StepLogo = ({
  icon,
  badgeIcon,
  size = "lg",
}: {
  icon?: StepModalImage;
  badgeIcon?: StepModalImage;
  size?: "lg" | "sm";
}) => {
  const dimensions = size === "lg" ? "h-14 w-14" : "h-6 w-6";
  const imageSize = size === "lg" ? 34 : 16;

  return (
    <span
      className={`relative inline-flex ${dimensions} items-center justify-center rounded-full bg-transparent shadow-[0_12px_28px_rgba(0,0,0,0.25)]`}
    >
      {icon ? (
        <Image
          src={icon}
          alt=""
          width={imageSize}
          height={imageSize}
          className="h-full w-full object-contain"
        />
      ) : (
        <Wallet className="h-7 w-7 text-foreground" />
      )}

      {badgeIcon ? (
        <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-[#14181f] bg-card">
          <Image
            src={badgeIcon}
            alt=""
            width={18}
            height={18}
            className="h-full w-full rounded-full object-cover"
          />
        </span>
      ) : null}
    </span>
  );
};

const StepStatusIcon = ({ step }: { step: TransactionStep }) => {
  const baseClass =
    "relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border";

  if (step.status === "failed") {
    return (
      <span className={`${baseClass} border-red-400/70 bg-red-500 text-foreground`}>
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (step.icon) {
    return (
      <span
        className={`${baseClass} overflow-hidden bg-transparent ${
          step.status === "active"
            ? "border-primary/80 ring-2 ring-primary/35"
            : step.status === "complete"
              ? "border-primary/70"
              : "border-white/18 opacity-55"
        }`}
      >
        <Image
          src={step.icon}
          alt=""
          width={24}
          height={24}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  if (step.kind === "wait") {
    return (
      <span
        className={`${baseClass} ${
          step.status === "pending"
            ? "border-white/18 bg-transparent text-muted-foreground"
            : "border-primary/60 bg-primary/10 text-primary"
        }`}
      >
        <Hourglass className="h-4 w-4" />
      </span>
    );
  }

  if (step.status === "complete") {
    return (
      <span className={`${baseClass} border-primary/75 bg-primary text-black`}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }

  if (step.status === "active") {
    return (
      <span className={`${baseClass} border-primary/75 bg-primary text-black`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }

  if (step.kind === "mint") {
    return (
      <span className={`${baseClass} border-primary/40 bg-primary/15 text-primary`}>
        <span className="h-3.5 w-3.5 rounded-[4px] bg-primary" />
      </span>
    );
  }

  return (
    <span className={`${baseClass} border-border bg-transparent text-foreground/40`}>
      <Circle className="h-3 w-3 fill-current" />
    </span>
  );
};

export const TransactionStepsModal = ({
  isOpen,
  onClose,
  title,
  subtitle,
  variant,
  fromIcon,
  toIcon,
  fromBadgeIcon,
  toBadgeIcon,
  steps,
}: TransactionStepsModalProps) => {
  const activeStep = steps.find((step) => step.status === "active");
  const failedStep = steps.find((step) => step.status === "failed");
  const detailStep = failedStep || activeStep;

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[81] flex items-center justify-center px-4 py-6"
          >
            <div className="relative w-full max-w-[31rem] rounded-[28px] border border-[#263243] bg-card px-5 pb-7 pt-8 shadow-2xl sm:px-7">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-6 top-6 inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
                aria-label="Close transaction steps"
              >
                <X className="h-6 w-6" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="mb-5 flex min-h-14 items-center justify-center gap-4">
                  <StepLogo icon={fromIcon} badgeIcon={fromBadgeIcon} />
                  {variant === "swap" && (
                    <>
                      <ArrowRight className="h-6 w-6 text-foreground" />
                      <StepLogo icon={toIcon} badgeIcon={toBadgeIcon} />
                    </>
                  )}
                </div>

                <h2 className="max-w-full break-words text-[0.88rem] font-semibold leading-tight text-foreground min-[390px]:text-[0.95rem] sm:text-[1.3rem]">
                  {title}
                </h2>
                <p className="mt-1 max-w-full break-words text-sm font-medium text-foreground">{subtitle}</p>

                <div className="mt-6 rounded-full bg-muted px-7 py-2 text-sm font-semibold text-foreground">
                  Steps
                </div>
              </div>

              <div className="mt-7 rounded-[28px] border border-border bg-card px-6 py-5">
                <div className="relative space-y-5">
                  {steps.map((step, index) => {
                    const nextStep = steps[index + 1];
                    const lineIsBright =
                      nextStep &&
                      statusRank[step.status] >= statusRank.active &&
                      nextStep.status !== "pending";

                    return (
                      <div key={step.id} className="relative flex items-center gap-3">
                        {index < steps.length - 1 ? (
                          <span
                            className={`absolute left-3 top-6 h-5 w-px ${
                              lineIsBright ? "bg-primary/70" : "bg-white/22"
                            }`}
                          />
                        ) : null}

                        <StepStatusIcon step={step} />

                        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                          <span
                            className={`truncate text-[0.98rem] font-medium ${
                              step.status === "pending"
                                ? "text-foreground/42"
                                : "text-foreground"
                            }`}
                          >
                            {step.label}
                          </span>

                          {detailStep?.id === step.id && step.detail ? (
                            <span
                              className={`max-w-[12rem] truncate text-right text-sm ${
                                step.status === "failed"
                                  ? "text-red-300"
                                  : "text-foreground"
                              }`}
                            >
                              {step.detail}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
};

export default TransactionStepsModal;
