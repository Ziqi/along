import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * Three tiers and one for harm: `primary` is the one filled action on a
 * surface, `secondary` is outlined, `quiet` is text, `danger` is red and
 * belongs behind a confirmation. Sizes step 28 / 32 / 40 / 44 px; nothing
 * outside this file sets a button's height.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xs font-sans font-medium transition-[opacity,transform,background-color,color,border-color] duration-[var(--motion-quick)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:pointer-events-none disabled:opacity-40 active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        primary: "bg-fg text-bg hover:opacity-90",
        secondary: "border border-line bg-transparent text-fg hover:border-fg/40 hover:bg-elevated",
        quiet: "bg-transparent text-muted hover:text-fg",
        danger: "border border-abort bg-abort text-white hover:opacity-90",
      },
      size: {
        xs: "h-7 px-2 text-sm",
        sm: "h-8 px-2.5 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "size-10",
        "icon-xs": "size-7",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
