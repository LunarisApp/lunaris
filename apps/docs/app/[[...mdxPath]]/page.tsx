import type { Metadata } from "next";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "../../mdx-components";

type PageProps = {
	params: Promise<{ mdxPath?: string[] }>;
};

export const generateStaticParams = generateStaticParamsFor("mdxPath");

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { mdxPath } = await params;
	const { metadata } = await importPage(mdxPath);

	return {
		...metadata,
		title: mdxPath?.length ? metadata.title : { absolute: metadata.title },
	};
}

export default async function Page(props: PageProps) {
	const params = await props.params;
	const { default: MDXContent, toc, metadata, sourceCode } = await importPage(
		params.mdxPath,
	);
	const Wrapper = getMDXComponents().wrapper;

	if (!Wrapper) {
		throw new Error("Nextra theme did not provide an MDX wrapper");
	}

	return (
		<Wrapper metadata={metadata} sourceCode={sourceCode} toc={toc}>
			<MDXContent {...props} params={params} />
		</Wrapper>
	);
}
