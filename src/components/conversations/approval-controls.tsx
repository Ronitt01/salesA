"use client";

import { useState, useTransition } from "react";
import { Check, CircleAlert, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveMessage, rejectMessage } from "@/server/actions/outreach";

/** Approve or reject one draft. Approval hands the message to the compliance gate. */
export function ApprovalControls({ messageId }: { messageId: string }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [blocked, setBlocked] = useState<string[] | null>(null);

  const approve = () =>
    startTransition(async () => {
      setBlocked(null);
      const result = await approveMessage(messageId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.outcome === "blocked") {
        setBlocked(result.data.reasons);
        toast.error("The compliance gate blocked this message.");
      } else if (result.data.outcome === "held") {
        toast.success("Approved. Not sent.", { description: result.data.reasons[0] });
      } else {
        toast.success("Approved and sent.");
      }
    });

  const reject = () =>
    startTransition(async () => {
      const result = await rejectMessage(messageId, reason);
      if (result.ok) {
        toast.success(result.message);
        setRejecting(false);
        setReason("");
      } else toast.error(result.error);
    });

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {blocked ? (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <p className="flex items-center gap-1.5 font-medium">
            <CircleAlert className="size-3.5" />
            Blocked by the compliance gate. Nothing was sent.
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {blocked.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rejecting ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            reject();
          }}
        >
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this draft rejected?"
            aria-label="Reason for rejecting"
            maxLength={500}
            className="h-8 min-w-48 flex-1 text-sm"
          />
          <Button type="submit" size="sm" variant="destructive" disabled={pending || reason.trim().length < 3}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Reject draft
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={approve} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={pending}>
            <X />
            Reject
          </Button>
          <span className="text-xs text-muted-foreground">Approval runs the compliance gate before anything else.</span>
        </div>
      )}
    </div>
  );
}
