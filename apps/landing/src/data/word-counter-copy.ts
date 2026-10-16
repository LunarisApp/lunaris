import type { Locale } from "@/i18n/config";
import type { ReadabilityBand } from "@/lib/readability-analysis";

type BandCopy = Record<
	ReadabilityBand,
	{
		guidance: string;
		label: string;
	}
>;

export type WordCounterCopy = {
	actions: {
		cancel: string;
		clear: string;
		cleared: string;
		confirmClear: string;
		copied: string;
		copy: string;
		copyFailed: string;
		enterFullscreen: string;
		exitFullscreen: string;
		openInChat: string;
		openInChatTooLong: string;
		tryExample: string;
	};
	controls: {
		language: string;
	};
	cta: {
		body: string;
		learn: string;
		open: string;
		title: string;
	};
	editor: {
		analysisUnavailable: string;
		analyzing: string;
		label: string;
		limitReached: string;
		placeholder: string;
	};
	example: string;
	heading: string;
	meta: {
		description: string;
		title: string;
	};
	metrics: {
		averageCharacters: string;
		averageSentence: string;
		averageSyllables: string;
		characters: string;
		charactersWithoutSpaces: string;
		details: string;
		longWords: string;
		polysyllableCount: string;
		readingTime: string;
		readability: string;
		sentences: string;
		syllables: string;
		topWords: string;
		words: string;
	};
	privacy: string;
	readability: {
		bands: BandCopy;
		formula: string;
		grade: string;
		loading: string;
		notEnough: string;
		score: string;
		unavailable: string;
		unsupported: string;
	};
};

const en: WordCounterCopy = {
	heading: "Free word counter & readability checker",
	meta: {
		title: "Free Word Counter & Readability Checker — Private | Lunaris",
		description:
			"Count words and characters, estimate reading time, and check readability. Free, instant, and processed privately in your browser.",
	},
	privacy: "Your text stays on this device",
	editor: {
		analysisUnavailable: "Analysis is unavailable. Your text is safe.",
		analyzing: "Analyzing your text…",
		label: "Your text",
		placeholder: "Paste or start writing…",
		limitReached: "Character limit reached. Your existing text is safe.",
	},
	actions: {
		tryExample: "Try an example",
		copy: "Copy text",
		copied: "Copied",
		copyFailed: "Select and copy the text manually.",
		clear: "Clear",
		cleared: "Text cleared",
		confirmClear: "Clear text?",
		cancel: "Cancel",
		enterFullscreen: "Fullscreen",
		exitFullscreen: "Exit fullscreen",
		openInChat: "Open in chat",
		openInChatTooLong: "Text is too long to open in chat",
	},
	controls: {
		language: "Text language",
	},
	metrics: {
		words: "Words",
		characters: "Characters",
		readingTime: "Reading time",
		readability: "Readability",
		details: "Text details",
		charactersWithoutSpaces: "Characters without spaces",
		sentences: "Sentences",
		averageSentence: "Average words per sentence",
		averageCharacters: "Average characters per word",
		averageSyllables: "Average syllables per word",
		longWords: "Words longer than 10 characters",
		polysyllableCount: "Polysyllabic words",
		syllables: "Syllables",
		topWords: "Top meaningful words",
	},
	readability: {
		notEnough: "Add about 100 words for a more useful readability estimate.",
		unsupported:
			"Counts are ready. Readability scoring currently supports English text.",
		loading: "Reading the shape of your text…",
		unavailable: "Readability is unavailable. Your counts still work.",
		score: "Flesch Reading Ease",
		grade: "Estimated U.S. grade level",
		formula: "An estimate, not a judgment of writing quality.",
		bands: {
			veryEasy: {
				label: "Very easy to read",
				guidance: "Comfortable for a broad audience.",
			},
			easy: {
				label: "Easy to read",
				guidance: "Comfortable for most adults.",
			},
			fairlyEasy: {
				label: "Fairly easy to read",
				guidance: "Clear for a general audience.",
			},
			standard: {
				label: "Plain and balanced",
				guidance: "Typical general-purpose writing.",
			},
			fairlyDifficult: {
				label: "Fairly detailed",
				guidance: "Some readers may need more time.",
			},
			difficult: {
				label: "Dense reading",
				guidance: "Best suited to experienced readers.",
			},
			veryDifficult: {
				label: "Very dense reading",
				guidance: "Specialist language or long sentences may be present.",
			},
		},
	},
	cta: {
		title: "Good writing deserves a better home.",
		body: "Keep drafting privately across desktop and web with Lunaris.",
		open: "Continue in Lunaris",
		learn: "Learn more",
	},
	example:
		"Good writing begins with a clear idea. Each sentence should help the reader move forward without unnecessary effort. Short sentences can create pace, while longer ones can connect details and show how ideas relate. The goal is not to make every line identical. Variety keeps a page alive. Read your work slowly, remove words that add no meaning, and give important thoughts enough room. A useful draft does not need to sound impressive. It needs to respect the reader’s time. When the structure is clear, people can focus on the message instead of finding their way through it. That is where careful editing makes the greatest difference.",
};

const es: WordCounterCopy = {
	...en,
	heading: "Contador de palabras y legibilidad gratis",
	meta: {
		title: "Contador de palabras y legibilidad gratis y privado | Lunaris",
		description:
			"Cuenta palabras y caracteres, calcula el tiempo de lectura y revisa la legibilidad. Gratis, instantáneo y privado.",
	},
	privacy: "Tu texto permanece en este dispositivo",
	editor: {
		analysisUnavailable:
			"El análisis no está disponible. Tu texto está a salvo.",
		analyzing: "Analizando el texto…",
		label: "Tu texto",
		placeholder: "Pega un texto o empieza a escribir…",
		limitReached: "Límite de caracteres alcanzado. Tu texto está a salvo.",
	},
	actions: {
		tryExample: "Probar un ejemplo",
		copy: "Copiar texto",
		copied: "Copiado",
		copyFailed: "Selecciona y copia el texto manualmente.",
		clear: "Borrar",
		cleared: "Texto borrado",
		confirmClear: "¿Borrar el texto?",
		cancel: "Cancelar",
		enterFullscreen: "Pantalla completa",
		exitFullscreen: "Salir de pantalla completa",
		openInChat: "Abrir en un chat",
		openInChatTooLong: "El texto es demasiado largo para abrirlo en un chat",
	},
	controls: {
		language: "Idioma del texto",
	},
	metrics: {
		words: "Palabras",
		characters: "Caracteres",
		readingTime: "Tiempo de lectura",
		readability: "Legibilidad",
		details: "Detalles del texto",
		charactersWithoutSpaces: "Caracteres sin espacios",
		sentences: "Frases",
		averageSentence: "Media de palabras por frase",
		averageCharacters: "Media de caracteres por palabra",
		averageSyllables: "Media de sílabas por palabra",
		longWords: "Palabras de más de 10 caracteres",
		polysyllableCount: "Palabras polisílabas",
		syllables: "Sílabas",
		topWords: "Palabras relevantes más usadas",
	},
	readability: {
		...en.readability,
		notEnough: "Añade unas 100 palabras para obtener una estimación más útil.",
		unsupported:
			"Los recuentos están listos. La puntuación de legibilidad admite por ahora textos en inglés.",
		loading: "Analizando la forma del texto…",
		unavailable:
			"La legibilidad no está disponible. Los recuentos siguen funcionando.",
		score: "Facilidad de lectura de Flesch",
		grade: "Nivel escolar estimado de EE. UU.",
		formula: "Una estimación, no un juicio sobre la calidad.",
		bands: {
			veryEasy: {
				label: "Muy fácil de leer",
				guidance: "Cómodo para un público amplio.",
			},
			easy: {
				label: "Fácil de leer",
				guidance: "Cómodo para la mayoría de adultos.",
			},
			fairlyEasy: {
				label: "Bastante fácil",
				guidance: "Claro para un público general.",
			},
			standard: {
				label: "Claro y equilibrado",
				guidance: "Escritura general habitual.",
			},
			fairlyDifficult: {
				label: "Bastante detallado",
				guidance: "Algunos lectores necesitarán más tiempo.",
			},
			difficult: {
				label: "Lectura densa",
				guidance: "Más apropiado para lectores expertos.",
			},
			veryDifficult: {
				label: "Lectura muy densa",
				guidance: "Puede contener lenguaje especializado o frases largas.",
			},
		},
	},
	cta: {
		title: "La buena escritura merece un lugar mejor.",
		body: "Sigue escribiendo en privado desde escritorio y web con Lunaris.",
		open: "Continuar en Lunaris",
		learn: "Más información",
	},
	example:
		"Escribir bien empieza con una idea clara. Cada frase debe ayudar al lector a avanzar sin esfuerzo innecesario. Las frases cortas crean ritmo, mientras que las largas pueden conectar detalles y mostrar cómo se relacionan las ideas. El objetivo no es que todas las líneas sean iguales. La variedad mantiene viva una página. Lee el texto despacio, elimina las palabras que no aportan significado y deja espacio a las ideas importantes. Un borrador útil no necesita sonar impresionante. Debe respetar el tiempo del lector. Cuando la estructura es clara, las personas pueden centrarse en el mensaje en lugar de buscar el camino. Ahí es donde una edición cuidadosa marca la diferencia.",
};

const fr: WordCounterCopy = {
	...en,
	heading: "Compteur de mots et lisibilité gratuit",
	meta: {
		title: "Compteur de mots et lisibilité gratuit et privé | Lunaris",
		description:
			"Comptez mots et caractères, estimez le temps de lecture et vérifiez la lisibilité. Gratuit, instantané et privé.",
	},
	privacy: "Votre texte reste sur cet appareil",
	editor: {
		analysisUnavailable:
			"L’analyse est indisponible. Votre texte est conservé.",
		analyzing: "Analyse du texte…",
		label: "Votre texte",
		placeholder: "Collez un texte ou commencez à écrire…",
		limitReached:
			"Limite de caractères atteinte. Votre texte existant est conservé.",
	},
	actions: {
		tryExample: "Essayer un exemple",
		copy: "Copier le texte",
		copied: "Copié",
		copyFailed: "Sélectionnez et copiez le texte manuellement.",
		clear: "Effacer",
		cleared: "Texte effacé",
		confirmClear: "Effacer le texte ?",
		cancel: "Annuler",
		enterFullscreen: "Plein écran",
		exitFullscreen: "Quitter le plein écran",
		openInChat: "Ouvrir dans un chat",
		openInChatTooLong: "Le texte est trop long pour être ouvert dans un chat",
	},
	controls: {
		language: "Langue du texte",
	},
	metrics: {
		words: "Mots",
		characters: "Caractères",
		readingTime: "Temps de lecture",
		readability: "Lisibilité",
		details: "Détails du texte",
		charactersWithoutSpaces: "Caractères sans espaces",
		sentences: "Phrases",
		averageSentence: "Moyenne de mots par phrase",
		averageCharacters: "Moyenne de caractères par mot",
		averageSyllables: "Moyenne de syllabes par mot",
		longWords: "Mots de plus de 10 caractères",
		polysyllableCount: "Mots polysyllabiques",
		syllables: "Syllabes",
		topWords: "Mots significatifs fréquents",
	},
	readability: {
		...en.readability,
		notEnough: "Ajoutez environ 100 mots pour une estimation plus pertinente.",
		unsupported:
			"Les comptes sont prêts. Le score de lisibilité prend actuellement en charge les textes anglais.",
		loading: "Analyse de la forme du texte…",
		unavailable:
			"La lisibilité est indisponible. Les comptes fonctionnent toujours.",
		score: "Facilité de lecture de Flesch",
		grade: "Niveau scolaire américain estimé",
		formula: "Une estimation, pas un jugement de qualité.",
		bands: {
			veryEasy: {
				label: "Très facile à lire",
				guidance: "Confortable pour un large public.",
			},
			easy: {
				label: "Facile à lire",
				guidance: "Confortable pour la plupart des adultes.",
			},
			fairlyEasy: {
				label: "Assez facile à lire",
				guidance: "Clair pour un public général.",
			},
			standard: {
				label: "Clair et équilibré",
				guidance: "Une écriture généraliste classique.",
			},
			fairlyDifficult: {
				label: "Assez détaillé",
				guidance: "Certains lecteurs auront besoin de plus de temps.",
			},
			difficult: {
				label: "Lecture dense",
				guidance: "Mieux adapté aux lecteurs expérimentés.",
			},
			veryDifficult: {
				label: "Lecture très dense",
				guidance:
					"Un langage spécialisé ou de longues phrases peuvent être présents.",
			},
		},
	},
	cta: {
		title: "Une belle écriture mérite un meilleur espace.",
		body: "Continuez à écrire en privé sur ordinateur et sur le web avec Lunaris.",
		open: "Continuer dans Lunaris",
		learn: "En savoir plus",
	},
	example:
		"Bien écrire commence par une idée claire. Chaque phrase doit aider le lecteur à avancer sans effort inutile. Les phrases courtes donnent du rythme, tandis que les plus longues relient les détails et montrent comment les idées se répondent. Le but n’est pas de rendre toutes les lignes identiques. La variété garde une page vivante. Relisez lentement, retirez les mots qui n’ajoutent rien et laissez assez de place aux idées importantes. Un brouillon utile n’a pas besoin d’impressionner. Il doit respecter le temps du lecteur. Quand la structure est claire, chacun peut se concentrer sur le message plutôt que chercher son chemin. C’est là qu’une révision attentive fait la différence.",
};

const de: WordCounterCopy = {
	...en,
	heading: "Kostenloser Wortzähler & Lesbarkeitstest",
	meta: {
		title: "Kostenloser Wortzähler & Lesbarkeitstest | Lunaris",
		description:
			"Wörter und Zeichen zählen, Lesezeit schätzen und Lesbarkeit prüfen. Kostenlos, sofort und privat im Browser.",
	},
	privacy: "Ihr Text bleibt auf diesem Gerät",
	editor: {
		analysisUnavailable:
			"Die Analyse ist nicht verfügbar. Ihr Text ist sicher.",
		analyzing: "Text wird analysiert…",
		label: "Ihr Text",
		placeholder: "Text einfügen oder losschreiben…",
		limitReached: "Zeichenlimit erreicht. Ihr bestehender Text ist sicher.",
	},
	actions: {
		tryExample: "Beispiel ausprobieren",
		copy: "Text kopieren",
		copied: "Kopiert",
		copyFailed: "Text bitte manuell auswählen und kopieren.",
		clear: "Leeren",
		cleared: "Text geleert",
		confirmClear: "Text leeren?",
		cancel: "Abbrechen",
		enterFullscreen: "Vollbild",
		exitFullscreen: "Vollbild verlassen",
		openInChat: "Im Chat öffnen",
		openInChatTooLong: "Der Text ist zu lang, um ihn im Chat zu öffnen",
	},
	controls: {
		language: "Textsprache",
	},
	metrics: {
		words: "Wörter",
		characters: "Zeichen",
		readingTime: "Lesezeit",
		readability: "Lesbarkeit",
		details: "Textdetails",
		charactersWithoutSpaces: "Zeichen ohne Leerzeichen",
		sentences: "Sätze",
		averageSentence: "Wörter pro Satz im Mittel",
		averageCharacters: "Zeichen pro Wort im Mittel",
		averageSyllables: "Silben pro Wort im Mittel",
		longWords: "Wörter mit mehr als 10 Zeichen",
		polysyllableCount: "Mehrsilbige Wörter",
		syllables: "Silben",
		topWords: "Häufigste relevante Wörter",
	},
	readability: {
		...en.readability,
		notEnough: "Fügen Sie etwa 100 Wörter für eine bessere Schätzung hinzu.",
		unsupported:
			"Die Zählung ist fertig. Die Lesbarkeitswertung unterstützt derzeit englische Texte.",
		loading: "Textstruktur wird gelesen…",
		unavailable:
			"Lesbarkeit ist nicht verfügbar. Die Zählung funktioniert weiter.",
		score: "Flesch Reading Ease",
		grade: "Geschätzte US-Klassenstufe",
		formula: "Eine Schätzung, kein Qualitätsurteil.",
		bands: {
			veryEasy: {
				label: "Sehr leicht zu lesen",
				guidance: "Für ein breites Publikum gut zugänglich.",
			},
			easy: {
				label: "Leicht zu lesen",
				guidance: "Für die meisten Erwachsenen angenehm.",
			},
			fairlyEasy: {
				label: "Ziemlich leicht",
				guidance: "Für ein allgemeines Publikum klar.",
			},
			standard: {
				label: "Klar und ausgewogen",
				guidance: "Typischer allgemeinverständlicher Text.",
			},
			fairlyDifficult: {
				label: "Ziemlich detailliert",
				guidance: "Manche Leser benötigen mehr Zeit.",
			},
			difficult: {
				label: "Dichte Lektüre",
				guidance: "Eher für erfahrene Leser geeignet.",
			},
			veryDifficult: {
				label: "Sehr dichte Lektüre",
				guidance: "Fachsprache oder lange Sätze können enthalten sein.",
			},
		},
	},
	cta: {
		title: "Gute Texte verdienen ein besseres Zuhause.",
		body: "Schreiben Sie mit Lunaris auf Desktop und im Web privat weiter.",
		open: "In Lunaris fortfahren",
		learn: "Mehr erfahren",
	},
	example:
		"Gutes Schreiben beginnt mit einer klaren Idee. Jeder Satz sollte den Leser ohne unnötige Mühe voranbringen. Kurze Sätze schaffen Tempo, längere verbinden Details und zeigen Beziehungen zwischen Gedanken. Nicht jede Zeile muss gleich klingen. Abwechslung hält eine Seite lebendig. Lesen Sie Ihren Text langsam, streichen Sie Wörter ohne Bedeutung und geben Sie wichtigen Gedanken genug Raum. Ein nützlicher Entwurf muss nicht beeindruckend klingen. Er sollte die Zeit des Lesers achten. Wenn die Struktur klar ist, können sich Menschen auf die Botschaft konzentrieren, statt ihren Weg durch den Text zu suchen. Genau dort macht sorgfältiges Überarbeiten den größten Unterschied.",
};

const ptBR: WordCounterCopy = {
	...en,
	heading: "Contador de palavras e legibilidade grátis",
	meta: {
		title: "Contador de palavras e legibilidade grátis e privado | Lunaris",
		description:
			"Conte palavras e caracteres, estime o tempo de leitura e verifique a legibilidade. Grátis, instantâneo e privado.",
	},
	privacy: "Seu texto permanece neste dispositivo",
	editor: {
		analysisUnavailable: "A análise está indisponível. Seu texto está seguro.",
		analyzing: "Analisando o texto…",
		label: "Seu texto",
		placeholder: "Cole um texto ou comece a escrever…",
		limitReached: "Limite de caracteres atingido. Seu texto está seguro.",
	},
	actions: {
		tryExample: "Testar um exemplo",
		copy: "Copiar texto",
		copied: "Copiado",
		copyFailed: "Selecione e copie o texto manualmente.",
		clear: "Limpar",
		cleared: "Texto limpo",
		confirmClear: "Limpar o texto?",
		cancel: "Cancelar",
		enterFullscreen: "Tela cheia",
		exitFullscreen: "Sair da tela cheia",
		openInChat: "Abrir no chat",
		openInChatTooLong: "O texto é muito longo para abrir no chat",
	},
	controls: {
		language: "Idioma do texto",
	},
	metrics: {
		words: "Palavras",
		characters: "Caracteres",
		readingTime: "Tempo de leitura",
		readability: "Legibilidade",
		details: "Detalhes do texto",
		charactersWithoutSpaces: "Caracteres sem espaços",
		sentences: "Frases",
		averageSentence: "Média de palavras por frase",
		averageCharacters: "Média de caracteres por palavra",
		averageSyllables: "Média de sílabas por palavra",
		longWords: "Palavras com mais de 10 caracteres",
		polysyllableCount: "Palavras polissilábicas",
		syllables: "Sílabas",
		topWords: "Palavras relevantes mais usadas",
	},
	readability: {
		...en.readability,
		notEnough: "Adicione cerca de 100 palavras para uma estimativa mais útil.",
		unsupported:
			"As contagens estão prontas. A pontuação de legibilidade aceita atualmente textos em inglês.",
		loading: "Analisando a forma do texto…",
		unavailable:
			"A legibilidade está indisponível. As contagens continuam funcionando.",
		score: "Facilidade de leitura Flesch",
		grade: "Série escolar estimada nos EUA",
		formula: "Uma estimativa, não um julgamento de qualidade.",
		bands: {
			veryEasy: {
				label: "Muito fácil de ler",
				guidance: "Confortável para um público amplo.",
			},
			easy: {
				label: "Fácil de ler",
				guidance: "Confortável para a maioria dos adultos.",
			},
			fairlyEasy: {
				label: "Bastante fácil",
				guidance: "Claro para um público geral.",
			},
			standard: {
				label: "Claro e equilibrado",
				guidance: "Texto comum para uso geral.",
			},
			fairlyDifficult: {
				label: "Bastante detalhado",
				guidance: "Alguns leitores podem precisar de mais tempo.",
			},
			difficult: {
				label: "Leitura densa",
				guidance: "Mais adequado para leitores experientes.",
			},
			veryDifficult: {
				label: "Leitura muito densa",
				guidance: "Pode haver linguagem especializada ou frases muito longas.",
			},
		},
	},
	cta: {
		title: "Boa escrita merece um lugar melhor.",
		body: "Continue escrevendo com privacidade no desktop e na web com Lunaris.",
		open: "Continuar no Lunaris",
		learn: "Saiba mais",
	},
	example:
		"Escrever bem começa com uma ideia clara. Cada frase deve ajudar o leitor a avançar sem esforço desnecessário. Frases curtas criam ritmo, enquanto as longas conectam detalhes e mostram como as ideias se relacionam. O objetivo não é deixar todas as linhas iguais. A variedade mantém uma página viva. Leia seu texto devagar, retire palavras que não acrescentam significado e dê espaço suficiente aos pensamentos importantes. Um rascunho útil não precisa parecer impressionante. Ele precisa respeitar o tempo do leitor. Quando a estrutura é clara, as pessoas podem se concentrar na mensagem em vez de procurar o caminho. É aí que uma revisão cuidadosa faz a maior diferença.",
};

const copies: Record<Locale, WordCounterCopy> = {
	en,
	es,
	fr,
	de,
	"pt-BR": ptBR,
};

export function getWordCounterCopy(locale: Locale) {
	return copies[locale] ?? copies.en;
}
