export default function AdPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-gray-50 border border-dashed border-gray-200 rounded-xl flex items-center justify-center text-xs text-gray-400 ${className}`}>
      {/* Google AdSense 广告位 - 替换为实际的 AdSense 代码 */}
      广告位
    </div>
  );
}
