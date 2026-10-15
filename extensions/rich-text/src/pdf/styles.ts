import { StyleSheet } from "@react-pdf/renderer";
import type { PdfTheme } from "./theme";

const A4_PAGE_HEIGHT = 841.89;

export function createStyles(theme: PdfTheme) {
  const pageNumberTop =
    A4_PAGE_HEIGHT -
    Math.max(18, theme.page.marginBottom / 2 + theme.fontSize.body / 2);

  return StyleSheet.create({
    page: {
      paddingTop: theme.page.marginTop,
      paddingBottom: theme.page.marginBottom,
      paddingLeft: theme.page.marginLeft,
      paddingRight: theme.page.marginRight,
      fontFamily: "Helvetica",
      fontSize: theme.fontSize.body,
      color: theme.colors.text,
      lineHeight: theme.lineHeight.body,
    },
    pageNumber: {
      position: "absolute" as const,
      top: pageNumberTop,
      left: 0,
      right: 0,
      fontFamily: "Helvetica",
      fontSize: theme.fontSize.body,
      color: theme.colors.text,
      textAlign: "center" as const,
    },
    title: {
      fontSize: theme.fontSize.title,
      fontFamily: "Helvetica-Bold",
      color: theme.colors.heading,
      lineHeight: theme.lineHeight.heading,
      marginBottom: 20,
    },
    h1: {
      fontSize: theme.fontSize.h1,
      fontFamily: "Helvetica-Bold",
      color: theme.colors.heading,
      lineHeight: theme.lineHeight.heading,
      marginTop: theme.spacing.headingGap,
      marginBottom: 4,
    },
    h2: {
      fontSize: theme.fontSize.h2,
      fontFamily: "Helvetica-Bold",
      color: theme.colors.heading,
      lineHeight: theme.lineHeight.heading,
      marginTop: theme.spacing.headingGap,
      marginBottom: 4,
    },
    h3: {
      fontSize: theme.fontSize.h3,
      fontFamily: "Helvetica-Bold",
      color: theme.colors.heading,
      lineHeight: theme.lineHeight.heading,
      marginTop: theme.spacing.headingGap,
      marginBottom: 4,
    },
    paragraph: {
      marginBottom: theme.spacing.paragraphGap,
    },
    listItem: {
      flexDirection: "row" as const,
      marginBottom: 2,
    },
    listBullet: {
      width: 15,
      textAlign: "right" as const,
      marginRight: 5,
    },
    listContent: {
      flex: 1,
    },
    codeBlock: {
      backgroundColor: theme.colors.codeBg,
      padding: theme.spacing.codeBlockPadding,
      fontFamily: "Courier",
      fontSize: theme.fontSize.code,
      marginBottom: theme.spacing.paragraphGap,
      borderRadius: 3,
    },
    image: {
      marginBottom: theme.spacing.paragraphGap,
      maxWidth: "100%",
    },
    tableRow: {
      flexDirection: "row" as const,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.tableBorder,
    },
    tableCell: {
      flex: 1,
      padding: 4,
      borderRightWidth: 1,
      borderRightColor: theme.colors.tableBorder,
    },
    tableContainer: {
      borderWidth: 1,
      borderColor: theme.colors.tableBorder,
      marginBottom: theme.spacing.paragraphGap,
    },
  });
}

export type Styles = ReturnType<typeof createStyles>;

/** Heading helper shared by heading sections and blocknote heading blocks. */
export function headingStyleFor(styles: Styles, level: number) {
  return level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
}
