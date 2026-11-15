"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACQUISITION_CHANNEL_LABEL, CONTACT_ROLE_LABEL, EMPLOYEE_RANGES, INDIAN_STATES } from "@/lib/labels";
import { createLead, type LeadInput } from "@/server/actions/leads";

const NONE = "__none";

const EMPTY: LeadInput = {
  name: "",
  domain: "",
  industryId: "",
  city: "",
  state: "",
  employeeRange: "",
  branchCount: "",
  acquisitionChannel: "other",
  contactName: "",
  contactTitle: "",
  contactEmail: "",
  contactPhone: "",
  contactRole: "other",
};

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-subtle">{hint}</p> : null}
    </div>
  );
}

export function LeadFormDialog({ industries }: { industries: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LeadInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof LeadInput>(key: K, value: LeadInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof LeadInput) => ({
    id: `lead-${key}`,
    value: (form[key] as string | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value as never),
  });

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
          New lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            Add a company you already know about. It is checked for duplicates, then scored by the same engine as every
            other lead.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createLead(form);
              if (result.ok) {
                toast.success(result.message);
                setOpen(false);
                setForm(EMPTY);
                router.push(`/leads/${result.data.id}`);
              } else setError(result.error);
            });
          }}
        >
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-medium tracking-wider text-subtle uppercase">Company</legend>
            <Field label="Company name" htmlFor="lead-name">
              <Input {...text("name")} required maxLength={160} />
            </Field>
            <Field label="Website domain" htmlFor="lead-domain" hint="Used to detect duplicates.">
              <Input {...text("domain")} placeholder="example.com" />
            </Field>
            <Field label="Industry" htmlFor="lead-industry">
              <Select value={form.industryId || NONE} onValueChange={(v) => set("industryId", v === NONE ? "" : v)}>
                <SelectTrigger id="lead-industry" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {industries.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Employees" htmlFor="lead-employees">
              <Select value={(form.employeeRange as string) || NONE} onValueChange={(v) => set("employeeRange", v === NONE ? "" : v)}>
                <SelectTrigger id="lead-employees" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unknown</SelectItem>
                  {EMPLOYEE_RANGES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="City" htmlFor="lead-city">
              <Input {...text("city")} maxLength={80} />
            </Field>
            <Field label="State" htmlFor="lead-state">
              <Select value={(form.state as string) || NONE} onValueChange={(v) => set("state", v === NONE ? "" : v)}>
                <SelectTrigger id="lead-state" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="How did this lead reach us?" htmlFor="lead-channel">
              <Select value={form.acquisitionChannel} onValueChange={(v) => set("acquisitionChannel", v as LeadInput["acquisitionChannel"])}>
                <SelectTrigger id="lead-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACQUISITION_CHANNEL_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Number of locations" htmlFor="lead-branchCount">
              <Input {...text("branchCount")} type="number" min={0} max={10000} inputMode="numeric" />
            </Field>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-medium tracking-wider text-subtle uppercase">Primary contact (optional)</legend>
            <Field label="Full name" htmlFor="lead-contactName">
              <Input {...text("contactName")} maxLength={120} />
            </Field>
            <Field label="Job title" htmlFor="lead-contactTitle">
              <Input {...text("contactTitle")} maxLength={120} />
            </Field>
            <Field label="Business email" htmlFor="lead-contactEmail" hint="Stored as unverified until a verification runs.">
              <Input {...text("contactEmail")} type="email" />
            </Field>
            <Field label="Role" htmlFor="lead-role">
              <Select value={form.contactRole} onValueChange={(v) => set("contactRole", v as LeadInput["contactRole"])}>
                <SelectTrigger id="lead-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTACT_ROLE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </fieldset>

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
              Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
