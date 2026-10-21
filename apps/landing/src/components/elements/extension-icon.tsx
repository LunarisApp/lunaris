import { clsx } from "clsx/lite";
import Image from "next/image";

export function ExtensionIcon({
	id,
	className,
}: {
	id: string;
	className?: string;
}) {
	return (
		<Image
			alt=""
			className={clsx("size-9 shrink-0 rounded-lg", className)}
			height={72}
			src={`/img/extensions/${id}.webp`}
			width={72}
		/>
	);
}
