import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import HtmlTool from "@/components/tools/HtmlTool";

const seo = findTool("html")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <HtmlTool />
    </>
  );
}
