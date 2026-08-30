import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import PasswordTool from "@/components/tools/PasswordTool";

const seo = findTool("password")!;
export const metadata = toolMetadata(seo);
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <PasswordTool />
    </>
  );
}
