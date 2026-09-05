"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeDollarSign,
  Briefcase,
  CircleDollarSign,
  Hourglass,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { StatTile } from "@/components/StatTile";
import { StatusBadge } from "@/components/StatusBadge";
import { Toolbar } from "@/components/shell/Toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useState } from "react";
import { useConnectWithToast, useWalletContext } from "@/contexts/WalletContext";
import { useTasks, type OnChainTask } from "@/hooks/useTasks";
import { getSessionClient, releaseFunds } from "@/lib/contract";
import { formatGEN, sameAddress, shortAddress, timeAgo } from "@/lib/utils";

function TaskRow({ task, cta }: { task: OnChainTask; cta?: React.ReactNode }) {
  return (
    <Link href={`/task/${task.contractAddress}`}>
      <div className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-black/20 px-3 py-2.5 transition-colors hover:border-[var(--line-strong)]">
        <StatusBadge status={task.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[var(--fg)]">{task.title}</p>
          <p className="font-mono text-[10px] text-[var(--faint)]">
            {shortAddress(task.contractAddress)} · posted {timeAgo(task.created_at)}
          </p>
        </div>
        <span className="font-mono text-xs font-semibold text-[var(--accent)]">{formatGEN(task.reward_amount)}</span>
        {cta}
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { network, address, isConnected } = useWalletContext();
  const connect = useConnectWithToast();
  const { tasks, loading, refresh } = useTasks();
  const [releasing, setReleasing] = useState<string | null>(null);

  const now = Math.floor(Date.now() / 1000);

  const mine = useMemo(() => {
    if (!address) return { created: [], working: [], releasable: [] };
    const created = tasks.filter((t) => sameAddress(t.creator, address));
    const working = tasks.filter((t) => sameAddress(t.worker, address));
    const releasable = tasks.filter(
      (t) =>
        !t.escrowReleased &&
        t.verified_at > 0 &&
        now >= t.verified_at + t.release_window &&
        (t.status === "verified" || t.status === "rejected")
    );
    return { created, working, releasable };
  }, [tasks, address, now]);

  const earned = mine.working
    .filter((t) => t.escrowReleased && t.status === "verified")
    .reduce((a, t) => a + t.reward_amount, 0);
  const atStake = mine.working
    .filter((t) => !t.escrowReleased && ["claimed", "submitted", "disputed", "verified"].includes(t.status))
    .reduce((a, t) => a + t.reward_amount, 0);
  const lockedByMe = mine.created.filter((t) => !t.escrowReleased).reduce((a, t) => a + t.reward_amount, 0);

  const release = async (contractAddress: string) => {
    if (!address) return;
    setReleasing(contractAddress);
    try {
      const client = getSessionClient(network, address);
      await releaseFunds(client, network, contractAddress);
      toast("success", "Escrow released", shortAddress(contractAddress));
      await refresh();
    } catch (err) {
      toast("error", "Release failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setReleasing(null);
    }
  };

  if (!isConnected) {
    return (
      <div>
        <Toolbar index="03" title="Dashboard" description="Your tasks, your claims, your escrow." />
        <div className="mx-auto max-w-md rounded-lg border border-dashed border-[var(--line-strong)] py-16 text-center">
          <Wallet className="mx-auto h-8 w-8 text-[var(--faint)]" />
          <p className="mt-4 text-sm text-[var(--muted)]">Connect MetaMask to see your dashboard.</p>
          <Button className="mt-5" onClick={() => void connect()}>
            <Wallet className="h-4 w-4" /> Connect MetaMask
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Toolbar index="03" title="Dashboard" description={`Signed in as ${shortAddress(address, 6)}`}>
        <Link href="/create">
          <Button variant="outline" size="sm">
            <CircleDollarSign className="h-3 w-3" /> New task
          </Button>
        </Link>
      </Toolbar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile index="D/01" label="Tasks I created" value={mine.created.length} icon={Briefcase} caption={`${formatGEN(lockedByMe)} still escrowed`} />
        <StatTile index="D/02" label="Tasks I'm working" value={mine.working.length} tone="violet" icon={Hourglass} caption={`${formatGEN(atStake)} at stake`} />
        <StatTile index="D/03" label="GEN earned" value={earned} suffix="GEN" tone="accent" icon={BadgeDollarSign} caption="verified & settled" />
        <StatTile index="D/04" label="Ready to release" value={mine.releasable.length} tone="amber" icon={ShieldCheck} caption="challenge window elapsed" />
      </div>

      {mine.releasable.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
          <Card>
            <CardHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">Settleable now</p>
              <Badge tone="accent">24h window elapsed</Badge>
            </CardHeader>
            <CardBody className="space-y-2">
              {mine.releasable.map((t) => (
                <TaskRow
                  key={t.contractAddress}
                  task={t}
                  cta={
                    <Button
                      size="sm"
                      loading={releasing === t.contractAddress}
                      onClick={(e) => {
                        e.preventDefault();
                        release(t.contractAddress);
                      }}
                    >
                      Release <ArrowRight className="h-3 w-3" />
                    </Button>
                  }
                />
              ))}
            </CardBody>
          </Card>
        </motion.div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Created by me</p>
            <Badge tone="neutral">{mine.created.length}</Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            {loading ? (
              <p className="font-mono text-xs text-[var(--faint)]">loading…</p>
            ) : mine.created.length === 0 ? (
              <p className="py-6 text-center font-mono text-xs text-[var(--faint)]">
                Nothing yet - fund your first task from the Create tab.
              </p>
            ) : (
              mine.created.map((t) => <TaskRow key={t.contractAddress} task={t} />)
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Claimed by me</p>
            <Badge tone="neutral">{mine.working.length}</Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            {loading ? (
              <p className="font-mono text-xs text-[var(--faint)]">loading…</p>
            ) : mine.working.length === 0 ? (
              <p className="py-6 text-center font-mono text-xs text-[var(--faint)]">
                Nothing claimed - grab an open task from the Board.
              </p>
            ) : (
              mine.working.map((t) => <TaskRow key={t.contractAddress} task={t} />)
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
