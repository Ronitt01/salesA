"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EMPLOYEE_RANGES, INDIAN_STATES } from "@/lib/labels";
import { addLeadNote, rescoreLead, updateLead, type LeadUpdateInput } from "@/server/actions/leads";

const NONE = "__none";

export function RescoreButton({ companyId }: { companyId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await rescoreLead(companyId);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      Rescore
    </Button>
  );
}

export function EditLeadDialog({
  initial,
  industries,
}: {
  initial: LeadUpdateInput;
  industries: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LeadUpdateInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof LeadUpdateInput>(key: K, value: LeadUpdateInput[K]) => setForm((f) => ({ ...f, [key]: value }));

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
        <Button variant="outline" size="sm">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>
            Company details feed the score, so saving triggers a rescore. Qualification itself is decided by the scoring
            engine and cannot be set by hand.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await updateLead(form);
              if (result.ok) {
                toast.success(result.message);
                setOpen(false);
              } else setError(result.error);
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-name" className="text-xs">
                Company name
              </Label>
              <Input id="edit-name" value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-industry" className="text-xs">
                Industry
              </Label>
              <Select value={(form.industryId as string) || NONE} onValueChange={(v) => set("industryId", v === NONE ? "" : v)}>
                <SelectTrigger id="edit-industry" className="w-full">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-employees" className="text-xs">
                Employees
              </Label>
              <Select value={(form.employeeRange as string) || NONE} onValueChange={(v) => set("employeeRange", v === NONE ? "" : v)}>
                <SelectTrigger id="edit-employees" className="w-full">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-city" className="text-xs">
                City
              </Label>
              <Input id="edit-city" value={(form.city as string) ?? ""} onChange={(e) => set("city", e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-state" className="text-xs">
                State
              </Label>
              <Select value={(form.state as string) || NONE} onValueChange={(v) => set("state", v === NONE ? "" : v)}>
                <SelectTrigger id="edit-state" className="w-full">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-branches" className="text-xs">
                Number of locations
              </Label>
              <Input
                id="edit-branches"
                type="number"
                min={0}
                max={10000}
                value={(form.branchCount as string | number | undefined) ?? ""}
                onChange={(e) => set("branchCount", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-stage" className="text-xs">
                Park this lead
              </Label>
              <Select value={(form.stage as string) || NONE} onValueChange={(v) => set("stage", v === NONE ? "" : v)}>
                <SelectTrigger id="edit-stage" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Leave stage as it is</SelectItem>
                  <SelectItem value="nurture">Move to nurture</SelectItem>
                  <SelectItem value="rejected">Reject</SelectItem>
                  <SelectItem value="researched">Return to researched</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-description" className="text-xs">
                Description
              </Label>
              <Textarea
                id="edit-description"
                value={(form.description as string) ?? ""}
                onChange={(e) => set("description", e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </div>
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
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NoteForm({ companyId }: { companyId: string }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addLeadNote(companyId, body);
          if (result.ok) {
            toast.success(result.message);
            setBody("");
          } else toast.error(result.error);
        });
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a note for the team"
        aria-label="New note"
        maxLength={4000}
        rows={2}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || body.trim() === ""}>
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          Add note
        </Button>
      </div>
    </form>
  );
}
