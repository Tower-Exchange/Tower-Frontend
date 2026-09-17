"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { fetchActivitiesByWallet, ActivityRow } from "@/lib/supabase";
import { getTokenIcon } from "@/lib/tokenIcons";
import { StaticImageData } from "next/image";
import { getChainLogoByName } from "@/lib/chains";
import arcLogo from "@/public/assets/ARCSvg.svg";
import { AppErrorModal } from "@/components/AppErrorModal";
import TransactionInfoModal from "@/components/TransactionInfoModal";
import ThemeAwareImage from "@/components/ThemeAwareImage";
import {
  buildTransactionInfoDetails,
  getActivityExplorerUrl,
  type TransactionInfoDetails,
} from "@/lib/activityDetails";

interface ActivitiesProps {
  isWalletConnected?: boolean;
  walletAddress?: string | null;
}

interface DisplayActivity {
  type: string;
  source: {
    token: string;
    icon: StaticImageData | null;
    network: string;
  };
  destination: {
    token: string;
    icon: StaticImageData | null;
    network: string;
  };
  status: "Successful" | "Failed" | "Pending";
  date: string;
  time: string;
  transactionHash: string | null;
  transactionUrl: string | null;
  details: TransactionInfoDetails | null;
  searchText: string;
  isCancellation?: boolean;
}

const getDisplayStatus = (status: ActivityRow["status"]) => {
  if (status === "Successful" || status === "Pending") {
    return status;
  }

  return "Failed";
};

// Format timestamp to date and time
const formatTimestamp = (timestamp: string): { date: string; time: string } => {
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return { date: dateStr, time: timeStr };
};

const Activities = ({
  isWalletConnected = false,
  walletAddress = null,
}: ActivitiesProps) => {
  const [activities, setActivities] = useState<DisplayActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedActivityDetails, setSelectedActivityDetails] =
    useState<TransactionInfoDetails | null>(null);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!isWalletConnected || !walletAddress) {
        setActivities([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data, error: fetchError, success } = await fetchActivitiesByWallet(
          walletAddress,
          { limit: 100 },
        );

        if (!success || fetchError) {
          console.error("Error fetching activities:", fetchError);
          setError("Failed to load activities");
          setActivities([]);
          return;
        }

        // Transform Supabase data to display format
        const transformedActivities: DisplayActivity[] = (data || []).map(
          (row: ActivityRow) => {
            const { date, time } = formatTimestamp(row.timestamp);
            const isCancellation = row.type.toLowerCase().includes("cancelled");
            return {
              type: row.type,
              source: {
                token: row.source_currency_ticker,
                icon: getTokenIcon(row.source_currency_ticker),
                network: row.source_network_name,
              },
              destination: {
                token: row.destination_currency_ticker || "",
                icon: row.destination_currency_ticker
                  ? getTokenIcon(row.destination_currency_ticker)
                  : null,
                network: row.destination_network_name || "",
              },
              status: getDisplayStatus(row.status),
              date,
              time,
              transactionHash: row.transaction_hash,
              transactionUrl: getActivityExplorerUrl(row),
              details: buildTransactionInfoDetails(row),
              searchText: [
                row.type,
                row.source_currency_ticker,
                row.destination_currency_ticker,
                row.source_network_name,
                row.destination_network_name,
                row.status,
                row.transaction_hash,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase(),
              isCancellation,
            };
          },
        );

        setActivities(transformedActivities);
      } catch (err) {
        console.error("Unexpected error fetching activities:", err);
        setError("An unexpected error occurred");
        setActivities([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivities();
  }, [isWalletConnected, walletAddress]);

  const visibleActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return activities;
    }

    return activities.filter((activity) =>
      activity.searchText.includes(normalizedQuery),
    );
  }, [activities, query]);

  // Show loading state
  if (isLoading) {
    return (
      <motion.div
        key="activities"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl overflow-hidden border border-border bg-card"
      >
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-muted-foreground">Loading activities...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <AppErrorModal
        error={error}
        onClose={() => setError(null)}
        title="Failed to load activities"
      />
      <TransactionInfoModal
        isOpen={Boolean(selectedActivityDetails)}
        onClose={() => setSelectedActivityDetails(null)}
        details={selectedActivityDetails}
      />
      <motion.div
        key="activities"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl overflow-hidden border border-border bg-card"
      >
        {activities.length > 0 ? (
          <>
            <div className="px-4 pb-4 pt-4 sm:px-6 sm:pt-6">
              <label className="flex h-12 items-center gap-3 rounded-lg border border-border bg-transparent px-4 text-sm text-muted-foreground focus-within:border-primary/50">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="search by token hash/symbol/chain"
                  className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>

            {visibleActivities.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                        Type
                      </th>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                        Source
                      </th>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                        Destination
                      </th>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleActivities.map((activity, index) => (
                  <motion.tr
                    key={`${activity.type}-${activity.transactionHash || index}-${activity.date}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                    className="border-b border-border/60 transition-colors hover:bg-accent/30"
                  >
                    <td className="py-5 px-6">
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap font-medium">
                          {activity.type}
                        </span>
                        {activity.isCancellation && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/50">
                            Cancelled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {activity.source.icon ? (
                            <div className="shrink-0 w-8 h-8">
                              <Image
                                src={activity.source.icon}
                                alt={`${activity.source.token} logo`}
                                width={32}
                                height={32}
                                className="object-contain w-full h-full"
                              />
                            </div>
                          ) : (
                            <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <span className="text-xs font-medium">
                                {activity.source.token[0]}
                              </span>
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center bg-white border border-gray-300">
                            <Image
                              src={
                                getChainLogoByName(activity.source.network) ??
                                arcLogo
                              }
                              alt={activity.source.network}
                              width={16}
                              height={16}
                              className="h-full w-full rounded-full object-cover"
                            />
                          </div>
                        </div>
                        <div className="min-w-max">
                          <div className="font-medium">
                            {activity.source.token}
                          </div>
                          <div className="whitespace-nowrap text-xs text-muted-foreground">
                            {activity.source.network}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-6">
                      {activity.destination.token ? (
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            {activity.destination.icon ? (
                              <div className="shrink-0 w-8 h-8">
                                <Image
                                  src={activity.destination.icon}
                                  alt={`${activity.destination.token} logo`}
                                  width={32}
                                  height={32}
                                  className="object-contain w-full h-full"
                                />
                              </div>
                            ) : (
                              <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <span className="text-xs font-medium">
                                  {activity.destination.token[0]}
                                </span>
                              </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center bg-white border border-gray-300">
                              <Image
                                src={
                                  getChainLogoByName(
                                    activity.destination.network,
                                  ) ?? arcLogo
                                }
                                alt={activity.destination.network}
                                width={16}
                                height={16}
                                className="h-full w-full rounded-full object-cover"
                              />
                            </div>
                          </div>
                          <div className="min-w-max">
                            <div className="font-medium">
                              {activity.destination.token}
                            </div>
                            <div className="whitespace-nowrap text-xs text-muted-foreground">
                              {activity.destination.network}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â</span>
                      )}
                    </td>
                    <td className="py-5 px-6">
                      <motion.span
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          delay: index * 0.05 + 0.15,
                          duration: 0.3,
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border inline-block ${
                          activity.status === "Successful"
                            ? "text-green-400 border-green-400/30 bg-green-400/10"
                            : activity.status === "Pending"
                              ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
                            : "text-red-400 border-red-400/30 bg-red-400/10"
                        }`}
                      >
                        {activity.status}
                      </motion.span>
                    </td>
                    <td className="py-5 px-6 text-right">
                      <div className="whitespace-nowrap font-medium">{activity.date}</div>
                      <div className="whitespace-nowrap text-xs text-muted-foreground">
                        {activity.time}
                      </div>
                    </td>
                    <td className="py-5 px-6 text-right">
                      {activity.details ? (
                        <button
                          type="button"
                          onClick={() => setSelectedActivityDetails(activity.details)}
                          className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-primary bg-primary px-4 text-xs font-semibold text-[#0C0C0D] transition-colors hover:bg-primary/90"
                        >
                          <span>View Details</span>
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                  </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <h4 className="text-lg font-semibold text-foreground">
                  No matching transactions
                </h4>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try another token, hash, symbol, or chain.
                </p>
              </div>
            )}
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-20 px-6"
          >
            <div className="mb-6">
              <ThemeAwareImage
                darkSrc="/assets/empty state icon.svg"
                lightSrc="/assets/empty-state-icon-light.svg"
                alt={
                  isWalletConnected
                    ? "No transactions yet"
                    : "No wallet connected"
                }
                width={80}
                height={80}
                className="w-20 h-20"
              />
            </div>
            <h4 className="text-xl font-semibold mb-2">
              {isWalletConnected
                ? "No transactions yet"
                : "No wallet connected"}
            </h4>
            <p className="text-muted-foreground text-center">
              {isWalletConnected
                ? "Your swap and transfer activity will appear here."
                : "Connect your wallet to view activity."}
            </p>
          </motion.div>
        )}
      </motion.div>
    </>
  );
};

export default Activities;
