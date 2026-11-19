"use client";

import type { Locale } from "@/i18n/config";
import { useEffect, useRef, useState } from "react";

const captions = {
	en: ["To do", "Doing", "Done", "Review"],
	de: ["Offen", "In Arbeit", "Fertig", "Prüfen"],
	es: ["Pendiente", "En curso", "Hecho", "Revisar"],
	fr: ["À faire", "En cours", "Terminé", "Relire"],
	"pt-BR": ["A fazer", "Em curso", "Feito", "Revisar"],
} satisfies Record<Locale, [string, string, string, string]>;

const dataCaptions = {
	en: ["Spreadsheet", "Dashboard", "Week", "Tasks"],
	de: ["Tabelle", "Dashboard", "Woche", "Aufgaben"],
	es: ["Hoja de cálculo", "Panel", "Semana", "Tareas"],
	fr: ["Tableur", "Tableau de bord", "Semaine", "Tâches"],
	"pt-BR": ["Planilha", "Painel", "Semana", "Tarefas"],
} satisfies Record<Locale, [string, string, string, string]>;

const weeklyTasks = [8, 14, 20];

function DataViews({ locale }: { locale: Locale }) {
	const [sheet, dashboard, week, tasks] = dataCaptions[locale];
	return (
		<g fill="currentColor" fontSize="13">
			<g className="extension-sheet" opacity="0">
				<text x="135" y="69" fontSize="18" fontWeight="600">
					{sheet}
				</text>
				<rect x="135" y="81" width="257" height="24" rx="3" opacity=".07" />
				<path
					d="M135 105h257m-257 28h257m-257 28h257m-257 28h257M262 81v108"
					fill="none"
					stroke="currentColor"
					opacity=".19"
				/>
				<text x="146" y="98" fontWeight="500">
					{week}
				</text>
				<text x="382" y="98" textAnchor="end" fontWeight="500">
					{tasks}
				</text>
				{weeklyTasks.map((value, i) => (
					<g key={value} transform={`translate(0 ${28 * i})`}>
						<text x="146" y="124">
							0{i + 1}
						</text>
						<text
							x="381"
							y="124"
							textAnchor="end"
							className={
								i === weeklyTasks.length - 1 ? "extension-cell" : undefined
							}
						>
							{value}
						</text>
					</g>
				))}
				<g className="extension-cell">
					<rect
						x="262"
						y="161"
						width="130"
						height="28"
						rx="2"
						fill="none"
						stroke="currentColor"
					/>
					<rect x="389" y="186" width="6" height="6" rx="1" />
				</g>
			</g>
			<g className="extension-dashboard">
				<text x="135" y="69" fontSize="18" fontWeight="600">
					{dashboard}
				</text>
				<path d="M135 81h257" stroke="currentColor" opacity=".16" />
				<text x="135" y="139" fontSize="38" fontWeight="500" letterSpacing="-2">
					{weeklyTasks.reduce((sum, value) => sum + value, 0)}
				</text>
				<text x="136" y="159" opacity=".72">
					{tasks}
				</text>
				<path d="M218 168h173" stroke="currentColor" opacity=".2" />
				{weeklyTasks.map((value, i) => (
					<g key={value} transform={`translate(${227 + 57 * i} 0)`}>
						<g className="extension-bar">
							<rect
								x="3"
								y={168 - value * 2.8}
								width="31"
								height={value * 2.8}
								rx="3"
								opacity={0.36 + i * 0.29}
							/>
							<text x="18" y={162 - value * 2.8} textAnchor="middle">
								{value}
							</text>
						</g>
						<text x="18" y="188" textAnchor="middle" opacity=".72">
							0{i + 1}
						</text>
					</g>
				))}
			</g>
		</g>
	);
}

export function ExtensionShowcase({ locale }: { locale: Locale }) {
	const frame = useRef<HTMLDivElement>(null);
	const [started, setStarted] = useState(false);
	useEffect(() => {
		if (!frame.current) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				setStarted(true);
				observer.disconnect();
			},
			{ threshold: 0.5 },
		);
		observer.observe(frame.current);
		return () => observer.disconnect();
	}, []);
	const [todo, doing, done, review] = captions[locale];
	return (
		<div
			ref={frame}
			aria-hidden="true"
			data-playing={started}
			className="extension-scene min-w-0 overflow-hidden rounded-2xl border border-current/10 bg-olive-950/[.025] dark:bg-white/[.035]"
		>
			<svg
				viewBox="0 0 480 248"
				className="block w-full"
				fill="none"
				aria-hidden="true"
			>
				<rect
					x="64"
					y="42"
					width="346"
					height="172"
					rx="13"
					fill="currentColor"
					opacity=".06"
				/>
				<rect
					x="64"
					y="38"
					width="346"
					height="172"
					rx="13"
					className="fill-olive-50 dark:fill-black"
					stroke="currentColor"
					strokeOpacity=".25"
				/>
				<path d="M118 38v172" stroke="currentColor" opacity=".15" />
				<g
					stroke="currentColor"
					strokeWidth="1.7"
					strokeLinecap="round"
					opacity=".5"
				>
					<path d="M82 58h18m-18 5h11" />
				</g>
				<rect
					x="74"
					y="78"
					width="34"
					height="34"
					rx="8"
					stroke="currentColor"
					strokeDasharray="3 3"
					opacity=".4"
				/>
				<g className="extension-board" opacity="0">
					<text
						x="135"
						y="69"
						fill="currentColor"
						fontSize="18"
						fontWeight="600"
					>
						Kanban
					</text>
					<path d="M135 81h257" stroke="currentColor" opacity=".16" />
					{[todo, doing, done].map((label, i) => (
						<g key={label} transform={`translate(${135 + i * 88} 94)`}>
							<rect
								width="81"
								height="96"
								rx="6"
								fill="currentColor"
								opacity=".055"
							/>
							<text
								x="7"
								y="19"
								fill="currentColor"
								fontSize="12"
								fontWeight="500"
							>
								{label}
							</text>
						</g>
					))}
					<g transform="translate(141 124)">
						<rect
							width="69"
							height="32"
							rx="4"
							stroke="currentColor"
							strokeOpacity=".22"
							className="fill-olive-50 dark:fill-black"
						/>
						<path
							d="M8 11h40m-40 8h24"
							stroke="currentColor"
							opacity=".35"
							strokeLinecap="round"
							strokeWidth="2"
						/>
					</g>
					<g className="extension-task">
						<rect
							x="317"
							y="126"
							width="69"
							height="32"
							rx="5"
							fill="currentColor"
							opacity=".13"
						/>
						<rect
							x="317"
							y="124"
							width="69"
							height="32"
							rx="5"
							fill="currentColor"
						/>
						<text
							x="324"
							y="144"
							className="fill-white dark:fill-black"
							fontSize="12"
							fontWeight="500"
						>
							{review}
						</text>
						<path
							className="extension-check stroke-white dark:stroke-black"
							d="m371 140 3 3 6-7"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="1.6"
						/>
					</g>
				</g>
				<DataViews locale={locale} />
				<g transform="translate(74 78)">
					<g className="extension-module">
						<rect width="34" height="34" rx="8" fill="currentColor" />
						<g className="fill-white dark:fill-black">
							<rect x="7" y="9" width="5" height="11" rx="1.3" />
							<rect x="15" y="9" width="5" height="17" rx="1.3" />
							<rect x="23" y="9" width="5" height="8" rx="1.3" />
						</g>
					</g>
				</g>
				<g transform="translate(74 119)">
					<g className="extension-module extension-sheet-module">
						<rect width="34" height="34" rx="8" fill="currentColor" />
						<g className="stroke-white dark:stroke-black" strokeWidth="1.6">
							<rect x="7.5" y="8" width="19" height="18" rx="2" />
							<path d="M8 14h18M8 20h18m-11-6v12" />
						</g>
					</g>
				</g>
				<g transform="translate(74 160)">
					<g className="extension-module extension-dashboard-module">
						<rect width="34" height="34" rx="8" fill="currentColor" />
						<path
							d="M9 24v-5m8 5V14m8 10V9"
							className="stroke-white dark:stroke-black"
							strokeWidth="3.5"
							strokeLinecap="round"
						/>
					</g>
				</g>
			</svg>
		</div>
	);
}
