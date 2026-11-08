/** Read only a selection wholly inside the active resource's rich-text editor. */
export function captureResourceSelection(target: Document, resourceId: string) {
  const selection = target.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const roots = target.querySelectorAll<HTMLElement>(
    "[data-lunaris-rich-text-resource]"
  );
  const root = Array.from(roots).find(
    (element) =>
      element.dataset.lunarisRichTextResource === resourceId &&
      element.querySelector(".bn-editor")?.contains(range.startContainer) &&
      element.querySelector(".bn-editor")?.contains(range.endContainer)
  );
  if (!root) {
    return null;
  }
  const text = selection.toString();
  if (!text || text.length > 100_000) {
    return null;
  }
  const html = root.innerHTML;
  const start = range.startContainer;
  const end = range.endContainer;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;
  return {
    text,
    isCurrent: () => {
      const current = target.getSelection();
      if (
        !root.isConnected ||
        root.innerHTML !== html ||
        !current ||
        current.rangeCount !== 1
      ) {
        return false;
      }
      const next = current.getRangeAt(0);
      return (
        next.startContainer === start &&
        next.endContainer === end &&
        next.startOffset === startOffset &&
        next.endOffset === endOffset
      );
    },
  };
}
