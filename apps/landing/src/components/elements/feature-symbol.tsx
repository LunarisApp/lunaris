import type { ReactNode } from "react";

const shapes: Record<
	"device" | "cloud" | "server" | "offline" | "shield",
	ReactNode
> = {
	device: (
		<>
			<rect x="3" y="4" width="18" height="12" rx="2" />
			<path d="M8 21h8m-4-5v5" />
		</>
	),
	cloud: <path d="M7 18a5 5 0 1 1 .5-10A6 6 0 0 1 19 10a4 4 0 0 1-1 8H7Z" />,
	server: (
		<>
			<rect x="4" y="3" width="16" height="7" rx="2" />
			<rect x="4" y="14" width="16" height="7" rx="2" />
			<path d="M8 6.5h.01M8 17.5h.01M12 6.5h4M12 17.5h4" />
		</>
	),
	offline: (
		<>
			<path d="m3 3 18 18M8.5 8.5A14 14 0 0 1 21 9M3 9a14 14 0 0 1 2-1.2M7 13a8 8 0 0 1 5-1.7m4.2 1.2.8.5M10 17a3.5 3.5 0 0 1 4 0M12 21h.01" />
		</>
	),
	shield: (
		<>
			<path d="m12 3 8 3v6c0 4-3.5 7-8 9-4.5-2-8-5-8-9V6l8-3Z" />
			<path d="m8 12 3 3 5-6" />
		</>
	),
};

export function FeatureSymbol({
	kind,
	className = "size-7",
}: {
	kind: keyof typeof shapes;
	className?: string;
}) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			viewBox="0 0 24 24"
		>
			{shapes[kind]}
		</svg>
	);
}
