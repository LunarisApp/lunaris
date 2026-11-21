import { defineI18nUI, type Translations } from "fumadocs-ui/i18n";
import { defaultLocale, type Locale, locales } from "./locale";

export const docsCopy = {
  en: {
    docs: "Docs",
    overview: "Overview",
    getStarted: "Get Started",
    fallback: "",
    separators: {},
  },
  es: {
    docs: "Documentación",
    overview: "Vista general",
    getStarted: "Empezar",
    fallback: "Esta página está disponible en inglés.",
    separators: {
      Reference: "Referencia",
      Troubleshooting: "Solución de problemas",
    },
  },
  fr: {
    docs: "Documentation",
    overview: "Vue d’ensemble",
    getStarted: "Commencer",
    fallback: "Cette page est disponible en anglais.",
    separators: { Reference: "Référence", Troubleshooting: "Dépannage" },
  },
  de: {
    docs: "Dokumentation",
    overview: "Übersicht",
    getStarted: "Loslegen",
    fallback: "Diese Seite ist auf Englisch verfügbar.",
    separators: { Reference: "Referenz", Troubleshooting: "Fehlerbehebung" },
  },
  "pt-BR": {
    docs: "Documentação",
    overview: "Visão geral",
    getStarted: "Começar",
    fallback: "Esta página está disponível em inglês.",
    separators: {
      Reference: "Referência",
      Troubleshooting: "Solução de problemas",
    },
  },
} satisfies Record<
  Locale,
  {
    docs: string;
    overview: string;
    getStarted: string;
    fallback: string;
    separators: Record<string, string>;
  }
>;

const translations = {
  en: { displayName: "English" },
  es: {
    displayName: "Español",
    "Choose a language(language switcher)": "Elegir idioma",
    "Choose a language(language switcher)(aria-label)": "Elegir idioma",
    "Close Search(search dialog)(aria-label)": "Cerrar búsqueda",
    "Close Sidebar(sidebar)(aria-label)": "Cerrar barra lateral",
    "Close Sidebar(aria-label)": "Cerrar barra lateral",
    "Collapse Sidebar(sidebar)(aria-label)": "Contraer barra lateral",
    "Copied Anchor Link(heading anchor)(aria-label)":
      "Enlace de sección copiado",
    "Copied Markdown(page actions)": "Markdown copiado",
    "Copied Text(code block)(aria-label)": "Texto copiado",
    "Copy Anchor Link(heading anchor)(aria-label)": "Copiar enlace de sección",
    "Copy Markdown(page actions)": "Copiar Markdown",
    "Copy Text(code block)(aria-label)": "Copiar texto",
    "Dark(theme switcher)(aria-label)": "Oscuro",
    "Light(theme switcher)(aria-label)": "Claro",
    "Next Page(pagination)": "Página siguiente",
    "No results found(search dialog)": "No se encontraron resultados",
    "On this page(table of contents)": "En esta página",
    "Open Search(search trigger)(aria-label)": "Abrir búsqueda",
    "Open Sidebar(sidebar)(aria-label)": "Abrir barra lateral",
    "Previous Page(pagination)": "Página anterior",
    "Search failed(search dialog)": "Error en la búsqueda",
    "Search failed, showing results for {query}(search dialog)":
      "Error en la búsqueda. Se muestran resultados para {query}",
    "Search(search dialog)": "Buscar",
    "Search(search trigger)": "Buscar",
    "Skip to Content(skip link)": "Saltar al contenido",
    "System(theme switcher)(aria-label)": "Sistema",
    "Toggle Theme(theme switcher)(aria-label)": "Cambiar tema",
  },
  fr: {
    displayName: "Français",
    "Choose a language(language switcher)": "Choisir une langue",
    "Choose a language(language switcher)(aria-label)": "Choisir une langue",
    "Close Search(search dialog)(aria-label)": "Fermer la recherche",
    "Close Sidebar(sidebar)(aria-label)": "Fermer la barre latérale",
    "Close Sidebar(aria-label)": "Fermer la barre latérale",
    "Collapse Sidebar(sidebar)(aria-label)": "Réduire la barre latérale",
    "Copied Anchor Link(heading anchor)(aria-label)": "Lien de section copié",
    "Copied Markdown(page actions)": "Markdown copié",
    "Copied Text(code block)(aria-label)": "Texte copié",
    "Copy Anchor Link(heading anchor)(aria-label)":
      "Copier le lien de la section",
    "Copy Markdown(page actions)": "Copier le Markdown",
    "Copy Text(code block)(aria-label)": "Copier le texte",
    "Dark(theme switcher)(aria-label)": "Sombre",
    "Light(theme switcher)(aria-label)": "Clair",
    "Next Page(pagination)": "Page suivante",
    "No results found(search dialog)": "Aucun résultat",
    "On this page(table of contents)": "Sur cette page",
    "Open Search(search trigger)(aria-label)": "Ouvrir la recherche",
    "Open Sidebar(sidebar)(aria-label)": "Ouvrir la barre latérale",
    "Previous Page(pagination)": "Page précédente",
    "Search failed(search dialog)": "La recherche a échoué",
    "Search failed, showing results for {query}(search dialog)":
      "La recherche a échoué. Résultats affichés pour {query}",
    "Search(search dialog)": "Rechercher",
    "Search(search trigger)": "Rechercher",
    "Skip to Content(skip link)": "Aller au contenu",
    "System(theme switcher)(aria-label)": "Système",
    "Toggle Theme(theme switcher)(aria-label)": "Changer de thème",
  },
  de: {
    displayName: "Deutsch",
    "Choose a language(language switcher)": "Sprache auswählen",
    "Choose a language(language switcher)(aria-label)": "Sprache auswählen",
    "Close Search(search dialog)(aria-label)": "Suche schließen",
    "Close Sidebar(sidebar)(aria-label)": "Seitenleiste schließen",
    "Close Sidebar(aria-label)": "Seitenleiste schließen",
    "Collapse Sidebar(sidebar)(aria-label)": "Seitenleiste einklappen",
    "Copied Anchor Link(heading anchor)(aria-label)": "Abschnittslink kopiert",
    "Copied Markdown(page actions)": "Markdown kopiert",
    "Copied Text(code block)(aria-label)": "Text kopiert",
    "Copy Anchor Link(heading anchor)(aria-label)": "Abschnittslink kopieren",
    "Copy Markdown(page actions)": "Markdown kopieren",
    "Copy Text(code block)(aria-label)": "Text kopieren",
    "Dark(theme switcher)(aria-label)": "Dunkel",
    "Light(theme switcher)(aria-label)": "Hell",
    "Next Page(pagination)": "Nächste Seite",
    "No results found(search dialog)": "Keine Ergebnisse",
    "On this page(table of contents)": "Auf dieser Seite",
    "Open Search(search trigger)(aria-label)": "Suche öffnen",
    "Open Sidebar(sidebar)(aria-label)": "Seitenleiste öffnen",
    "Previous Page(pagination)": "Vorherige Seite",
    "Search failed(search dialog)": "Suche fehlgeschlagen",
    "Search failed, showing results for {query}(search dialog)":
      "Suche fehlgeschlagen. Ergebnisse für {query} werden angezeigt",
    "Search(search dialog)": "Suchen",
    "Search(search trigger)": "Suchen",
    "Skip to Content(skip link)": "Zum Inhalt springen",
    "System(theme switcher)(aria-label)": "System",
    "Toggle Theme(theme switcher)(aria-label)": "Design wechseln",
  },
  "pt-BR": {
    displayName: "Português (BR)",
    "Choose a language(language switcher)": "Escolher idioma",
    "Choose a language(language switcher)(aria-label)": "Escolher idioma",
    "Close Search(search dialog)(aria-label)": "Fechar busca",
    "Close Sidebar(sidebar)(aria-label)": "Fechar barra lateral",
    "Close Sidebar(aria-label)": "Fechar barra lateral",
    "Collapse Sidebar(sidebar)(aria-label)": "Recolher barra lateral",
    "Copied Anchor Link(heading anchor)(aria-label)": "Link da seção copiado",
    "Copied Markdown(page actions)": "Markdown copiado",
    "Copied Text(code block)(aria-label)": "Texto copiado",
    "Copy Anchor Link(heading anchor)(aria-label)": "Copiar link da seção",
    "Copy Markdown(page actions)": "Copiar Markdown",
    "Copy Text(code block)(aria-label)": "Copiar texto",
    "Dark(theme switcher)(aria-label)": "Escuro",
    "Light(theme switcher)(aria-label)": "Claro",
    "Next Page(pagination)": "Próxima página",
    "No results found(search dialog)": "Nenhum resultado encontrado",
    "On this page(table of contents)": "Nesta página",
    "Open Search(search trigger)(aria-label)": "Abrir busca",
    "Open Sidebar(sidebar)(aria-label)": "Abrir barra lateral",
    "Previous Page(pagination)": "Página anterior",
    "Search failed(search dialog)": "Falha na busca",
    "Search failed, showing results for {query}(search dialog)":
      "Falha na busca. Exibindo resultados para {query}",
    "Search(search dialog)": "Buscar",
    "Search(search trigger)": "Buscar",
    "Skip to Content(skip link)": "Pular para o conteúdo",
    "System(theme switcher)(aria-label)": "Sistema",
    "Toggle Theme(theme switcher)(aria-label)": "Alternar tema",
  },
} satisfies Record<Locale, Partial<Translations>>;

export const i18n = defineI18nUI(
  {
    defaultLanguage: defaultLocale,
    hideLocale: "default-locale",
    languages: [...locales],
  },
  translations
);

export function onThisPage(locale: Locale) {
  return (
    i18n.provider(locale).translations?.["On this page(table of contents)"] ??
    "On this page"
  );
}
