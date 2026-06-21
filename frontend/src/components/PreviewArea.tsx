import { isHtmlMime, isMarkdownMime, isPdfMime } from "@/utils/documentFile";

interface PreviewAreaProps {
  mimeType: string;
  previewUrl: string;
}

export function PreviewArea({ mimeType, previewUrl }: PreviewAreaProps) {
  if (isPdfMime(mimeType)) {
    return (
      <iframe
        src={previewUrl}
        style={{ width: "100%", height: 600, border: "none" }}
        title="PDF 预览"
      />
    );
  }

  if (isHtmlMime(mimeType) || isMarkdownMime(mimeType)) {
    return (
      <iframe
        src={previewUrl}
        style={{ width: "100%", height: 600, border: "none" }}
        title="文档预览"
      />
    );
  }

  return (
    <div style={{ padding: 24, textAlign: "center", color: "#999" }}>
      该文件类型不支持内联预览，请点击"下载"按钮查看
    </div>
  );
}
