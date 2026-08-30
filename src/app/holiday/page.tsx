import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import HolidayTool from "@/components/tools/HolidayTool";

const seo = findTool("holiday")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <HolidayTool />
    </>
  );
}
