"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, MailCheck, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { enrichCompanyContactsAction, verifyContactEmailAction } from "@/server/actions/enrichment";

/**
 * Contact discovery controls. Buttons are disabled while a call runs, so a double
 * click cannot trigger a second paid request, and they explain why they are disabled
 * (demo data, cooldown, missing key, not yet eligible) instead of calling Hunter.
 */

function Disabled({ label, icon, reason, size }: { label: string; icon: React.ReactNode; reason: string; size: "sm" | "xs" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A span keeps the tooltip working on a disabled button. */}
        <span tabIndex={0} aria-label={`${label}: ${reason}`}>
          <Button variant="outline" size={size} disabled>
            {icon}
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 leading-relaxed">{reason}</TooltipContent>
    </Tooltip>
  );
}

export function EnrichContactsButton({ companyId, disabledReason }: { companyId: string; disabledReason: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (disabledReason) return <Disabled label="Enrich contacts" icon={<UserSearch />} reason={disabledReason} size="sm" />;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await enrichCompanyContactsAction(companyId);
            if (result.ok) {
              if (result.data.errors.length) toast.warning(result.message, { description: result.data.errors.slice(0, 2).join(" ") });
              else toast.success(result.message);
            } else {
              setError(result.error);
              toast.error(result.error);
            }
          })
        }
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <UserSearch />}
        {pending ? "Searching Hunter.io…" : "Enrich contacts"}
      </Button>
      {error ? (
        <p role="alert" className="max-w-72 text-right text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function VerifyEmailButton({ contactId, disabledReason }: { contactId: string; disabledReason: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (disabledReason) return <Disabled label="Verify email" icon={<MailCheck />} reason={disabledReason} size="xs" />;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await verifyContactEmailAction(contactId);
            if (result.ok) toast.success(result.message);
            else {
              setError(result.error);
              toast.error(result.error);
            }
          })
        }
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <MailCheck />}
        {pending ? "Verifying…" : "Verify email"}
      </Button>
      {error ? (
        <p role="alert" className="max-w-60 text-right text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
