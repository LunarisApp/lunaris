import { cn } from "@lunarisapp/ui/lib/utils";

export interface SkipLinkProps {
  /** Text displayed in the skip link. Defaults to "Skip to main content" */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** ID of the main content element to skip to. Defaults to "main-content" */
  targetId?: string;
}

/**
 * A skip link component that allows keyboard users to skip repetitive navigation.
 * Visually hidden until focused, then appears prominently at top-left.
 */
export function SkipLink({
  targetId = "main-content",
  children = "Skip to main content",
  className,
}: SkipLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView();
    }
  };

  return (
    <a
      className={cn(
        // Visually hidden by default
        "absolute -top-10 left-0 z-50",
        // High contrast, prominent styling when focused
        "bg-primary text-primary-foreground",
        "px-4 py-2 font-medium",
        "rounded-br-md",
        // Focus styles - transition to visible
        "focus:top-0",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        // Smooth transition
        "transition-[top] duration-200",
        className
      )}
      href={`#${targetId}`}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
