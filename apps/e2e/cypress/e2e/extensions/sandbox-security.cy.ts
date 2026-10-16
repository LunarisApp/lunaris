/// <reference path="../../support/index.d.ts" />

export {};

interface SandboxSecurityResult {
  cookieBlocked: boolean;
  directFetchBlocked: boolean;
  indexedDbBlocked: boolean;
  localStorageBlocked: boolean;
  parentDomBlocked: boolean;
  parentGlobalBlocked: boolean;
  topNavigationBlocked: boolean;
  webSocketBlocked: boolean;
  workerExecuted: boolean;
  workerFetchBlocked: boolean;
}

describe("extensions/sandbox security", () => {
  it("isolates an opaque-origin extension frame and blocks direct networking", () => {
    cy.visit("/");
    cy.window().then(
      (hostWindow) =>
        new Promise<void>((resolve, reject) => {
          hostWindow.document.cookie =
            "lunaris_sandbox_secret=host; SameSite=Lax";
          Object.assign(hostWindow, {
            __LUNARIS_SANDBOX_HOST_SECRET__: "host",
          });

          const script = `
            const blocked = (run) => { try { run(); return false; } catch { return true; } };
            const cookieBlocked = (() => {
              try { return !document.cookie.includes("lunaris_sandbox_secret"); }
              catch { return true; }
            })();
            const indexedDbBlocked = new Promise((resolve) => {
              const timer = setTimeout(() => resolve(true), 500);
              try {
                const request = indexedDB.open("sandbox-test");
                request.onerror = () => { clearTimeout(timer); resolve(true); };
                request.onsuccess = () => { clearTimeout(timer); request.result.close(); resolve(false); };
              } catch { resolve(true); }
            });
            const directFetchBlocked = Promise.race([
              fetch(location.href).then(() => false, () => true),
              new Promise((resolve) => setTimeout(() => resolve(true), 500)),
            ]);
            const webSocketBlocked = new Promise((resolve) => {
              try {
                const socket = new WebSocket("wss://example.com/");
                socket.onopen = () => { socket.close(); resolve(false); };
                socket.onerror = () => resolve(true);
                setTimeout(() => {
                  try { socket.close(); } catch {}
                  resolve(true);
                }, 500);
              } catch { resolve(true); }
            });
            const workerResult = new Promise((resolve) => {
              const source = 'self.onmessage=async()=>{let blocked=false;try{await fetch("https://example.com/")}catch{blocked=true}self.postMessage({blocked,value:21*2})}';
              const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
              try {
                const worker = new Worker(url);
                const timer = setTimeout(() => { worker.terminate(); resolve({ blocked: false, value: 0 }); }, 1000);
                worker.onmessage = ({ data }) => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); resolve(data); };
                worker.onerror = () => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); resolve({ blocked: false, value: 0 }); };
                worker.postMessage(null);
              } catch {
                URL.revokeObjectURL(url);
                resolve({ blocked: false, value: 0 });
              }
            });
            Promise.all([directFetchBlocked, indexedDbBlocked, webSocketBlocked, workerResult]).then(
              ([fetchBlocked, databaseBlocked, socketBlocked, worker]) => parent.postMessage({
                cookieBlocked,
                directFetchBlocked: fetchBlocked,
                indexedDbBlocked: databaseBlocked,
                localStorageBlocked: blocked(() => localStorage.getItem("host")),
                parentDomBlocked: blocked(() => parent.document.body),
                parentGlobalBlocked: blocked(() => parent.__LUNARIS_SANDBOX_HOST_SECRET__),
                topNavigationBlocked: blocked(() => { top.location.href = "/sandbox-navigation-escape"; }),
                type: "lunaris-sandbox-security-result",
                webSocketBlocked: socketBlocked,
                workerExecuted: worker.value === 42,
                workerFetchBlocked: worker.blocked,
              }, "*"),
            );
          `;
          const bootstrap =
            'if(origin!=="null")throw new Error("Sandbox bootstrap requires an opaque origin");const decode=id=>Uint8Array.from(atob(document.getElementById(id)?.textContent||""),value=>value.charCodeAt(0));const style=document.createElement("style");style.textContent=new TextDecoder().decode(decode("lunaris-plugin-style"));document.head.append(style);const scriptUrl=URL.createObjectURL(new Blob([decode("lunaris-plugin-script")],{type:"text/javascript"}));const script=document.createElement("script");script.src=scriptUrl;script.onload=script.onerror=()=>URL.revokeObjectURL(scriptUrl);document.head.append(script);';
          const scriptBase64 = hostWindow.btoa(script);
          const styleBase64 = hostWindow.btoa(
            "body{background:rgb(255,0,0)!important}"
          );
          const html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src blob: 'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg='; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><script type="application/octet-stream" id="lunaris-plugin-script">${scriptBase64}</script><script type="application/octet-stream" id="lunaris-plugin-style">${styleBase64}</script><script>${bootstrap}</script>`;
          const documentUrl = hostWindow.URL.createObjectURL(
            new hostWindow.Blob([html], { type: "text/html" })
          );
          const iframe = hostWindow.document.createElement("iframe");
          iframe.setAttribute("allow", "");
          iframe.setAttribute("sandbox", "allow-scripts");
          iframe.referrerPolicy = "no-referrer";

          const timeout = hostWindow.setTimeout(
            () => reject(new Error("Sandbox security fixture timed out")),
            5000
          );
          const cleanup = () => {
            hostWindow.clearTimeout(timeout);
            hostWindow.removeEventListener("message", receive);
            iframe.remove();
            hostWindow.URL.revokeObjectURL(documentUrl);
          };
          const receive = (
            event: MessageEvent<SandboxSecurityResult & { type?: string }>
          ) => {
            if (event.data?.type !== "lunaris-sandbox-security-result") {
              return;
            }
            try {
              expect(event.origin).to.eq("null");
              expect(event.data).to.include({
                cookieBlocked: true,
                directFetchBlocked: true,
                indexedDbBlocked: true,
                localStorageBlocked: true,
                parentDomBlocked: true,
                parentGlobalBlocked: true,
                topNavigationBlocked: true,
                webSocketBlocked: true,
                workerExecuted: true,
                workerFetchBlocked: true,
              });
              expect(
                hostWindow.getComputedStyle(hostWindow.document.body)
                  .backgroundColor
              ).not.to.eq("rgb(255, 0, 0)");
              cleanup();
              resolve();
            } catch (error) {
              cleanup();
              reject(error);
            }
          };
          hostWindow.addEventListener("message", receive);
          iframe.src = documentUrl;
          hostWindow.document.body.append(iframe);
        })
    );
  });
});
