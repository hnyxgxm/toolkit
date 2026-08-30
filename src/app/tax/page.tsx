import { findTool, toolMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/ui";
import TaxTool from "@/components/tools/TaxTool";

const seo = findTool("tax")!;
export const metadata = {
  ...toolMetadata(seo),
  description:
    "中国大陆个税计算器：按月估算五险一金与到手工资，支持年度综合所得汇算清缴（应退/应补）、2023 年标准专项附加扣除分类录入，税率表与社保基数均标注数据年份，每一笔口径假设透明可核对。",
};
export default function Page() {
  return (
    <>
      <JsonLd data={toolJsonLd(seo)} />
      <TaxTool />
    </>
  );
}
