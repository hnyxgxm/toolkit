import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import DateTool from "@/components/tools/DateTool";

const seo = findTool("date")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <DateTool />
    </>
  );
}
