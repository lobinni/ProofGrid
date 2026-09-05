"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  EyeOff,
  FileSearch,
  Flag,
  Hourglass,
  Link2,
  Lock,
  ShieldCheck,
  Undo2,
  UserCheck,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { VerificationProgress } from "@/components/VerificationProgress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useConnectWithToast, useWalletContext } from "@/contexts/WalletContext";
import {
  PRIVATE_EVIDENCE,
  activateTask,
  cancelTask,
  claimTask,
  expireTask,
  disputeTask,
  getEscrowStatus,
  getReadOnlyClient,
  getSessionClient,
  getSettlementStatus,
  getTaskState,
  releaseFunds,
  reclaimUnresolved,
  requestVerification,
  submitWork,
  type ContractTaskState,
  type EscrowStatus,
  type VerificationResult,
} from "@/lib/contract";
import { cn, formatCountdown, formatDateTime, formatGEN, sameAddress, shortAddress, timeAgo } from "@/lib/utils";

function Party({ label, address, highlight }: { label: string; address: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded border border-[var(--line)] bg-black/20 px-3 py-2.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">{label}</span>
      {address ? (
        <span className={cn("font-mono text-xs", highlight ? "text-[var(--accent)]" : "text-[var(--muted)]")}>
          {shortAddress(address, 6)}
          {highlight && " · you"}
        </span>
      ) : (
        <span className="font-mono text-xs text-[var(--faint)]">—</span>
      )}
    </div>
  );
}

export default function TaskDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: taskAddress } = use(params);
  const router = useRouter();
  const { network, address, isConnected } = useWalletContext();
  const connect = useConnectWithToast();

  const [task, setTask] = useState<ContractTaskState | null>(null);
  const [escrow, setEscrow] = useState<EscrowStatus>({
    lockedAmount: 0,
    released: false,
    paidTo: "",
    creator: "",
    createdAt: 0,
    active: false,
  });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  // 1s ticker drives the escrow countdown.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const client = getReadOnlyClient(network);
    let esc: EscrowStatus | null = null;
    let factoryPending = false;
    try {
      const [escrowState, settlement] = await Promise.all([
        getEscrowStatus(network, taskAddress),
        getSettlementStatus(network, taskAddress),
      ]);
      esc = escrowState;
      setEscrow(escrowState);
      factoryPending = settlement?.reason === "pending" && !settlement.released;
    } catch {
      // If even the factory has no record, this address belongs elsewhere.
    }

    try {
      const state = await getTaskState(client, taskAddress, address ?? undefined);
      setTask(state);
      setPending(factoryPending);
      setNotFound(false);
    } catch {
      setTask(null);
      const factoryKnowsIt = !!esc && (esc.lockedAmount > 0 || esc.creator !== "" || esc.released);
      setPending(factoryPending || factoryKnowsIt);
      setNotFound(!factoryPending && !factoryKnowsIt);
    } finally {
      setLoading(false);
    }
  }, [network, taskAddress, address]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const verdict = useMemo<VerificationResult | null>(() => {
    if (!task?.verification_result) return null;
    try {
      return JSON.parse(task.verification_result) as VerificationResult;
    } catch {
      return null;
    }
  }, [task]);

  // Use the chain-provided clock for task lifecycle displays, advancing it
  // locally between refreshes. Contract guards independently enforce the same
  // canonical time source, so browser clock skew cannot authorize an action.
  const now = task?.chain_time ? task.chain_time + tick : Math.floor(Date.now() / 1000);
  const isCreator = sameAddress(address, task?.creator);
  const isWorker = sameAddress(address, task?.worker);
  const releaseWindow = task?.release_window || 86400;
  const releaseAt = task && task.verified_at > 0 ? task.verified_at + releaseWindow : 0;
  const releaseReady = !!task && !escrow.released && releaseAt > 0 && now >= releaseAt;
  const windowProgress =
    releaseAt > 0 ? Math.min(1, Math.max(0, (now - (releaseAt - releaseWindow)) / releaseWindow)) : 0;
  const decided = task?.status === "verified" || task?.status === "rejected";
  const deadlinePassed = !!task && now > task.deadline;
  const terminalRefund = task?.status === "cancelled" || task?.status === "expired";
  const settleable = terminalRefund || releaseReady;
  const canExpire = !!task && deadlinePassed && (task.status === "open" || task.status === "claimed");

  const act = async (key: string, fn: (client: import("@/lib/contract").ChainClient) => Promise<unknown>, success: string) => {
    if (!address) return;
    setBusy(key);
    try {
      const client = getSessionClient(network, address);
      await fn(client);
      toast("success", success);
      await load();
    } catch (err) {
      toast("error", `${key} failed`, err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-48" />
          <Skeleton className="h-40" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-52" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (pending) {
    const isPendingCreator = sameAddress(address, escrow.creator);
    const reclaimAt = escrow.createdAt > 0 ? escrow.createdAt + 7 * 86400 : 0;
    const reclaimReady = reclaimAt > 0 && now >= reclaimAt;

    return (
      <div className="mx-auto max-w-xl py-16">
        <Card>
          <CardHeader>
            <div>
              <p className="text-base font-semibold text-[var(--fg)]">Task deployment pending</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                The factory is holding the reward, but the task contract is not readable yet and has not been added to the public board.
              </p>
            </div>
            <Badge tone={escrow.released ? "accent" : "amber"}>
              {escrow.released ? "Refunded" : "Reward secured"}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="rounded-md border border-[var(--line)] bg-black/20 p-4">
              <p className="text-2xl font-bold text-[var(--accent)]">{formatGEN(escrow.lockedAmount)}</p>
              <p className="mt-1 break-all text-xs text-[var(--faint)]">{taskAddress}</p>
            </div>

            {!isConnected ? (
              <Button className="w-full" onClick={() => void connect()}>
                <Wallet className="h-4 w-4" /> Connect MetaMask
              </Button>
            ) : isPendingCreator && !escrow.released ? (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  loading={busy === "Activate"}
                  onClick={() => act("Activate", (c) => activateTask(c, network, taskAddress), "Task activated")}
                >
                  <Zap className="h-4 w-4" /> Retry activation
                </Button>
                <Button
                  variant="danger"
                  className="w-full"
                  loading={busy === "Reclaim"}
                  disabled={!reclaimReady}
                  onClick={() => act("Reclaim", (c) => reclaimUnresolved(c, network, taskAddress), "Reward reclaimed")}
                >
                  <Undo2 className="h-4 w-4" /> Reclaim reward
                </Button>
                <p className="text-center text-xs text-[var(--faint)]">
                  {reclaimReady
                    ? "The safety period has elapsed. Reclaim succeeds only if the task contract is still unreachable."
                    : reclaimAt > 0
                      ? `Safety reclaim available ${formatCountdown(reclaimAt)}.`
                      : "This factory does not expose a safety reclaim timestamp."}
                </p>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                Only the wallet that created this pending task can activate it or reclaim its reward.
              </p>
            )}

            <Button variant="ghost" className="w-full" onClick={() => router.push("/")}>
              Back to board
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (notFound || !task) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <FileSearch className="mx-auto h-8 w-8 text-[var(--faint)]" />
        <h1 className="mt-4 text-xl font-bold">Task not on this network</h1>
        <p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">{taskAddress}</p>
        <p className="mt-2 text-xs text-[var(--faint)]">It may live on another network - switch from the badge above.</p>
        <Button variant="outline" className="mt-6" onClick={() => router.push("/")}>
          Back to board
        </Button>
      </div>
    );
  }

  const evidencePrivate = task.submission_url === PRIVATE_EVIDENCE;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      {/* LEFT */}
      <div className="space-y-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardBody className="pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <Badge tone="neutral">{task.category_other || task.category}</Badge>
                <Badge tone={task.priority === "Critical" ? "danger" : task.priority === "High" ? "amber" : "neutral"}>
                  {task.priority}
                </Badge>
                <span className="flex-1" />
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(taskAddress);
                    toast("info", "Address copied", taskAddress);
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded border border-[var(--line)] px-2 py-1 font-mono text-[10px] text-[var(--faint)] transition-colors hover:text-[var(--fg)]"
                >
                  <Copy className="h-3 w-3" /> {shortAddress(taskAddress, 6)}
                </button>
              </div>
              <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight">{task.title}</h1>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{task.description}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Effort", value: task.estimated_effort },
                  { label: "Format", value: task.submission_format_other || task.submission_format },
                  { label: "Posted", value: timeAgo(task.created_at) },
                  { label: "Deadline", value: formatCountdown(task.deadline), warn: deadlinePassed },
                ].map((m) => (
                  <div key={m.label} className="rounded border border-[var(--line)] bg-black/20 px-2.5 py-2">
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--faint)]">{m.label}</p>
                    <p className={cn("mt-0.5 text-xs font-medium", m.warn ? "text-[var(--danger)]" : "text-[var(--fg)]")}>
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--violet)]">Rubric · what validators judge</p>
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--fg)]/90">{task.criteria}</p>
            </CardBody>
          </Card>
        </motion.div>

        {/* Evidence */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-[var(--muted)]">Submitted work</p>
              {evidencePrivate ? <Badge tone="violet">Private</Badge> : task.submission_url ? <Badge tone="accent">Submitted</Badge> : <Badge tone="neutral">Not yet</Badge>}
            </CardHeader>
            <CardBody>
              {evidencePrivate ? (
                <div className="flex items-start gap-3 rounded-md border border-[var(--violet)]/25 bg-[var(--violet)]/5 p-4">
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--violet)]" />
                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    This task has already been taken by another contributor. The work they submitted
                    is private between them and the task creator.
                  </p>
                </div>
              ) : task.submission_url ? (
                <div className="space-y-3">
                  <a
                    href={task.submission_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 break-all rounded border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2.5 font-mono text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" /> {task.submission_url}
                    <ExternalLink className="ml-auto h-3 w-3 shrink-0" />
                  </a>
                  {task.submission_note && (
                    <p className="rounded border border-[var(--line)] bg-black/20 px-3 py-2.5 text-xs leading-relaxed text-[var(--muted)]">
                      {task.submission_note}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-[var(--faint)]">
                  Nothing has been submitted yet. Once work is sent in it cannot be changed.
                </p>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Verdict */}
        {(busy === "Verify" || busy === "Submit" || verdict || task.status === "disputed") && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="space-y-3">
            <VerificationProgress
              active={busy === "Verify" || busy === "Submit"}
              result={verdict}
              disputeReason={task.status === "disputed" ? task.dispute_reason : undefined}
            />
            {verdict && (
              <Card>
                <CardHeader>
                  <p className="text-sm font-medium text-[var(--muted)]">Review decision</p>
                  <Badge tone={task.status === "disputed" ? "amber" : verdict.verified ? "accent" : "danger"}>
                    {task.status === "disputed" ? "Review requested" : verdict.verified ? "Accepted" : "Not accepted"}
                  </Badge>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        className={cn("h-full rounded-full", verdict.verified ? "bg-[var(--accent)]" : "bg-[var(--danger)]")}
                        initial={{ width: 0 }}
                        animate={{ width: `${verdict.confidence}%` }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                      />
                    </div>
                    <span className="font-mono text-sm font-bold text-[var(--fg)]">{verdict.confidence}%</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--muted)]">{verdict.reasoning}</p>
                  {task.dispute_count > 0 && (
                    <div className="rounded border border-[var(--amber)]/30 bg-[var(--amber)]/5 px-3 py-2.5">
                      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--amber)]">
                        <Flag className="h-3 w-3" /> Dispute #{task.dispute_count}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{task.dispute_reason}</p>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}
          </motion.div>
        )}
      </div>

      {/* RIGHT */}
      <div className="space-y-4">
        {/* Escrow */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-[var(--amber)]">Reward</p>
              {escrow.released ? <Badge tone="accent">Paid</Badge> : <Badge tone="amber">Secured</Badge>}
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="rounded-md border border-[var(--line)] bg-black/30 p-4 text-center">
                <p className="text-xs text-[var(--faint)]">
                  {escrow.released ? "Reward paid" : "Reward secured"}
                </p>
                <p className={cn("mt-1 text-3xl font-bold tracking-tight", escrow.released ? "text-[var(--muted)] line-through decoration-2" : "text-[var(--accent)]")}>
                  {formatGEN(task.reward_amount)}
                </p>
              </div>

              {!escrow.released && terminalRefund && (
                <p className="rounded border border-[var(--line)] bg-black/20 px-3 py-2.5 text-xs leading-relaxed text-[var(--muted)]">
                  {task.status === "cancelled"
                    ? "This task was withdrawn before anyone claimed it. The reward returns to the creator — anyone can complete the refund."
                    : "This task passed its deadline without an accepted submission. The reward returns to the creator — anyone can complete the refund."}
                </p>
              )}

              {!escrow.released && decided && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--faint)]">Challenge window</span>
                    <span className={releaseReady ? "text-[var(--accent)]" : "text-[var(--amber)]"}>
                      {releaseReady ? "Ready to pay out" : `${formatCountdown(releaseAt)} to go`}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={cn("h-full rounded-full transition-all duration-1000", releaseReady ? "bg-[var(--accent)]" : "bg-[var(--amber)]")}
                      style={{ width: `${windowProgress * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                    {releaseReady
                      ? task.status === "verified"
                        ? "The verdict stood unchallenged. Anyone can now release the reward to the worker."
                        : "The verdict stood unchallenged. Anyone can now refund the reward to the creator."
                      : task.status === "verified"
                        ? "Work accepted. The reward unlocks for the worker once this window ends — either party can dispute before then."
                        : "Work rejected. The reward returns to the creator once this window ends — either party can dispute before then."}
                  </p>
                </div>
              )}

              {!escrow.released && task.status === "disputed" && (
                <p className="rounded border border-[var(--amber)]/30 bg-[var(--amber)]/5 px-3 py-2 text-xs leading-relaxed text-[var(--amber)]">
                  Payout frozen by an active dispute. Run verification again to settle it.
                </p>
              )}

              {settleable && !escrow.released && (
                <Button
                  className="w-full"
                  loading={busy === "Release"}
                  onClick={() =>
                    act(
                      "Release",
                      (c) => releaseFunds(c, network, taskAddress),
                      task.status === "verified" ? "Reward released to the worker" : "Reward refunded to the creator"
                    )
                  }
                >
                  <ShieldCheck className="h-4 w-4" />
                  {task.status === "verified" ? "Release reward to worker" : "Refund reward to creator"}
                </Button>
              )}

              <p className="text-[11px] leading-relaxed text-[var(--faint)]">
                {task.status === "verified"
                  ? "Verified verdict: pays the worker."
                  : task.status === "rejected"
                    ? "Rejected verdict: refunds the creator."
                    : "Paid by verdict once a decision stands 24h."}
 Anyone can complete the payout once the challenge window has ended.
              </p>
            </CardBody>
          </Card>
        </motion.div>

        {/* Parties */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Parties</p>
            </CardHeader>
            <CardBody className="space-y-2">
              <Party label="Creator" address={task.creator} highlight={isCreator} />
              <Party label="Worker" address={task.worker} highlight={isWorker} />
            </CardBody>
          </Card>
        </motion.div>

        {/* Actions */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <Card>
            <CardHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Actions</p>
            </CardHeader>
            <CardBody className="space-y-2.5">
              {!isConnected && (
                <Button className="w-full" onClick={() => void connect()}>
                  <Wallet className="h-4 w-4" /> Connect MetaMask to interact
                </Button>
              )}

              {isConnected && task.status === "open" && !isCreator && !deadlinePassed && (
                <Button className="w-full" loading={busy === "Claim"} onClick={() => act("Claim", (c) => claimTask(c, taskAddress), "Task claimed - you are the worker")}>
                  <UserCheck className="h-4 w-4" /> Claim this task
                </Button>
              )}

              {isConnected && task.status === "open" && deadlinePassed && (
                <p className="flex items-center gap-2 rounded border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-xs text-[var(--danger)]">
                  <CalendarClock className="h-3.5 w-3.5" /> Deadline passed - claiming disabled.
                </p>
              )}

              {isConnected && isWorker && task.status === "claimed" && (
                <>
                  <Button className="w-full" loading={busy === "Submit"} onClick={() => setSubmitOpen(true)}>
                    <Link2 className="h-4 w-4" /> Submit work for review
                  </Button>
                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--muted)]">
                    <BrainCircuit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--violet)]" />
                    Submitting runs AI verification in the same transaction: validators fetch your
                    evidence, judge it against the rubric, and return an accept or reject verdict.
                  </p>
                </>
              )}

              {isConnected && (isCreator || isWorker) && (task.status === "submitted" || task.status === "disputed") && (
                <Button
                  variant="violet"
                  className="w-full"
                  loading={busy === "Verify"}
                  onClick={() => act("Verify", (c) => requestVerification(c, taskAddress), "Consensus reached - verdict recorded")}
                >
                  <BrainCircuit className="h-4 w-4" />
                  {task.status === "disputed" ? "Re-run AI verification" : "Retry AI verification"}
                </Button>
              )}

              {canExpire && (
                <Button
                  variant="outline"
                  className="w-full"
                  loading={busy === "Expire"}
                  onClick={() => act("Expire", (c) => expireTask(c, taskAddress), "Task retired - the reward can now be refunded")}
                >
                  <CalendarClock className="h-4 w-4" /> Retire expired task
                </Button>
              )}

              {terminalRefund && !escrow.released && (
                <Button
                  className="w-full"
                  loading={busy === "Release"}
                  onClick={() => act("Release", (c) => releaseFunds(c, network, taskAddress), "Reward refunded to the creator")}
                >
                  <ShieldCheck className="h-4 w-4" /> Refund reward to creator
                </Button>
              )}

              {isCreator && !escrow.released && (
                <button
                  onClick={() =>
                    act("Reclaim", (c) => reclaimUnresolved(c, network, taskAddress), "Reward reclaimed")
                  }
                  className="w-full cursor-pointer text-left text-[11px] leading-relaxed text-[var(--faint)] underline-offset-2 hover:underline"
                >
                  Task stuck and unreachable? Reclaim the reward (available 7 days after creation).
                </button>
              )}

              {decided && !escrow.released && (
                <>
                  {releaseReady ? (
                    <Button
                      className="w-full"
                      loading={busy === "Release"}
                      onClick={() =>
                        act(
                          "Release",
                          (c) => releaseFunds(c, network, taskAddress),
                          task.status === "verified" ? "Reward released to the worker" : "Reward refunded to the creator"
                        )
                      }
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {task.status === "verified" ? "Release reward to worker" : "Refund reward to creator"}
                    </Button>
                  ) : (
                    <p className="flex items-start gap-2 rounded border border-[var(--line)] bg-black/20 px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
                      <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--amber)]" />
                      Next step: wait out the challenge window ({formatCountdown(releaseAt)}). After that
                      anyone can settle the escrow — no further action is needed from you unless you
                      want to dispute the verdict.
                    </p>
                  )}
                  {isConnected && (isCreator || isWorker) && (
                    <Button variant="outline" className="w-full" onClick={() => setDisputeOpen(true)}>
                      <Flag className="h-4 w-4" /> Dispute this verdict
                    </Button>
                  )}
                </>
              )}

              {isConnected && isCreator && (task.status === "open" || task.status === "claimed") && (
                <Button variant="ghost" className="w-full" loading={busy === "Cancel"} onClick={() => act("Cancel", (c) => cancelTask(c, taskAddress), "Task reopened")}>
                  <Undo2 className="h-4 w-4" /> {task.status === "claimed" ? "Remove worker & reopen" : "Cancel task"}
                </Button>
              )}

              {!isCreator && !isWorker && task.status === "claimed" && (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--muted)]">
                  <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--amber)]" />
                  This task has already been taken by another contributor and is no longer available
                  to claim.
                </p>
              )}

              {!isCreator && !isWorker && task.status !== "open" && task.status !== "claimed" && (
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  This task has already been taken by another contributor. You can follow its status
                  and reward here, but the submitted work stays private.
                </p>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Timeline */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <Card>
            <CardHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Lifecycle</p>
            </CardHeader>
            <CardBody>
              <ol className="space-y-3">
                {[
                  { done: true, label: "Funded & posted", detail: formatDateTime(task.created_at), icon: Zap },
                  { done: !!task.worker, label: task.worker ? "Claimed" : "Awaiting worker", detail: task.worker ? shortAddress(task.worker) : "open slot", icon: UserCheck },
                  { done: !!task.submission_url, label: task.submission_url ? "Work submitted" : "Awaiting submission", detail: task.submission_url ? "evidence locked" : `due ${formatDateTime(task.deadline)}`, icon: Link2 },
                  { done: task.verified_at > 0 || !!verdict, label: verdict ? `Verdict: ${verdict.verified ? "verified" : "rejected"}` : "Awaiting AI verdict", detail: task.verified_at > 0 ? formatDateTime(task.verified_at) : task.status === "disputed" ? "under dispute" : "—", icon: verdict ? (verdict.verified ? CheckCircle2 : XCircle) : BrainCircuit },
                  { done: escrow.released, label: escrow.released ? "Escrow settled" : releaseAt > 0 ? "Challenge window" : "Escrow locked", detail: escrow.released ? "complete" : releaseAt > 0 ? (releaseReady ? "settleable now" : formatCountdown(releaseAt)) : `${formatGEN(task.reward_amount)} held`, icon: escrow.released ? BadgeCheck : Lock },
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", step.done ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--faint)]")}>
                      <step.icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs font-medium", step.done ? "text-[var(--fg)]" : "text-[var(--muted)]")}>{step.label}</p>
                      <p className="font-mono text-[10px] text-[var(--faint)]">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </motion.div>
      </div>

      {/* Submit dialog */}
      <Dialog
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit work for review"
        subtitle={`Format expected: ${task.submission_format_other || task.submission_format} · locks permanently, then AI validators rule on it`}
      >
        <div className="space-y-4">
          <Field label="Evidence URL">
            <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://…" />
          </Field>
          {task.submission_format === "GitHub Repository" && (
            <p className="rounded border border-[var(--info)]/30 bg-[var(--info)]/5 px-3 py-2 font-mono text-[11px] text-[var(--info)]">
              The contract asserts the URL contains github.com.
            </p>
          )}
          <Field label="Note for the validators" hint="optional but recommended">
            <Textarea value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} placeholder="What did you build? Point reviewers at rubric items…" rows={3} />
          </Field>
          <p className="flex items-start gap-2 rounded border border-[var(--violet)]/30 bg-[var(--violet)]/5 px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
            <BrainCircuit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--violet)]" />
            Independent validators will fetch this URL, compare it against the rubric and reach
            consensus on a verdict. Accepted work releases the escrow to you after the 24h challenge
            window; a rejection can be disputed for a fresh review.
          </p>
          <Button
            className="w-full"
            loading={busy === "Submit"}
            disabled={!/^https?:\/\/.+/.test(evidenceUrl.trim())}
            onClick={async () => {
              await act(
                "Submit",
                (c) => submitWork(c, taskAddress, evidenceUrl.trim(), evidenceNote.trim()),
                "Submitted - AI verdict recorded"
              );
              setSubmitOpen(false);
            }}
          >
            <BrainCircuit className="h-4 w-4" /> Submit & run AI verification
          </Button>
        </div>
      </Dialog>

      {/* Dispute dialog */}
      <Dialog open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Dispute the verdict" subtitle="Freezes escrow · your reason is fed into the re-review">
        <div className="space-y-4">
          <Field label="Why is the verdict wrong?" hint="min 8 chars">
            <Textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="Cite the rubric clause and what the validators missed…" rows={4} />
          </Field>
          <Button
            variant="danger"
            className="w-full"
            loading={busy === "Dispute"}
            disabled={disputeReason.trim().length < 8}
            onClick={async () => {
              await act("Dispute", (c) => disputeTask(c, taskAddress, disputeReason.trim()), "Dispute filed - escrow frozen");
              setDisputeOpen(false);
              setDisputeReason("");
            }}
          >
            <Flag className="h-4 w-4" /> File dispute
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
