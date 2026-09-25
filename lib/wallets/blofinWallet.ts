import {
  getWalletConnectConnector,
  type RainbowKitWalletConnectParameters,
  type Wallet,
} from "@rainbow-me/rainbowkit";

type BlofinWalletOptions = {
  projectId: string;
  walletConnectParameters?: RainbowKitWalletConnectParameters;
};

const BLOFIN_DOWNLOAD_URL = "https://wallet.blofin.com/en/download";
const BLOFIN_IOS_URL =
  "https://apps.apple.com/app/apple-store/id6753210919?pt=124425001&ct=walletconnect&mt=8";
const BLOFIN_ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.blofin.wallet.wallet&ct=walletconnect&mt=8";

const isAndroid = () =>
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

export const blofinWallet = ({
  projectId,
  walletConnectParameters,
}: BlofinWalletOptions): Wallet => ({
  id: "blofin",
  name: "BloFin Wallet",
  iconUrl: "/assets/blofin-wallet.jpg",
  iconBackground: "#FF8A00",
  downloadUrls: {
    android: BLOFIN_ANDROID_URL,
    ios: BLOFIN_IOS_URL,
    mobile: BLOFIN_DOWNLOAD_URL,
    qrCode: BLOFIN_DOWNLOAD_URL,
  },
  mobile: {
    getUri: (uri: string) =>
      isAndroid()
        ? uri
        : `blofin-wallet://wc?uri=${encodeURIComponent(uri)}`,
  },
  qrCode: {
    getUri: (uri: string) => uri,
    instructions: {
      learnMoreUrl: "https://wallet.blofin.com/",
      steps: [
        {
          step: "install",
          title: "Open BloFin Wallet",
          description:
            "We recommend putting BloFin Wallet on your home screen for faster access.",
        },
        {
          step: "create",
          title: "Create or import a wallet",
          description:
            "Create a new BloFin Wallet or import an existing one.",
        },
        {
          step: "scan",
          title: "Tap the scan button",
          description:
            "After you scan, a connection prompt will appear so you can approve this app.",
        },
      ],
    },
  },
  createConnector: getWalletConnectConnector({
    projectId,
    walletConnectParameters,
  }),
});
