"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
// import { Plus } from "lucide-react";
// Hidden until recurring orders have a seamless flow.
// import { RecurringBuys } from "@/components/reusable/RecurringBuys";
// import { RecurringSell } from "@/components/reusable/RecurringSell";
// import { PortfolioAnalysis } from "@/components/reusable/PortfolioAnalysis";
import { AIChat } from "@/components/AIChat";
import TokenTicker from "@/components/TokenTicker";

const AIAgentPage = () => {
  // Hidden while Portfolio Analysis card is commented out
  // const [activeTab, setActiveTab] = useState("portfolio");
  // const [showRightPanel, setShowRightPanel] = useState(false);
  // const [showRightPanelButton, setShowRightPanelButton] = useState(false);
  // const [isLargeScreen, setIsLargeScreen] = useState(false);

  /*
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const tabs = [
    // Hidden until recurring orders have a seamless flow.
    // { id: "recurring-buys", label: "Recurring Buy" },
    // { id: "recurring-sell", label: "Recurring Sell" },
    { id: "portfolio", label: "Portfolio Analysis" },
  ];
  */

  return (
    <div className="relative flex h-[calc(100dvh-5rem)] flex-col overflow-hidden bg-background text-foreground flex-1">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_85%,rgba(87,147,255,0.08),transparent_30%),radial-gradient(circle_at_75%_100%,rgba(77,149,235,0.06),transparent_34%)] dark:bg-[radial-gradient(circle_at_20%_85%,rgba(87,147,255,0.12),transparent_30%),radial-gradient(circle_at_75%_100%,rgba(35,57,94,0.16),transparent_34%),linear-gradient(180deg,#07080b_0%,#0a0b0f_45%,#0d1015_100%)]" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <TokenTicker />

        {/* Hidden while Portfolio Analysis card is commented out
        {!showRightPanel && showRightPanelButton && (
          <div className="fixed bottom-[10rem] right-4 z-50 lg:hidden sm:bottom-[17rem] sm:right-6">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setShowRightPanel(true)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-[#081019] shadow-[0_16px_40px_rgba(123,184,255,0.35)] sm:h-14 sm:w-14"
            >
              <Plus size={22} />
            </motion.button>
          </div>
        )}
        */}

        <div className="mx-auto flex w-full max-w-[1320px] flex-1 min-h-0 flex-col px-3 pb-3 pt-2 sm:px-6 sm:pb-4 sm:pt-3 lg:px-8 lg:pb-5">
          {/* Originally used 3-column grid when Portfolio Analysis panel was active:
              className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_16px_minmax(430px,500px)] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_18px_minmax(460px,540px)]"
          */}
          <div className="flex h-full min-h-0 flex-1 flex-col gap-4 w-full overflow-hidden">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="flex h-full min-h-0 flex-col overflow-hidden flex-1 w-full"
            >
              <AIChat />
            </motion.div>

            {/* Portfolio Analysis Card & Divider (Hidden)
            <div className="relative hidden lg:flex items-center justify-center">
              <div className="h-[64%] w-px rounded-full bg-gradient-to-b from-transparent via-border to-transparent" />
              <div className="absolute h-20 w-1.5 rounded-full bg-muted-foreground/40" />
            </div>

            {showRightPanel && !isLargeScreen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowRightPanel(false)}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm sm:backdrop-blur lg:hidden"
                style={{
                  willChange: "opacity",
                  WebkitAcceleratedCompositing: true,
                } as any}
              />
            )}

            <AnimatePresence>
              {(showRightPanel || isLargeScreen) && (
                <motion.div
                  initial={
                    isLargeScreen ? { opacity: 0, x: 20 } : { opacity: 0, y: "100%" }
                  }
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={
                    isLargeScreen ? { opacity: 0, x: 20 } : { opacity: 0, y: "100%" }
                  }
                  transition={{ duration: isLargeScreen ? 0.3 : 0.35, ease: "easeOut" }}
                  className={`z-40 flex flex-col overflow-hidden border border-border bg-card/95 shadow-[0_28px_80px_rgba(0,0,0,0.12)] backdrop-blur-md sm:backdrop-blur-xl dark:shadow-[0_28px_80px_rgba(0,0,0,0.48)] ${
                    isLargeScreen
                      ? "relative h-full min-h-0 rounded-[24px] p-3 lg:shadow-[0_24px_64px_rgba(0,0,0,0.12)] xl:rounded-[26px] xl:p-3.5"
                      : "fixed inset-x-0 bottom-0 top-[8.5rem] rounded-t-[24px] rounded-b-none border-b-0 border-x-0 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:top-[9rem] sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pt-4"
                  }`}
                  style={{
                    willChange: isLargeScreen ? "transform, opacity" : "transform, opacity",
                    WebkitAcceleratedCompositing: true,
                    transform: isLargeScreen ? undefined : "translateZ(0)",
                    backfaceVisibility: "hidden",
                  } as any}
                >
                  {!isLargeScreen && (
                    <div className="mb-4 flex justify-center lg:hidden">
                      <div className="h-1.5 w-14 rounded-full bg-muted-foreground/30" />
                    </div>
                  )}

                  <div className="shrink-0 px-2 pt-1 lg:px-1">
                    <h2 className="text-base font-bold text-foreground sm:text-lg lg:text-xl text-center">
                      Portfolio Analysis
                    </h2>
                  </div>

                  <div
                    className={`px-2 pb-2 pt-5 lg:px-1 lg:pb-1 lg:pt-3.5 xl:px-1.5 xl:pb-1.5 xl:pt-4 ${
                      isLargeScreen ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto overscroll-contain"
                    }`}
                    style={{
                      WebkitOverflowScrolling: "touch",
                      scrollBehavior: "smooth",
                    } as any}
                  >
                    <div className="mx-auto w-full max-w-[430px] xl:max-w-[470px]">
                      <AnimatePresence mode="wait">
                        {/* Hidden until recurring orders have a seamless flow.
                        activeTab === "recurring-buys" && (
                          <RecurringBuys key="buys" />
                        )
                        activeTab === "recurring-sell" && (
                          <RecurringSell key="sell" />
                        )
                        * /}
                        {activeTab === "portfolio" && (
                          <PortfolioAnalysis key="portfolio" />
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAgentPage;
