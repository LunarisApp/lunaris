import {
	llmsIndexPath,
	markdownPages,
	markdownPath,
} from "@/data/landing-pages";
import { renderLandingMarkdown } from "@/lib/landing-markdown";

export const dynamic = "force-static";
export const dynamicParams = false;

const pagesByMarkdownPath = new Map(
	markdownPages.map((page) => [markdownPath(page.path), page] as const),
);

export function generateStaticParams() {
	return Array.from(pagesByMarkdownPath.keys(), (path) => ({
		path: path.slice(1).split("/"),
	}));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params;
	const page = pagesByMarkdownPath.get(`/${path.join("/")}`);
	if (!page) return new Response(null, { status: 404 });

	return new Response(await renderLandingMarkdown(page), {
		headers: {
			"Content-Language": "en",
			"Content-Type": "text/markdown; charset=utf-8",
			Link: `<${llmsIndexPath(page.path)}>; rel="describedby"`,
		},
	});
}
