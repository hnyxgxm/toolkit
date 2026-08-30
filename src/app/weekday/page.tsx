import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import WeekdayTool from "@/components/tools/WeekdayTool";

const seo = findTool("weekday")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <WeekdayTool />
    </>
  );
}
