import Linear from "@thesvg/react/linear";
import Notion from "@thesvg/react/notion";
import Obsidian from "@thesvg/react/obsidian";
import { clsx } from "clsx/lite";
import Image from "next/image";

export type ProductIconName = "linear" | "lunaris" | "notion" | "obsidian";

export function ProductIcon({
	className,
	name,
}: {
	className?: string;
	name: ProductIconName;
}) {
	const iconClassName = clsx("shrink-0", className);

	if (name === "lunaris") {
		return (
			<>
				<Image
					alt=""
					className={clsx(iconClassName, "dark:hidden")}
					height={64}
					src="/img/lunaris-mark-light.svg"
					width={64}
				/>
				<Image
					alt=""
					className={clsx(iconClassName, "hidden dark:block")}
					height={64}
					src="/img/lunaris-mark-dark.svg"
					width={64}
				/>
			</>
		);
	}
	if (name === "notion") {
		return (
			<Notion
				aria-hidden="true"
				className={clsx(iconClassName, "text-black")}
			/>
		);
	}

	const Icon = {
		linear: Linear,
		obsidian: Obsidian,
	}[name];

	return <Icon aria-hidden="true" className={iconClassName} />;
}
