"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OPPORTUNITY_STAGE_LABEL } from "@/lib/labels";
import { changeOpportunityStage, createOpportunity, type OpportunityInput } from "@/server/actions/opportunities";

type Stage = keyof typeof OPPORTUNITY_STAGE_LABEL;
const NONE = "__none";

/** Stage picker. Closing a deal as won or lost asks for the facts analytics depends on. */
export function StageSelect({ id, stage, title }: { id: string; stage: Stage; title: string }) {
  const [pending, startTransition] = useTransition();
  const [closing, setClosing] = useState<"won" | "lost" | null>(null);
  const [revenue, setRevenue] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (next: Stage, extra: { collectedRevenue?: string; deliveryCost?: string; lostReason?: string } = {}) =>
    startTransition(async () => {
      const result = await changeOpportunityStage({ id, stage: next, ...extra });
      if (result.ok) {
        if (result.message) toast.success(result.message);
        setClosing(null);
        setError(null);
      } else if (closing) setError(result.error);
      else toast.error(result.error);
    });

  return (
    <>
      <Select
        value={stage}
        disabled={pending}
        onValueChange={(value) => {
          const next = value as Stage;
          if (next === "won" || next === "lost") {
            setError(null);
            setClosing(next);
          } else submit(next);
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label={`Stage for ${title}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(OPPORTUNITY_STAGE_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={closing !== null} onOpenChange={(open) => !open && setClosing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{closing === "won" ? "Mark as won" : "Mark as lost"}</DialogTitle>
            <DialogDescription>
              {closing === "won"
                ? "Record what has actually been collected and what delivery cost. Revenue and gross profit reports use these figures, never the estimate."
                : "Record why this was lost. The reason feeds industry and channel analysis."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (closing === "won") submit("won", { collectedRevenue: revenue, deliveryCost: cost });
              if (closing === "lost") submit("lost", { lostReason: reason });
            }}
          >
            {closing === "won" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`rev-${id}`} className="text-xs">
                    Collected revenue (₹)
                  </Label>
                  <Input id={`rev-${id}`} type="number" min={0} value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`cost-${id}`} className="text-xs">
                    Delivery cost (₹)
                  </Label>
                  <Input id={`cost-${id}`} type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor={`reason-${id}`} className="text-xs">
                  Reason
                </Label>
                <Textarea id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} required />
              </div>
            )}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setClosing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : null}
                Confirm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const EMPTY: OpportunityInput = { companyId: "", serviceId: "", title: "", estimatedValue: "", problemHypothesis: "" };

export function NewOpportunityDialog({
  companies,
  services,
}: {
  companies: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OpportunityInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof OpportunityInput>(key: K, value: OpportunityInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setForm(EMPTY);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          New opportunity
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New opportunity</DialogTitle>
          <DialogDescription>A company can have several opportunities. Each one tracks a single service need.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createOpportunity(form);
              if (result.ok) {
                toast.success(result.message);
                setOpen(false);
              } else setError(result.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="opp-company" className="text-xs">
              Company
            </Label>
            <Select value={form.companyId || NONE} onValueChange={(v) => set("companyId", v === NONE ? "" : v)}>
              <SelectTrigger id="opp-company" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Choose a company</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opp-title" className="text-xs">
              Title
            </Label>
            <Input id="opp-title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opp-service" className="text-xs">
                Service
              </Label>
              <Select value={form.serviceId || NONE} onValueChange={(v) => set("serviceId", v === NONE ? "" : v)}>
                <SelectTrigger id="opp-service" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not matched yet</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opp-value" className="text-xs">
                Estimated value (₹)
              </Label>
              <Input id="opp-value" type="number" min={0} value={form.estimatedValue} onChange={(e) => set("estimatedValue", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opp-problem" className="text-xs">
              Problem hypothesis
            </Label>
            <Textarea
              id="opp-problem"
              value={form.problemHypothesis}
              onChange={(e) => set("problemHypothesis", e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="What do you believe the problem is? This is recorded as a hypothesis."
            />
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
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
