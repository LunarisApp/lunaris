import { source } from "../../../../lib/source";

type RouteContext = {
  params: Promise<{ slug?: string[] }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) {
    return new Response(null, { status: 404 });
  }

  return new Response(await page.data.getText("processed"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
