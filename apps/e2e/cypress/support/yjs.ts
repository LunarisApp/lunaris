const persistenceSelector = "[data-yjs-persistence-state]";
const persistedMarker = "data-cy-yjs-target-persisted";

function observeYjsPersistenceForText(expectedText: string) {
  cy.get(persistenceSelector).then(($editor) => {
    const editor = $editor[0];
    const Observer = editor.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) {
      throw new Error("MutationObserver is unavailable");
    }

    editor.removeAttribute(persistedMarker);
    let observedTargetWrite = false;
    const observer = new Observer((records) => {
      const state = editor.getAttribute("data-yjs-persistence-state");
      const observedPersisting =
        state === "persisting" ||
        records.some((record) => record.oldValue === "persisting");
      observedTargetWrite ||=
        editor.textContent?.includes(expectedText) === true &&
        observedPersisting;

      if (state === "error") {
        editor.setAttribute(persistedMarker, "error");
        observer.disconnect();
      } else if (observedTargetWrite && state === "idle") {
        editor.setAttribute(persistedMarker, "true");
        observer.disconnect();
      }
    });

    observer.observe(editor, {
      attributeFilter: ["data-yjs-persistence-state"],
      attributeOldValue: true,
      attributes: true,
    });
  });

  return () =>
    cy.get(persistenceSelector, { timeout: 16_000 }).should(($editor) => {
      expect($editor.attr("data-yjs-persistence-state")).not.to.equal("error");
      expect($editor.attr(persistedMarker)).to.equal("true");
    });
}

export function typeYjsText(selector: string, text: string) {
  const waitForPersistence = observeYjsPersistenceForText(text);

  cy.get(selector)
    .last()
    .should("be.visible")
    .then(($editor) => {
      const editor = $editor[0];
      const view = editor.ownerDocument.defaultView;
      if (!view) {
        throw new Error("Editor window is unavailable");
      }

      // The inline content is not itself focusable. Focusing it leaves
      // ProseMirror's selection in its previous block (often the heading).
      // Place the caret in the requested paragraph before dispatching paste.
      const editable = editor.closest<HTMLElement>('[contenteditable="true"]');
      if (!editable) {
        throw new Error("Editable content is unavailable");
      }
      editable.focus();
      const selection = view.getSelection();
      if (!selection) {
        throw new Error("Editor selection is unavailable");
      }
      const range = editor.ownerDocument.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.ownerDocument.dispatchEvent(new view.Event("selectionchange"));
      const clipboardData = new view.DataTransfer();
      clipboardData.setData("text/plain", text);
      editor.dispatchEvent(
        new view.ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData,
        })
      );
    });

  waitForPersistence();
  cy.contains(selector, text).should("be.visible");
}
