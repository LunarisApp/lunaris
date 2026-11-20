import styles from "./enterprise-artwork.module.css";

type Point = readonly [x: number, y: number, height?: number];
type Footprint = readonly [
	left: number,
	back: number,
	right: number,
	front: number,
];

const groundEdge = 156;
const gridLines = Array.from({ length: 13 }, (_, index) => (index - 6) * 24);
const windowBays = [0.19, 0.395, 0.6, 0.805];

function project([x, y, height = 0]: Point) {
	return [305 + (x - y) * 0.87, 236 + (x + y) * 0.43 - height];
}

function points(...vertices: Point[]) {
	return vertices.map((vertex) => project(vertex).join(",")).join(" ");
}

function GroundTerminal({ position }: { position: Point }) {
	const [x, y] = project(position);

	return (
		<g transform={`translate(${x} ${y})`}>
			<ellipse rx="7" ry="3.5" stroke="currentColor" strokeOpacity=".55" />
			<ellipse rx="2.5" ry="1.4" fill="currentColor" />
		</g>
	);
}

function Building({
	footprint: [left, back, right, front],
	floors,
	floorHeight,
	headquarters = false,
}: {
	footprint: Footprint;
	floors: number;
	floorHeight: number;
	headquarters?: boolean;
}) {
	const height = floors * floorHeight;
	const [roofCenterX, roofCenterY] = project([
		(left + right) / 2,
		(back + front) / 2,
		height,
	]);
	const floorLines = Array.from(
		{ length: floors - 1 },
		(_, index) => (index + 1) * floorHeight,
	);

	return (
		<g stroke="currentColor" strokeLinejoin="round" strokeOpacity=".38">
			<polygon
				className="fill-white dark:fill-olive-800"
				points={points(
					[left, front],
					[right, front],
					[right, front, height],
					[left, front, height],
				)}
			/>
			<polygon
				className="fill-olive-200 dark:fill-olive-950"
				points={points(
					[right, back],
					[right, front],
					[right, front, height],
					[right, back, height],
				)}
			/>
			{floorLines.map((level) => (
				<polyline
					key={level}
					points={points(
						[left, front, level],
						[right, front, level],
						[right, back, level],
					)}
				/>
			))}
			{Array.from({ length: floors }, (_, index) => {
				const level = (index + 0.5) * floorHeight;
				return (
					<g
						key={level}
						strokeLinecap="round"
						strokeOpacity={headquarters ? ".78" : ".55"}
						strokeWidth={headquarters ? 2.4 : 1.8}
					>
						{windowBays.map((bay) => {
							const x = left + (right - left) * bay;
							return (
								<polyline
									key={bay}
									points={points([x - 4, front, level], [x + 4, front, level])}
								/>
							);
						})}
						<polyline
							points={points(
								[right, back + 9, level],
								[right, front - 9, level],
							)}
							strokeOpacity=".24"
						/>
					</g>
				);
			})}
			<polygon
				className={
					headquarters ? "fill-olive-200" : "fill-olive-50 dark:fill-olive-700"
				}
				points={points(
					[left, back, height],
					[right, back, height],
					[right, front, height],
					[left, front, height],
				)}
			/>
			{headquarters ? (
				<image
					href="/img/lunaris-mark-light.svg"
					transform={`matrix(.87 .43 -.87 .43 ${roofCenterX} ${roofCenterY})`}
					x="-30"
					y="-30"
					width="60"
					height="60"
				/>
			) : (
				<polygon
					points={points(
						[left + 10, back + 10, height],
						[right - 10, back + 10, height],
						[right - 10, front - 10, height],
						[left + 10, front - 10, height],
					)}
				/>
			)}
		</g>
	);
}

export function EnterpriseArtwork() {
	const entrance = [120, 132] as const;
	const approach = [
		[75, 132],
		[75, 112],
		[26, 112],
	] as const;

	return (
		<svg
			aria-hidden="true"
			className="block w-full rounded-2xl border border-current/10 bg-olive-950/[.025] dark:bg-white/[.045]"
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

			<g
				stroke="currentColor"
				strokeLinejoin="round"
				strokeOpacity=".68"
				strokeWidth="1.6"
			>
				<polyline
					points={points([-92, 117], [-92, 139], [26, 139], [26, 23])}
				/>
				<polyline points={points([110, -52], [110, 77], [26, 77])} />
				<polyline points={points(entrance, ...approach)} />
			</g>
			<g stroke="currentColor" strokeDasharray="3 5" strokeOpacity=".36">
				<polyline points={points([-134, 52], [-134, -93], [-78, -93])} />
				<polyline points={points([50, -120], [-12, -120], [-12, -56])} />
			</g>
			<GroundTerminal position={[-134, 52]} />
			<GroundTerminal position={[-78, -93]} />
			<GroundTerminal position={[50, -120]} />
			<GroundTerminal position={[26, 77]} />
			<GroundTerminal position={entrance} />
			<polyline
				className={styles.trace}
				pathLength="100"
				points={points(entrance, ...approach, [26, 23])}
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2.8"
			/>

			<Building footprint={[76, -117, 137, -52]} floors={4} floorHeight={21} />
			<Building
				footprint={[-43, -56, 45, 23]}
				floors={5}
				floorHeight={29}
				headquarters
			/>
			<Building footprint={[-132, 57, -66, 117]} floors={2} floorHeight={25} />
		</svg>
	);
}
