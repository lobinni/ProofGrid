"use client";

// Fetches every task from the active network's factory plus its escrow
// status - the single data source for the Board, Dashboard, and the landing
// page's live stats. No off-chain indexer or per-browser storage involved.

import { useCallback, useEffect, useState } from "react";
import {
  getAllTaskAddresses,
  getEscrowStatus,
  getReadOnlyClient,
  getTaskState,
  type ContractTaskState,
} from "@/lib/contract";
import { useWalletContext } from "@/contexts/WalletContext";

export interface OnChainTask extends ContractTaskState {
  contractAddress: string;
  escrowLocked: number;
  escrowReleased: boolean;
}

export function useTasks() {
  const { network, address } = useWalletContext();
  const [tasks, setTasks] = useState<OnChainTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const addresses = await getAllTaskAddresses(network);
      const client = getReadOnlyClient(network);
      const results = await Promise.all(
        addresses.map(async (contractAddress) => {
          try {
            const [state, escrow] = await Promise.all([
              getTaskState(client, contractAddress, address ?? undefined),
              getEscrowStatus(network, contractAddress),
            ]);
            return {
              ...state,
              contractAddress,
              escrowLocked: escrow.lockedAmount,
              escrowReleased: escrow.released,
            };
          } catch {
            return null;
          }
        })
      );
      setTasks(results.filter((t): t is OnChainTask => t !== null).reverse());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [network, address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, loading, error, refresh };
}
