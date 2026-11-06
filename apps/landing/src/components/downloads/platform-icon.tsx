import Apple from "@thesvg/react/apple";
import Linux from "@thesvg/react/linux";
import Windows from "@thesvg/react/windows";
import type { DesktopPlatform } from "@/lib/desktop-platform";

const icons = {
	macos: <Apple variant="mono" focusable="false" />,
	windows: <Windows focusable="false" />,
	linux: <Linux variant="mono" focusable="false" />,
};

export function PlatformIcon({
	platform,
	className = "size-4",
}: {
	platform: DesktopPlatform;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={`${className} inline-flex shrink-0 [&>svg]:size-full [&_path]:fill-current`}
		>
			{icons[platform]}
		</span>
	);
}
