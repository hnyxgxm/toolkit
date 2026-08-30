import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import TaxTool from "@/components/tools/TaxTool";

const seo = findTool("tax")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <TaxTool />
    </>
  );
}
