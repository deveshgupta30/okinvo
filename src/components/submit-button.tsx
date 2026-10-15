"use client";

import { useFormStatus } from "react-dom";
import { Loader } from "@/components/motion/loader";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Disables itself while the surrounding form's server action is pending and shows the comet
 * loader next to the label (or the pending label when one is given).
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (
        <span aria-hidden="true" className="inline-flex">
          <Loader variant="comet" size={14} label="" />
        </span>
      ) : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
