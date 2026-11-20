import {
	IsometricArtwork,
	IsometricPlate,
	points,
	project,
} from "./isometric-artwork";

const rackLevels = [24, 39, 54];

export function StorageArtwork() {
	const [cloudX, cloudY] = project([61, 90, 49]);

	return (
		<IsometricArtwork name="storage">
			<g
				stroke="currentColor"
				strokeWidth="1.7"
				strokeOpacity=".63"
				strokeLinejoin="round"
			>
				<polyline points={points([-84, -52], [-101, -52], [-101, 41])} />
				<polyline points={points([-53, -52], [-53, 8], [61, 8], [61, 58])} />
				<polyline points={points([-53, -82], [103, -82], [103, -117])} />
			</g>

			<IsometricPlate
				footprint={[-135, -135, -41, -41]}
				elevation={13}
				thickness={8}
			>
				<rect
					x="9"
					y="9"
					width="76"
					height="76"
					stroke="currentColor"
					strokeDasharray="3 4"
					strokeOpacity=".34"
				/>
			</IsometricPlate>
			<IsometricPlate
				footprint={[-123, -123, -53, -53]}
				elevation={24}
				thickness={4}
			/>
			<IsometricPlate
				footprint={[-123, -123, -53, -53]}
				elevation={33}
				thickness={4}
			/>
			<IsometricPlate
				footprint={[-123, -123, -53, -53]}
				elevation={42}
				thickness={4}
				surfaceClassName="fill-olive-200"
			>
				<path
					d="M14 20h22m-22 12h42m-42 9h42m-42 9h30"
					className="stroke-olive-800"
					strokeWidth="2.7"
					strokeLinecap="round"
				/>
			</IsometricPlate>

			<IsometricPlate
				footprint={[-135, 37, -58, 116]}
				elevation={8}
				thickness={5}
			/>
			<IsometricPlate
				footprint={[-125, 55, -68, 104]}
				elevation={15}
				thickness={4}
			>
				<path
					d="M7 9h43m-43 6h43m-43 6h43m-43 6h43m-30 7h17v8H20z"
					stroke="currentColor"
					strokeOpacity=".44"
				/>
			</IsometricPlate>
			<polygon
				className="fill-olive-200 dark:fill-olive-950"
				points={points(
					[-125, 55, 15],
					[-68, 55, 15],
					[-68, 49, 56],
					[-125, 49, 56],
				)}
				stroke="currentColor"
				strokeOpacity=".6"
				strokeLinejoin="round"
			/>
			<polygon
				points={points(
					[-119, 54, 21],
					[-74, 54, 21],
					[-74, 50, 50],
					[-119, 50, 50],
				)}
				stroke="currentColor"
				strokeOpacity=".28"
			/>
			<g stroke="currentColor" strokeOpacity=".75" strokeWidth="1.4">
				<polyline points={points([-110, 52, 39], [-87, 52, 39])} />
				<polyline points={points([-110, 53, 31], [-96, 53, 31])} />
			</g>

			<IsometricPlate
				footprint={[69, -121, 138, -37]}
				elevation={8}
				thickness={5}
			/>
			{rackLevels.map((elevation) => {
				const [lightX, lightY] = project([115, -51, elevation - 6]);

				return (
					<g key={elevation}>
						<IsometricPlate
							footprint={[84, -108, 123, -51]}
							elevation={elevation}
							thickness={12}
						/>
						<polyline
							points={points(
								[90, -51, elevation - 6],
								[103, -51, elevation - 6],
							)}
							stroke="currentColor"
							strokeOpacity=".55"
							strokeWidth="1.5"
						/>
						<circle cx={lightX} cy={lightY} r="1.4" fill="currentColor" />
					</g>
				);
			})}

			<IsometricPlate
				footprint={[21, 53, 101, 133]}
				elevation={8}
				thickness={5}
			>
				<circle
					cx="40"
					cy="37"
					r="28"
					stroke="currentColor"
					strokeOpacity=".32"
				/>
				<circle
					cx="40"
					cy="37"
					r="16"
					stroke="currentColor"
					strokeOpacity=".55"
				/>
			</IsometricPlate>
			<g transform={`translate(${cloudX} ${cloudY})`}>
				<path
					d="M0 15v25"
					stroke="currentColor"
					strokeDasharray="2 4"
					strokeOpacity=".55"
				/>
				<path
					className="fill-olive-200 dark:fill-olive-800"
					d="M-19 12a11 11 0 1 1 2-22A16 16 0 0 1 14-7a10 10 0 0 1 3 19z"
					stroke="currentColor"
					strokeOpacity=".78"
					strokeWidth="1.7"
				/>
			</g>
		</IsometricArtwork>
	);
}
