import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-app-label leading-[1.2] whitespace-nowrap transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-focus",
        secondary: "border border-hairline bg-surface-1 text-ink hover:bg-surface-2",
        tertiary: "bg-transparent text-ink hover:bg-surface-1",
        inverse: "bg-inverse-canvas text-inverse-ink hover:opacity-90",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-[14px]",
        sm: "h-7 px-3 text-app-table",
        lg: "h-10 px-4",
        icon: "size-8",
      },
    },
    // Applied after `size`, so a link never carries button height or padding.
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
