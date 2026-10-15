/** Theme configuration for PDF compilation */
export interface PdfTheme {
  colors: {
    codeBg: string;
    heading: string;
    link: string;
    tableBorder: string;
    text: string;
  };
  fontSize: {
    body: number;
    code: number;
    h1: number;
    h2: number;
    h3: number;
    title: number;
  };
  lineHeight: {
    body: number;
    heading: number;
  };
  page: {
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    marginTop: number;
  };
  pageNumbers: {
    enabled: boolean;
  };
  spacing: {
    codeBlockPadding: number;
    headingGap: number;
    listIndent: number;
    paragraphGap: number;
  };
}

export const DEFAULT_PDF_THEME: PdfTheme = {
  page: {
    marginTop: 60,
    marginBottom: 50,
    marginLeft: 55,
    marginRight: 55,
  },
  pageNumbers: { enabled: false },
  fontSize: { title: 24, h1: 22, h2: 18, h3: 15, body: 11, code: 10 },
  lineHeight: { body: 1.5, heading: 1.3 },
  spacing: {
    paragraphGap: 8,
    headingGap: 12,
    listIndent: 20,
    codeBlockPadding: 10,
  },
  colors: {
    text: "#000000",
    heading: "#000000",
    link: "#1a73e8",
    codeBg: "#f5f5f5",
    tableBorder: "#cccccc",
  },
};
