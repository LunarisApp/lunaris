import {
	IsometricArtwork,
	IsometricPlate,
	points,
	project,
} from "./isometric-artwork";

const budget = [24, 36, 48];

function OrbitSimulator() {
	const [x, y] = project([-112, -43, 144]);

	return (
		<g transform={`matrix(.87 .43 0 1 ${x} ${y})`}>
			<rect
				x="8"
				y="-8"
				width="240"
				height="132"
				rx="6"
				className="fill-olive-300 dark:fill-olive-800"
				stroke="currentColor"
				strokeOpacity=".35"
			/>
			<rect
				width="240"
				height="132"
				rx="6"
				className="fill-olive-200"
				stroke="currentColor"
				strokeOpacity=".35"
			/>

			<g className="text-olive-950">
				<path
					d="M0 21h240m-77 0v111"
					stroke="currentColor"
					strokeOpacity=".2"
				/>
				<path
					d="m15 8-4 3 4 3m9-6 4 3-4 3m-3-8-3 10"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>

				<path
					d="M13 77h138M82 30v94"
					stroke="currentColor"
					strokeOpacity=".18"
				/>
				<ellipse
					cx="82"
					cy="77"
					rx="57"
					ry="24"
					transform="rotate(-28 82 77)"
					stroke="currentColor"
					strokeOpacity=".72"
					strokeWidth="1.6"
				/>
				<ellipse
					cx="82"
					cy="77"
					rx="57"
					ry="20"
					transform="rotate(29 82 77)"
					stroke="currentColor"
					strokeOpacity=".45"
					strokeDasharray="3 4"
				/>
				<circle cx="82" cy="77" r="14" fill="currentColor" />
				<path
					d="M72 77q10-9 21-5m-20 11q10-8 21-5"
					className="stroke-olive-300"
					strokeOpacity=".7"
					strokeLinecap="round"
				/>
				<circle
					cx="139"
					cy="77"
					r="5"
					transform="rotate(-28 82 77)"
					className="fill-olive-200"
					stroke="currentColor"
					strokeWidth="1.8"
				/>

				<path
					d="M177 39h33m-33 35h26"
					stroke="currentColor"
					strokeOpacity=".52"
					strokeLinecap="round"
					strokeWidth="2.5"
				/>
				<path
					d="M177 51h47m-47 35h47"
					stroke="currentColor"
					strokeOpacity=".32"
					strokeWidth="1.4"
				/>
				<circle cx="207" cy="51" r="3.5" fill="currentColor" />
				<circle cx="191" cy="86" r="3.5" fill="currentColor" />
				<rect
					x="177"
					y="100"
					width="47"
					height="17"
					rx="3"
					fill="currentColor"
				/>
				<path d="M198 104v9l7-4.5z" className="fill-olive-200" />
			</g>
		</g>
	);
}

function BudgetSheet() {
	return (
		<IsometricPlate
			footprint={[-133, 16, 19, 132]}
			elevation={34}
			thickness={6}
		>
			<rect
				x="10"
				y="10"
				width="132"
				height="20"
				rx="3"
				fill="currentColor"
				opacity=".09"
			/>
			<text
				x="17"
				y="23"
				fill="currentColor"
				fontSize="10"
				fontFamily="monospace"
			>
				=SUM(B2:B4)
			</text>
			<path
				d="M10 37h132v69H10zm0 14h132M10 65h132M10 79h132M10 93h132M31 37v69m57-69v69"
				stroke="currentColor"
				strokeOpacity=".3"
			/>
			<g fill="currentColor" fontSize="9" fontFamily="monospace">
				<text x="56" y="47">
					A
				</text>
				<text x="112" y="47">
					B
				</text>
				{budget.map((amount, index) => (
					<g key={amount} transform={`translate(0 ${index * 14})`}>
						<text x="18" y="61" opacity=".65">
							{index + 2}
						</text>
						<path
							d="M40 58h33"
							stroke="currentColor"
							strokeOpacity=".48"
							strokeWidth="2"
							strokeLinecap="round"
						/>
						<text x="133" y="61" textAnchor="end">
							{amount}
						</text>
					</g>
				))}
				<text x="18" y="103" opacity=".65">
					5
				</text>
				<rect x="88" y="93" width="54" height="13" fill="currentColor" />
				<text
					x="133"
					y="103"
					textAnchor="end"
					className="fill-olive-50 dark:fill-olive-950"
				>
					{budget.reduce((sum, amount) => sum + amount, 0)}
				</text>
			</g>
		</IsometricPlate>
	);
}

function HandoffPdf() {
	const [x, y] = project([134, -56, 63]);

	return (
		<g transform={`matrix(.87 -.43 0 1 ${x} ${y})`}>
			<g stroke="currentColor" strokeLinejoin="round" strokeOpacity=".5">
				<path
					d="M-13 12h68l15 15v93h-83z"
					className="fill-olive-300 dark:fill-olive-700"
				/>
				<path
					d="M0 0h67l16 16v92H0z"
					className="fill-white dark:fill-olive-800"
				/>
				<path d="M67 0v16h16" />
			</g>
			<text x="13" y="22" fill="currentColor" fontSize="13" fontWeight="700">
				PDF
			</text>
			<path
				d="M13 31h57m-57 9h34"
				stroke="currentColor"
				strokeOpacity=".49"
				strokeWidth="2.6"
				strokeLinecap="round"
			/>
			<rect
				x="13"
				y="51"
				width="57"
				height="31"
				rx="2"
				stroke="currentColor"
				strokeOpacity=".48"
			/>
			<ellipse
				cx="41"
				cy="66"
				rx="18"
				ry="6"
				transform="rotate(-16 41 66)"
				stroke="currentColor"
				strokeOpacity=".65"
			/>
			<circle cx="41" cy="66" r="4" fill="currentColor" />
			<path
				d="M13 91h43m-43 8h32"
				stroke="currentColor"
				strokeOpacity=".45"
				strokeWidth="2.3"
				strokeLinecap="round"
			/>
		</g>
	);
}

export function ExtensionsArtwork() {
	return (
		<IsometricArtwork name="extensions">
			<IsometricPlate
				footprint={[-141, -126, 144, 142]}
				elevation={12}
				thickness={7}
				surfaceClassName="fill-olive-100 dark:fill-olive-950"
			>
				<path d="M9 9h267v250H9z" stroke="currentColor" strokeOpacity=".24" />
				<path
					d="M9 132h267m-133-123v250"
					stroke="currentColor"
					strokeOpacity=".13"
					strokeDasharray="3 5"
				/>
			</IsometricPlate>
			<g stroke="currentColor" strokeOpacity=".36" strokeDasharray="3 5">
				<polyline points={points([-133, 132, 12], [-133, 132, 28])} />
				<polyline points={points([19, 132, 12], [19, 132, 28])} />
			</g>
			<OrbitSimulator />
			<BudgetSheet />
			<HandoffPdf />
		</IsometricArtwork>
	);
}
