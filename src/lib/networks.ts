// Network registry. The verified deployment manifest is authoritative.
// NEXT_PUBLIC_* values are bootstrap fallbacks only when a manifest address is
// absent; a stale Vercel variable can therefore never override a newly recorded
// deployment and recreate frontend/contract address drift.

import { studionet as glStudionet, testnetBradbury as glBradbury } from "genlayer-js/chains";
import deploymentManifest from "../../deployments/deployments.json";

export type NetworkId = "bradbury" | "studionet";
export type GenLayerChain = typeof glBradbury | typeof glStudionet;

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  chain: GenLayerChain;
  chainIdHex: `0x${string}`;
  factoryAddress: `0x${string}`;
  explorer: string;
  gasless: boolean;
  configured: boolean;
  sourceSha256: string | null;
  deploymentTx: string | null;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function validAddress(value?: string | null): value is `0x${string}` {
  return !!value && ADDRESS_RE.test(value) && value.toLowerCase() !== ZERO;
}

// Static access — required for NEXT_PUBLIC variables to reach the client.
const studionetEnv = process.env.NEXT_PUBLIC_STUDIONET_FACTORY;
const bradburyEnv = process.env.NEXT_PUBLIC_BRADBURY_FACTORY;
const studionetManifest = deploymentManifest.networks.studionet;
const bradburyManifest = deploymentManifest.networks.bradbury;

const studionetAddress = validAddress(studionetManifest.activeFactory)
  ? studionetManifest.activeFactory
  : validAddress(studionetEnv)
    ? studionetEnv
    : ZERO;
const bradburyAddress = validAddress(bradburyManifest.activeFactory)
  ? bradburyManifest.activeFactory
  : validAddress(bradburyEnv)
    ? bradburyEnv
    : ZERO;

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  bradbury: {
    id: "bradbury",
    label: "Asimov / Bradbury Testnet",
    chain: glBradbury,
    chainIdHex: "0x107d",
    factoryAddress: bradburyAddress,
    explorer: bradburyManifest.explorer,
    gasless: false,
    configured: bradburyAddress !== ZERO,
    sourceSha256: bradburyManifest.activeFactorySourceSha256,
    deploymentTx: bradburyManifest.deploymentTx,
  },
  studionet: {
    id: "studionet",
    label: "GenLayer Studio (Studionet)",
    chain: glStudionet,
    chainIdHex: "0xf22f",
    factoryAddress: studionetAddress,
    explorer: studionetManifest.explorer,
    gasless: true,
    configured: studionetAddress !== ZERO,
    sourceSha256: studionetManifest.activeFactorySourceSha256,
    deploymentTx: studionetManifest.deploymentTx,
  },
};

const envDefault = process.env.NEXT_PUBLIC_DEFAULT_NETWORK?.trim().toLowerCase();
export const DEFAULT_NETWORK: NetworkId =
  envDefault === "bradbury" || envDefault === "studionet" ? envDefault : "studionet";

const STORAGE_KEY = "proofgrid-network";

export function getStoredNetwork(): NetworkId {
  if (typeof window === "undefined") return DEFAULT_NETWORK;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "bradbury" || stored === "studionet" ? stored : DEFAULT_NETWORK;
}

export function setStoredNetwork(network: NetworkId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, network);
}

export function assertNetworkConfigured(network: NetworkId): NetworkConfig {
  const config = NETWORKS[network];
  if (!config.configured) {
    throw new Error(
      `${config.label} has no verified active TaskFactory. Deploy the current artifact, ` +
        `record its source hash, and set the corresponding NEXT_PUBLIC_*_FACTORY variable.`
    );
  }
  return config;
}
