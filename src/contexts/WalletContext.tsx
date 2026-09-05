"use client";

// Wallet + network state for the whole shell.
// Participation requires a real browser wallet (MetaMask, EIP-1193): the
// connected account is the identity behind every contract write.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast";
import {
  WalletError,
  ensureChain,
  getAccounts,
  getInjected,
  hasInjectedWallet,
  requestAccounts,
  watchAccounts,
} from "@/lib/wallet";
import {
  DEFAULT_NETWORK,
  NETWORKS,
  getStoredNetwork,
  setStoredNetwork,
  type NetworkId,
} from "@/lib/networks";

interface WalletContextValue {
  network: NetworkId;
  setNetwork: (network: NetworkId) => void;
  address: `0x${string}` | null;
  isConnected: boolean;
  /** False when no EIP-1193 provider (MetaMask etc.) is injected. */
  walletAvailable: boolean;
  /** True after the mount-time account restore attempt finished. */
  walletReady: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetworkState] = useState<NetworkId>(DEFAULT_NETWORK);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [walletAvailable, setWalletAvailable] = useState(false);

  // Restore persisted network + any already-authorized wallet account.
  useEffect(() => {
    let cancelled = false;
    const available = hasInjectedWallet();
    const restoreTimer = window.setTimeout(() => {
      if (cancelled) return;
      setNetworkState(getStoredNetwork());
      setWalletAvailable(available);
      if (!available) setWalletReady(true);
    }, 0);

    if (available) {
      getAccounts().then((account) => {
        if (!cancelled && account) setAddress(account);
        if (!cancelled) setWalletReady(true);
      });
    }
    const unwatch = watchAccounts((accounts) => {
      setAddress(accounts && accounts.length > 0 ? (accounts[0] as `0x${string}`) : null);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(restoreTimer);
      unwatch();
    };
  }, []);

  const setNetwork = useCallback((next: NetworkId) => {
    setNetworkState(next);
    setStoredNetwork(next);
    // Keep the wallet on the same chain as the selected network.
    if (address) {
      ensureChain(NETWORKS[next]).catch(() => {});
    }
  }, [address]);

  const connect = useCallback(async () => {
    const account = await requestAccounts();
    setAddress(account);
    // On live networks, bring the wallet onto the right chain too. Failures
    // here are non-fatal: reads still work.
    const cfg = NETWORKS[network];
    ensureChain(cfg).catch(() => {});
  }, [network]);

  const disconnect = useCallback(async () => {
    // EIP-1193 has no true disconnect; revoke the permission when the wallet
    // supports it so the next connect pops the account picker again.
    const provider = getInjected();
    try {
      await provider?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      /* older wallets: app-side logout only */
    }
    setAddress(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      network,
      setNetwork,
      address,
      isConnected: address !== null,
      walletAvailable,
      walletReady,
      connect,
      disconnect,
    }),
    [network, setNetwork, address, walletAvailable, walletReady, connect, disconnect]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletContext(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletContext must be used inside <WalletProvider>");
  return ctx;
}

export function useNetworkConfig() {
  const { network } = useWalletContext();
  return NETWORKS[network];
}

/** Connect with standard success/error toasts - used by page-level CTAs. */
export function useConnectWithToast(): () => Promise<boolean> {
  const { connect } = useWalletContext();
  return useCallback(async () => {
    try {
      await connect();
      toast("success", "Wallet connected");
      return true;
    } catch (err) {
      toast("error", "Connection failed", err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  }, [connect]);
}

export { WalletError };
