"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CircleDollarSign, Hourglass, Lock, ShieldCheck, Wallet, Zap } from "lucide-react";
import { Toolbar } from "@/components/shell/Toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useConnectWithToast, useWalletContext } from "@/contexts/WalletContext";
import { createTaskViaFactory, getSessionClient } from "@/lib/contract";
import { formatGEN } from "@/lib/utils";

const CATEGORIES = ["Engineering", "Design", "Security", "Documentation", "Localization", "Media", "Research", "Data", "Other"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const EFFORTS = ["~2 hours", "1 day", "1-2 days", "2-4 days", "3-5 days", "1 week+"];
const FORMATS = ["GitHub Repository", "Live URL", "Video URL", "Report URL", "Document URL", "Other"];

const GUIDE = `e.g. Public repo with README; all three endpoints implemented; tests green on CI; deploy URL attached.`;

export default function CreateTaskPage() {
  const router = useRouter();
  const { network, address, isConnected } = useWalletContext();
  const connect = useConnectWithToast();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [categoryOther, setCategoryOther] = useState("");
  const [priority, setPriority] = useState(PRIORITIES[1]);
  const [effort, setEffort] = useState(EFFORTS[1]);
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [format, setFormat] = useState(FORMATS[0]);
  const [formatOther, setFormatOther] = useState("");
  const [reward, setReward] = useState("100");
  const [deadlineLocal, setDeadlineLocal] = useState(() => {
    const d = new Date(Date.now() + 5 * 86400000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);

  const rewardNum = useMemo(() => Math.max(0, Math.floor(Number(reward) || 0)), [reward]);
  const deadlineUnix = useMemo(() => Math.floor(new Date(deadlineLocal).getTime() / 1000), [deadlineLocal]);
  const deadlineValid = deadlineUnix > Math.floor(Date.now() / 1000);

  const ready =
    isConnected &&
    title.trim().length >= 4 &&
    description.trim().length >= 16 &&
    criteria.trim().length >= 16 &&
    rewardNum > 0 &&
    deadlineValid &&
    (category !== "Other" || categoryOther.trim().length > 0) &&
    (format !== "Other" || formatOther.trim().length > 0);

  const create = async () => {
    if (!address || !ready) return;
    setBusy(true);
    try {
      const client = getSessionClient(network, address);
      const taskAddress = await createTaskViaFactory(client, network, {
        title: title.trim(),
        category,
        categoryOther: category === "Other" ? categoryOther.trim() : "",
        priority,
        estimatedEffort: effort,
        description: description.trim(),
        criteria: criteria.trim(),
        submissionFormat: format,
        submissionFormatOther: format === "Other" ? formatOther.trim() : "",
        rewardAmount: rewardNum,
        deadlineUnixSeconds: deadlineUnix,
      });
      toast("success", "Task deployed & funded", `${rewardNum} GEN locked in escrow at ${taskAddress.slice(0, 10)}…`);
      router.push(`/task/${taskAddress}`);
    } catch (err) {
      toast("error", "Task creation failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Toolbar
        index="02"
        title="Create a task"
        description="Define the work, write the rubric the validators will judge by, and fund the escrow in one move."
      />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">01 · The work</p>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field label="Title" hint="min 4 chars">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build a realtime leaderboard component" maxLength={120} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                {category === "Other" ? (
                  <Field label="Custom category">
                    <Input value={categoryOther} onChange={(e) => setCategoryOther(e.target.value)} placeholder="e.g. DevRel" maxLength={32} />
                  </Field>
                ) : (
                  <Field label="Priority">
                    <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                      {PRIORITIES.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
              {category === "Other" && (
                <Field label="Priority">
                  <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    {PRIORITIES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Description" hint="min 16 chars">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Scope, context, links to specs or repos…" rows={4} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--violet)]">02 · The rubric</p>
              <Badge tone="violet">judged by AI consensus</Badge>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field label="Acceptance criteria">
                <Textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={GUIDE} rows={4} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Evidence format">
                  <Select value={format} onChange={(e) => setFormat(e.target.value)}>
                    {FORMATS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Estimated effort">
                  <Select value={effort} onChange={(e) => setEffort(e.target.value)}>
                    {EFFORTS.map((e2) => (
                      <option key={e2}>{e2}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              {format === "Other" && (
                <Field label="Custom format">
                  <Input value={formatOther} onChange={(e) => setFormatOther(e.target.value)} placeholder="e.g. Figma link" maxLength={48} />
                </Field>
              )}
              {format === "GitHub Repository" && (
                <p className="rounded border border-[var(--info)]/30 bg-[var(--info)]/5 px-3 py-2 font-mono text-[11px] text-[var(--info)]">
                  Deterministic check: the contract rejects any evidence URL that is not on github.com.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--amber)]">03 · Reward & deadline</p>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Reward (GEN)" hint="locked immediately">
                <Input type="number" min={1} value={reward} onChange={(e) => setReward(e.target.value)} />
              </Field>
              <Field label="Deadline">
                <Input type="datetime-local" value={deadlineLocal} onChange={(e) => setDeadlineLocal(e.target.value)} />
              </Field>
              {!deadlineValid && (
                <p className="sm:col-span-2 rounded border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 font-mono text-[11px] text-[var(--danger)]">
                  Deadline must be in the future - the child constructor asserts it.
                </p>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Sticky summary */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="sticky top-32">
            <CardHeader>
              <p className="text-sm font-medium text-[var(--muted)]">Reward summary</p>
              <Badge tone="amber">Secured</Badge>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="rounded-md border border-[var(--line)] bg-black/30 p-4 text-center">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--faint)]">You are locking</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-[var(--accent)]">{formatGEN(rewardNum)}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Sent once and held securely until the task is settled</p>
              </div>
              <ul className="space-y-2.5 text-xs text-[var(--muted)]">
                {[
                  { icon: Lock, text: "Escrow locks the moment the task deploys." },
                  { icon: ShieldCheck, text: "Released only after a verdict stands 24h undisputed." },
                  { icon: Hourglass, text: "Rejected verdicts refund you; verified pays the worker." },
                ].map((row, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <row.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    {row.text}
                  </li>
                ))}
              </ul>
              {!isConnected ? (
                <Button className="w-full" onClick={() => void connect()}>
                  <Wallet className="h-4 w-4" /> Connect MetaMask
                </Button>
              ) : (
                <Button className="w-full" onClick={create} loading={busy} disabled={!ready}>
                  <CircleDollarSign className="h-4 w-4" />
                  {busy ? "Deploying…" : `Fund & deploy · ${formatGEN(rewardNum)}`}
                </Button>
              )}
              {isConnected && !ready && (
                <p className="text-center font-mono text-[10px] text-[var(--faint)]">
                  complete all fields to deploy
                </p>
              )}
              <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--faint)]">
                <Zap className="h-3 w-3 text-[var(--accent)]" /> gasless on this network
              </p>
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
