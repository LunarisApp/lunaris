import { buttonVariants } from "@lunarisapp/ui/components/button";
import { ArrowLeft01Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { Link, type LinkProps } from "react-router";

interface AuthBackLinkProps {
  label: string;
  state?: LinkProps["state"];
  to: LinkProps["to"];
}

export function AuthBackLink({ label, state, to }: AuthBackLinkProps) {
  return (
    <Link
      aria-label={label}
      className={buttonVariants({
        className: "rounded-xl",
        size: "icon-lg",
        variant: "ghost",
      })}
      state={state}
      to={to}
    >
      <HugeiconsIcon
        aria-hidden="true"
        className="size-5"
        icon={ArrowLeft01Icon}
        strokeWidth={2}
      />
    </Link>
  );
}
