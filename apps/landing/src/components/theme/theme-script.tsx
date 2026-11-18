// Runs synchronously in <head> before the body paints. Reads the persisted
// theme choice and applies the `dark` class / `data-theme` attribute on the
// <html> element so there is no flash of the wrong theme on first paint.
//
// Must stay a Server Component — it emits a raw <script> tag. Marking it
// 'use client' would defer it to hydration, defeating the purpose.

const script = `(function(){var s='dark';try{var v=localStorage.getItem('lunaris-theme');if(v==='light'||v==='system')s=v;}catch(e){}var d=s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=s;})();`;

export function ThemeScript() {
	return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
