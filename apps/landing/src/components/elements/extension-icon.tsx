"use client";

import { clsx } from "clsx/lite";
import Image, { type StaticImageData } from "next/image";
import { useState } from "react";
import fileIcon from "../../../../../internal/workspaces/src/features/extensions/assets/builtin-file.webp";
import kanbanIcon from "../../../../../internal/workspaces/src/features/extensions/assets/builtin-kanban.webp";
import richTextIcon from "../../../../../internal/workspaces/src/features/extensions/assets/builtin-rich-text.webp";

const builtInIcons: Readonly<Partial<Record<string, StaticImageData>>> = {
	file: fileIcon,
	kanban: kanbanIcon,
	"rich-text": richTextIcon,
};

export function ExtensionIcon({
	id,
	src,
	className,
}: {
	id: string;
	src?: string;
	className?: string;
}) {
	const source = src ?? builtInIcons[id];
	const sourceUrl = typeof source === "string" ? source : source?.src;
	const [failedUrl, setFailedUrl] = useState<string>();
	const classes = clsx("size-9 shrink-0 rounded-lg", className);

	if (!source || sourceUrl === failedUrl) {
		return (
			<span
				aria-hidden="true"
				className={clsx(
					classes,
					"flex items-center justify-center bg-olive-200 text-olive-700 dark:bg-olive-800 dark:text-olive-300",
				)}
			>
				<svg
					aria-hidden="true"
					className="size-1/2"
					fill="none"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<rect height="7" rx="1.5" width="7" x="3" y="3" />
					<rect height="7" rx="1.5" width="7" x="14" y="3" />
					<rect height="7" rx="1.5" width="7" x="3" y="14" />
					<path d="M17.5 14v7M14 17.5h7" />
				</svg>
			</span>
		);
	}

	return (
		<Image
			alt=""
			className={classes}
			height={72}
			onError={() => setFailedUrl(sourceUrl)}
			src={source}
			unoptimized={typeof source === "string"}
			width={72}
		/>
	);
}
