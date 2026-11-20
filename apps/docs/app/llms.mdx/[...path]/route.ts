import { docsLlms } from "../../../lib/source";

export const dynamic = "force-static";
export const dynamicParams = false;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function generateStaticParams() {
  const files = await docsLlms.files();
  return files.map((file) => ({ path: decodeURI(file).slice(1).split("/") }));
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { path } = await params;
  return (
    (await docsLlms.serve(`/${path.join("/")}`)) ??
    new Response(null, { status: 404 })
  );
}
