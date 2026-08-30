import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import DiffTool from "@/components/tools/DiffTool";

const seo = findTool("diff")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <DiffTool />
    </>
  );
}
