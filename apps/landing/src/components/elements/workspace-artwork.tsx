"use client";

import { useEffect, useRef } from "react";
import { FeatureSymbol } from "./feature-symbol";

function StorageDiagram() {
	return (
		<>
			{(["device", "cloud", "server"] as const).map((kind, i) => (
				<g key={kind}>
					<path
						d={
							[
								"M177 124C238 124 227 55 294 55",
								"M177 124H294",
								"M177 124C238 124 227 193 294 193",
							][i]
						}
						stroke="currentColor"
						strokeOpacity=".24"
						strokeDasharray="2 5"
					/>
					<svg
						aria-hidden="true"
						x="307"
						y={36 + i * 69}
						width="39"
						height="39"
						viewBox="0 0 24 24"
					>
						<FeatureSymbol kind={kind} className="size-full" />
					</svg>
				</g>
			))}
			<path
				className="storage-route"
				d="M177 124C238 124 227 193 294 193"
				pathLength="1"
				stroke="currentColor"
				strokeWidth="2"
			/>
			<circle
				className="storage-endpoint"
				cx="294"
				cy="193"
				r="3.5"
				fill="currentColor"
			/>
			<g>
				<path
					d="M76 143V94a6 6 0 0 1 6-6h24l9 9h54a6 6 0 0 1 6 6v40z"
					fill="currentColor"
					opacity=".27"
				/>
				<g className="storage-page">
					<rect
						x="92"
						y="85"
						width="65"
						height="61"
						rx="4"
						className="fill-olive-50 dark:fill-black"
						stroke="currentColor"
						strokeOpacity=".65"
					/>
					<path d="M103 97h40m-40 7h26" stroke="currentColor" opacity=".4" />
				</g>
				<path
					d="M72 115a5 5 0 0 1 5-6h96a5 5 0 0 1 5 6l-6 39a7 7 0 0 1-7 6H85a7 7 0 0 1-7-6z"
					fill="currentColor"
				/>
			</g>
		</>
	);
}

function AccessBadge() {
	return (
		<g transform="rotate(-7 226 125)">
			<g className="enterprise-badge">
				<rect
					x="109"
					y="64"
					width="213"
					height="132"
					rx="12"
					fill="currentColor"
				/>
				<g className="fill-olive-50 dark:fill-black">
					<rect x="196" y="75" width="40" height="5" rx="2.5" />
					<circle cx="155" cy="120" r="13" />
					<path d="M130 155a25 25 0 0 1 50 0z" />
					<rect x="198" y="116" width="82" height="5" rx="2.5" />
					<rect x="198" y="130" width="56" height="4" rx="2" opacity=".5" />
					<path
						d="M129 173h162"
						fill="none"
						className="stroke-olive-50 dark:stroke-black"
						opacity=".25"
					/>
				</g>
			</g>
			<g className="enterprise-seal">
				<circle
					cx="318"
					cy="171"
					r="23"
					className="fill-olive-50 dark:fill-black"
					stroke="currentColor"
					strokeWidth="2"
				/>
				<path
					className="enterprise-check"
					d="m308 171 7 7 13-15"
					pathLength="1"
					stroke="currentColor"
					strokeWidth="3"
				/>
			</g>
		</g>
	);
}

export function WorkspaceArtwork({ kind }: { kind: "storage" | "enterprise" }) {
	const frame = useRef<SVGSVGElement>(null);
	useEffect(() => {
		const svg = frame.current;
		if (!svg) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				svg.dataset.visible = "true";
				observer.disconnect();
			},
			{ threshold: 0.4 },
		);
		observer.observe(svg);
		return () => observer.disconnect();
	}, []);
	return (
		<svg
			ref={frame}
			aria-hidden="true"
			viewBox="0 0 440 248"
			fill="none"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="workspace-artwork block w-full rounded-2xl bg-current/[.035] dark:bg-white/[.045]"
		>
			{kind === "storage" ? <StorageDiagram /> : <AccessBadge />}
		</svg>
	);
}
