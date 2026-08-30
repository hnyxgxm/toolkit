import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import TimestampTool from "@/components/tools/TimestampTool";

const seo = findTool("timestamp")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <TimestampTool />
    </>
  );
}
