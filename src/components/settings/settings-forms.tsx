"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { OUTREACH_MODE_LABEL } from "@/lib/labels";
import {
  addIndustry,
  removeDemoData,
  resetDemoData,
  setIndustryActive,
  updateService,
  updateWorkspaceSettings,
  type ServiceInput,
  type WorkspaceSettingsInput,
} from "@/server/actions/settings";

const MODE_HELP: Record<string, string> = {
  draft_only: "AI researches and prepares messages. Nothing is ever sent.",
  human_approval: "AI drafts and schedules. A person approves every outbound message.",
  controlled_autonomy: "AI may send only through channels that are explicitly enabled, configured and permitted. The compliance gate still applies to every message.",
};

export function WorkspaceSettingsForm({ initial, disabled }: { initial: WorkspaceSettingsInput; disabled: boolean }) {
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof WorkspaceSettingsInput>(key: K, value: WorkspaceSettingsInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateWorkspaceSettings(form);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        });
      }}
    >
      <div className="flex items-start justify-between gap-4 rounded-lg border border-danger/30 bg-danger/5 p-3">
        <div>
          <Label htmlFor="kill-switch" className="text-sm font-medium">
            Outbound kill switch
          </Label>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            When on, no outbound message can be sent on any channel, whatever the mode or approvals. Use it to stop
            everything at once.
          </p>
        </div>
        <Switch id="kill-switch" checked={form.killSwitch} onCheckedChange={(v) => set("killSwitch", v)} disabled={disabled} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="outreach-mode" className="text-xs">
            Outreach mode
          </Label>
          <Select value={form.outreachMode} onValueChange={(v) => set("outreachMode", v)} disabled={disabled}>
            <SelectTrigger id="outreach-mode" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(OUTREACH_MODE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-relaxed text-muted-foreground">{MODE_HELP[form.outreachMode]}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="send-limit" className="text-xs">
            Daily send limit (all campaigns)
          </Label>
          <Input id="send-limit" type="number" min={0} max={500} value={form.dailySendLimit} onChange={(e) => set("dailySendLimit", e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="target" className="text-xs">
            Daily qualified-lead target
          </Label>
          <Input id="target" type="number" min={0} max={200} value={form.dailyQualifiedTarget} onChange={(e) => set("dailyQualifiedTarget", e.target.value)} disabled={disabled} />
          <p className="text-[11px] text-subtle">A guide only. Qualification rules never relax to reach it.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="retention" className="text-xs">
            Data retention (days)
          </Label>
          <Input id="retention" type="number" min={30} max={3650} value={form.dataRetentionDays} onChange={(e) => set("dataRetentionDays", e.target.value)} disabled={disabled} />
        </div>
      </div>

      {disabled ? (
        <p className="text-xs text-muted-foreground">Only workspace owners and admins can change these settings.</p>
      ) : (
        <Button type="submit" size="sm" disabled={pending || !dirty}>
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          Save settings
        </Button>
      )}
    </form>
  );
}

export function IndustryManager({
  industries,
  disabled,
}: {
  industries: Array<{ id: string; name: string; is_active: boolean; origin: string; companies: number }>;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        if (result.message) toast.success(result.message);
        after?.();
      } else toast.error(result.error ?? "Something went wrong.");
    });

  return (
    <div>
      <ul className="divide-y divide-border/60">
        {industries.map((industry) => (
          <li key={industry.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
            <span className="min-w-0">
              <span className={industry.is_active ? "text-sm" : "text-sm text-subtle line-through"}>{industry.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {industry.companies} compan{industry.companies === 1 ? "y" : "ies"}
              </span>
              {industry.origin === "discovered" ? <Pill tone="ai" className="ml-2">Discovered</Pill> : null}
            </span>
            {disabled ? null : industry.is_active ? (
              <Button variant="ghost" size="xs" className="text-muted-foreground" disabled={pending} onClick={() => run(() => setIndustryActive(industry.id, false))}>
                <Trash2 />
                Remove
              </Button>
            ) : (
              <Button variant="ghost" size="xs" disabled={pending} onClick={() => run(() => setIndustryActive(industry.id, true))}>
                <RotateCcw />
                Restore
              </Button>
            )}
          </li>
        ))}
      </ul>
      {disabled ? null : (
        <form
          className="mt-3 flex items-center gap-2 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => addIndustry(name), () => setName(""));
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an industry" aria-label="New industry name" maxLength={80} className="h-8 text-sm" />
          <Button type="submit" size="sm" variant="outline" disabled={pending || name.trim().length < 2}>
            <Plus />
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

export function ServiceEditDialog({ initial }: { initial: ServiceInput }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ServiceInput>(key: K, value: ServiceInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const number = (key: "priceMin" | "priceMax" | "weeksMin" | "weeksMax" | "implementationCost", label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`svc-${key}`} className="text-xs">
        {label}
      </Label>
      <Input id={`svc-${key}`} type="number" min={0} value={form[key]} onChange={(e) => set(key, e.target.value)} />
    </div>
  );
  const area = (key: "description" | "idealCustomerProfile" | "problemsSolved" | "deliverables" | "supportOptions", label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`svc-${key}`} className="text-xs">
        {label}
      </Label>
      <Textarea id={`svc-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} rows={3} maxLength={4000} />
      {hint ? <p className="text-[11px] text-subtle">{hint}</p> : null}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setForm(initial);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="xs">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit service</DialogTitle>
          <DialogDescription>
            The reply agent and outreach drafts may only quote what is recorded here. Leave a price blank rather than
            guessing.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await updateService(form);
              if (result.ok) {
                toast.success(result.message);
                setOpen(false);
              } else setError(result.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="svc-name" className="text-xs">
              Service name
            </Label>
            <Input id="svc-name" value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} />
          </div>
          {area("description", "Description")}
          {area("idealCustomerProfile", "Ideal customer profile")}
          <div className="grid gap-3 sm:grid-cols-2">
            {area("problemsSolved", "Problems it solves", "One per line.")}
            {area("deliverables", "Typical deliverables", "One per line.")}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {number("priceMin", "Starting price from (₹)")}
            {number("priceMax", "Starting price to (₹)")}
            {number("implementationCost", "Est. implementation cost (₹)")}
            {number("weeksMin", "Delivery from (weeks)")}
            {number("weeksMax", "Delivery to (weeks)")}
          </div>
          {area("supportOptions", "Recurring support options", "One per line.")}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
              Active in matching
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.reviewed} onCheckedChange={(v) => set("reviewed", v)} />
              I have reviewed these commercial details
            </label>
          </div>
          {error ? (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              Save service
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DemoDataControls({ hasDemoData, demoMode }: { hasDemoData: boolean; demoMode: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"reset" | "remove" | null>(null);

  const run = (kind: "reset" | "remove") =>
    startTransition(async () => {
      const result = kind === "reset" ? await resetDemoData() : await removeDemoData();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      setConfirm(null);
    });

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {hasDemoData
          ? "This workspace contains synthetic companies, contacts, signals, conversations and workflow runs. They are flagged as demo records everywhere they appear, and are never mixed into exports without that flag."
          : "This workspace has no synthetic data."}
      </p>
      <div className="flex flex-wrap gap-2">
        {demoMode ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm("reset")}>
            <RotateCcw />
            {hasDemoData ? "Reset demo data" : "Load demo data"}
          </Button>
        ) : null}
        {hasDemoData ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm("remove")}>
            <Trash2 />
            Remove demo data
          </Button>
        ) : null}
      </div>
      {!demoMode ? <p className="text-xs text-subtle">Loading demo data is disabled because demo mode is off.</p> : null}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "reset" ? "Reset demo data?" : "Remove demo data?"}</DialogTitle>
            <DialogDescription>
              {confirm === "reset"
                ? "Every synthetic record is deleted and a fresh synthetic dataset is generated with dates relative to today. Records you created yourself are not touched."
                : "Every synthetic record is permanently deleted. Records you created yourself are not touched. Dashboards will be empty until real data exists."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant={confirm === "remove" ? "destructive" : "default"} disabled={pending} onClick={() => confirm && run(confirm)}>
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              {confirm === "reset" ? "Reset" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
