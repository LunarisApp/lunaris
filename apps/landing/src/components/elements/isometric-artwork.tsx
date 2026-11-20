import type { ReactNode } from "react";

export type PlanePoint = readonly [x: number, y: number, elevation?: number];
export type Footprint = readonly [
	left: number,
	back: number,
	right: number,
	front: number,
];

const groundEdge = 156;
const gridLines = Array.from({ length: 13 }, (_, index) => (index - 6) * 24);

export function project([x, y, elevation = 0]: PlanePoint) {
	return [305 + (x - y) * 0.87, 236 + (x + y) * 0.43 - elevation];
}

export function points(...vertices: PlanePoint[]) {
	return vertices.map((vertex) => project(vertex).join(",")).join(" ");
}

export function IsometricPlate({
	footprint: [left, back, right, front],
	elevation,
	thickness,
	surfaceClassName = "fill-white dark:fill-olive-800",
	children,
}: {
	footprint: Footprint;
	elevation: number;
	thickness: number;
	surfaceClassName?: string;
	children?: ReactNode;
}) {
	const bottom = elevation - thickness;
	const [x, y] = project([left, back, elevation]);

	return (
		<g strokeLinejoin="round">
			<g stroke="currentColor" strokeOpacity=".35">
				<polygon
					className="fill-olive-200 dark:fill-olive-800"
					points={points(
						[left, front, bottom],
						[right, front, bottom],
						[right, front, elevation],
						[left, front, elevation],
					)}
				/>
				<polygon
					className="fill-olive-300 dark:fill-black"
					points={points(
						[right, back, bottom],
						[right, front, bottom],
						[right, front, elevation],
						[right, back, elevation],
					)}
				/>
				<polygon
					className={surfaceClassName}
					points={points(
						[left, back, elevation],
						[right, back, elevation],
						[right, front, elevation],
						[left, front, elevation],
					)}
				/>
			</g>
			{children && (
				<g transform={`matrix(.87 .43 -.87 .43 ${x} ${y})`}>{children}</g>
			)}
		</g>
	);
}

export function IsometricArtwork({
	name,
	children,
}: {
	name: "extensions" | "storage" | "enterprise";
	children: ReactNode;
}) {
	return (
		<svg
			aria-hidden="true"
			className="block w-full rounded-2xl border border-current/10 bg-olive-950/[.025] dark:bg-white/[.045]"
			data-artwork={name}
			fill="none"
			viewBox="0 0 610 394"
		>
			<g stroke="currentColor">
				<polygon
					points={points(
						[-groundEdge, -groundEdge],
						[groundEdge, -groundEdge],
						[groundEdge, groundEdge],
						[-groundEdge, groundEdge],
					)}
					strokeOpacity=".2"
				/>
				{gridLines.map((offset) => (
					<g key={offset} strokeOpacity=".09">
						<polyline
							points={points([offset, -groundEdge], [offset, groundEdge])}
						/>
						<polyline
							points={points([-groundEdge, offset], [groundEdge, offset])}
						/>
					</g>
				))}
			</g>
			{children}
		</svg>
	);
}
