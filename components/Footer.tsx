"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { FaXTwitter } from "react-icons/fa6";
import { FaTelegram, FaDiscord } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { Info, HelpCircle } from "lucide-react";

const ANALYTICS_URL = "https://analytics.tower.exchange";
const DOCS_URL = "https://docs.tower.exchange";
const TERMS_URL = "/terms";
const PRIVACY_URL = "/privacy";

const Footer = () => {
  const pathname = usePathname();
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  useEffect(() => {
    if (!infoModalOpen) return;

    const handleScroll = () => {
      setInfoModalOpen(false);
    };

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [infoModalOpen]);

  if (pathname === "/ai-agent") {
    return null;
  }

  const socialLinks = [
    {
      icon: <FaXTwitter className="w-5 h-5" />,
      href: "https://x.com/TowerExchange",
    },
    {
      icon: <FaTelegram className="w-5 h-5" />,
      href: "https://t.me/TowerExchangeCommunity",
    },
    {
      icon: <FaDiscord className="w-5 h-5" />,
      href: "https://discord.gg/ftXUD6qa4J",
    },
  ];

  return (
    <>
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="relative flex items-center justify-between px-6 py-6 border-t border-border mt-auto bg-background"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Towerdex Inc • Copyright 2026
          </p>
          <motion.button
            type="button"
            aria-label="View docs and terms"
            onClick={() => setInfoModalOpen(!infoModalOpen)}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <Info className="w-4 h-4" />
          </motion.button>
        </div>
        <div className="flex items-center gap-4">
          {socialLinks.map((link, index) => (
            <motion.a
              key={index}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              whileHover={{ scale: 1.2, y: -2 }}
              whileTap={{ scale: 0.9 }}
            >
              {link.icon}
            </motion.a>
          ))}
        </div>
      </motion.footer>

      <AnimatePresence>
        {infoModalOpen && (
          <>
            <motion.div
              key="info-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInfoModalOpen(false)}
              className="fixed inset-0 z-40"
              aria-hidden
            />
            <motion.div
              key="info-modal"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-20 left-6 z-50 w-56 rounded-xl border border-border bg-card/95 backdrop-blur-sm shadow-xl py-2"
            >
              <a
                href={ANALYTICS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
              >
                <span>Analytics</span>
                <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              </a>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
              >
                <span>Docs</span>
                <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              </a>
              <a
                href={TERMS_URL}
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
              >
                <span>Terms & Conditions</span>
                <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              </a>
              <a
                href={PRIVACY_URL}
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
              >
                <span>Privacy Policy</span>
                <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              </a>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Footer;
