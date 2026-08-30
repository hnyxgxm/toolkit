import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import MarkdownTool from "@/components/tools/MarkdownTool";

const seo = findTool("markdown")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <MarkdownTool />
    </>
  );
}
