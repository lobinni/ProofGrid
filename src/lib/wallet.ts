// Injected wallet (MetaMask / EIP-1193) integration.
//
// Users must connect a real browser wallet to participate - the connected
// account's address is the identity that signs every contract write
// (msg.sender). On live networks the app also drives chain switching via
// wallet_switchEthereumChain / wallet_addEthereumChain.

import { NETWORKS, type NetworkConfig } from "@/lib/networks";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
}

export class WalletError extends Error {
  code: "NO_WALLET" | "USER_REJECTED" | "UNKNOWN";
  constructor(code: WalletError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export function getInjected(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193Provider & { providers?: Eip1193Provider[]; isMetaMask?: boolean } }).ethereum;
  if (!eth) return null;
  // Multiple injected wallets: prefer MetaMask when a providers array exists.
  const bags = (eth as { providers?: Eip1193Provider[] }).providers;
  if (Array.isArray(bags) && bags.length > 0) {
    const mm = bags.find((p) => (p as { isMetaMask?: boolean }).isMetaMask);
    return mm ?? bags[0];
  }
  return eth;
}

export const hasInjectedWallet = (): boolean => getInjected() !== null;

/** Interactive connect - opens the wallet popup. */
export async function requestAccounts(): Promise<`0x${string}`> {
  const provider = getInjected();
  if (!provider) {
    throw new WalletError("NO_WALLET", "No injected wallet found. Install MetaMask to continue.");
  }
  try {
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts || accounts.length === 0) {
      throw new WalletError("USER_REJECTED", "The wallet did not return any account.");
    }
    return accounts[0] as `0x${string}`;
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) throw new WalletError("USER_REJECTED", "Connection request rejected in the wallet.");
    if (err instanceof WalletError) throw err;
    throw new WalletError("UNKNOWN", err instanceof Error ? err.message : "Wallet connection failed.");
  }
}

/** Passive restore - never pops the wallet UI. */
export async function getAccounts(): Promise<`0x${string}` | ""> {
  const provider = getInjected();
  if (!provider) return "";
  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    return accounts && accounts.length > 0 ? (accounts[0] as `0x${string}`) : "";
  } catch {
    return "";
  }
}

/** Ask the wallet to switch to (or add) a live network's chain. */
export async function ensureChain(cfg: NetworkConfig): Promise<void> {
  const provider = getInjected();
  if (!provider) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: cfg.chainIdHex }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 4902) return; // unknown chain handled below; anything else is user choice
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: cfg.chainIdHex,
          chainName: cfg.chain.name,
          nativeCurrency: cfg.chain.nativeCurrency,
          rpcUrls: cfg.chain.rpcUrls.default.http.filter((u) => u.startsWith("http")),
          blockExplorerUrls: cfg.explorer ? [cfg.explorer] : [],
        },
      ],
    });
  }
}

type AccountsHandler = (accounts: string[]) => void;

export function watchAccounts(handler: AccountsHandler): () => void {
  const provider = getInjected();
  if (!provider?.on) return () => {};
  provider.on("accountsChanged", handler);
  return () => provider.removeListener?.("accountsChanged", handler);
}
