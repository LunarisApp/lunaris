type ProblemKind = "featureBloat" | "vendorLockIn" | "rigidWorkflows";

function FeatureBloatGraphic() {
	return (
		<svg
			aria-hidden="true"
			className="size-full"
			fill="none"
			viewBox="0 0 360 216"
		>
			<g
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			>
				<rect
					className="fill-white/35 dark:fill-white/3"
					height="160"
					opacity="0.65"
					rx="3"
					width="284"
					x="38"
					y="28"
				/>
				<path
					d="M38 52h284M38 72h284M38 168h284M102 72v96M264 72v96"
					opacity="0.22"
					strokeLinecap="square"
				/>

				<circle cx="52" cy="40" fill="currentColor" opacity="0.28" r="2" />
				<circle cx="61" cy="40" fill="currentColor" opacity="0.18" r="2" />
				<path d="M75 40h34" opacity="0.24" />

				<g opacity="0.48">
					<path d="M116 62h10m-5-5v10" />
					<rect height="10" rx="1" width="10" x="140" y="57" />
					<circle cx="166" cy="62" r="5" />
					<path d="M184 58h10v8h-10ZM209 58v8m-4-4h8M229 58h13m-13 4h9m-9 4h11" />
				</g>

				<g opacity="0.34">
					<rect height="10" rx="1" width="10" x="48" y="81" />
					<path d="M64 86h22" />
					<circle cx="53" cy="108" r="5" />
					<path d="M64 108h18" />
					<path d="m48 129 5-5 5 5-5 5Z" />
					<path d="M64 129h24" />
					<path d="M48 148h10v10H48Zm5 0v10m-5-5h10" />
					<path d="M64 153h16" />
				</g>

				<g opacity="0.34">
					<path d="M275 88h36M275 111h36M275 134h36" />
					<circle cx="297" cy="88" fill="currentColor" r="3" />
					<circle cx="283" cy="111" fill="currentColor" r="3" />
					<circle cx="304" cy="134" fill="currentColor" r="3" />
				</g>

				<rect
					className="fill-white/65 dark:fill-white/6"
					height="74"
					opacity="0.75"
					rx="1"
					width="78"
					x="143"
					y="84"
				/>
				<path d="M154 97h25" opacity="0.44" strokeWidth="3" />
				<path
					d="M154 109h54M154 119h47M154 129h52M154 139h39M154 149h45"
					opacity="0.2"
				/>
				<path
					className="stroke-[#8f5f5f] dark:stroke-[#aa7676]"
					d="M204 113v10"
					strokeWidth="2"
				/>
			</g>
		</svg>
	);
}

function VendorLockInGraphic() {
	return (
		<svg
			aria-hidden="true"
			className="size-full"
			fill="none"
			viewBox="0 0 360 216"
		>
			<g
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			>
				<rect
					className="fill-white/35 dark:fill-white/3"
					height="120"
					opacity="0.65"
					rx="3"
					width="110"
					x="40"
					y="48"
				/>
				<path d="M40 70h110" opacity="0.22" />
				<circle cx="52" cy="59" fill="currentColor" opacity="0.28" r="2" />
				<path d="M62 59h24" opacity="0.22" />

				<rect
					className="fill-white/60 dark:fill-white/6"
					height="64"
					opacity="0.72"
					rx="1"
					width="48"
					x="72"
					y="84"
				/>
				<path d="M81 96h17" opacity="0.42" strokeWidth="3" />
				<path d="M81 108h29M81 118h24M81 128h27M81 138h19" opacity="0.2" />

				<path d="M150 108h36m-7-7 7 7-7 7" opacity="0.38" />
				<path
					className="stroke-[#8f5f5f] dark:stroke-[#aa7676]"
					d="M188 56v104"
					strokeLinecap="square"
					strokeWidth="2.5"
				/>
				<path d="M199 108h47" opacity="0.14" />

				<rect
					className="fill-white/15 dark:fill-white/2"
					height="68"
					opacity="0.34"
					rx="2"
					width="72"
					x="246"
					y="76"
				/>
				<path d="M260 89h24" opacity="0.22" strokeWidth="3" />
				<path d="M260 103h43M260 114h35M260 125h39" opacity="0.18" />
			</g>
		</svg>
	);
}

function RigidWorkflowsGraphic() {
	return (
		<svg
			aria-hidden="true"
			className="size-full"
			fill="none"
			viewBox="0 0 360 216"
		>
			<g
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			>
				<circle
					className="fill-white/45 dark:fill-white/5"
					cx="49"
					cy="58"
					opacity="0.62"
					r="10"
				/>
				<rect
					className="fill-white/45 dark:fill-white/5"
					height="20"
					opacity="0.62"
					rx="2"
					width="20"
					x="39"
					y="98"
				/>
				<path
					className="fill-white/45 dark:fill-white/5"
					d="m49 147 10 19H39Z"
					opacity="0.62"
				/>

				<path
					d="M59 58h25v50h28M59 108h53M59 158h25v-50"
					opacity="0.28"
					strokeLinecap="square"
				/>
				<path
					className="stroke-[#8f5f5f] dark:stroke-[#aa7676]"
					d="M116 50v48m0 20v48"
					strokeLinecap="square"
					strokeWidth="2.5"
				/>
				<path d="M112 108h20" opacity="0.42" strokeLinecap="square" />

				<g>
					<rect
						className="fill-white/45 dark:fill-white/5"
						height="56"
						opacity="0.62"
						rx="3"
						width="44"
						x="132"
						y="80"
					/>
					<path d="M143 96h22M143 108h22M143 120h15" opacity="0.28" />
					<path d="M176 108h28" opacity="0.32" strokeLinecap="square" />

					<rect
						className="fill-white/45 dark:fill-white/5"
						height="56"
						opacity="0.62"
						rx="3"
						width="44"
						x="204"
						y="80"
					/>
					<path d="M215 96h22M215 108h22M215 120h15" opacity="0.28" />
					<path d="M248 108h28" opacity="0.32" strokeLinecap="square" />

					<rect
						className="fill-white/45 dark:fill-white/5"
						height="56"
						opacity="0.62"
						rx="3"
						width="44"
						x="276"
						y="80"
					/>
					<path d="M287 96h22M287 108h22M287 120h15" opacity="0.28" />
				</g>
			</g>
		</svg>
	);
}

export function ProblemIllustration({ kind }: { kind: ProblemKind }) {
	return (
		<div
			aria-hidden="true"
			className="relative aspect-[15/9] w-full overflow-hidden bg-olive-50 text-olive-900 dark:bg-olive-900 dark:text-white"
		>
			{kind === "featureBloat" && <FeatureBloatGraphic />}
			{kind === "vendorLockIn" && <VendorLockInGraphic />}
			{kind === "rigidWorkflows" && <RigidWorkflowsGraphic />}
		</div>
	);
}
