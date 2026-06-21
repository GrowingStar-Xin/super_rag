import { Descriptions, Tag } from "antd";
import type { DocumentChunkDetail } from "@/client";


interface ChunkDetailBodyProps {
  chunk: DocumentChunkDetail;
}

export function ChunkDetailBody({ chunk }: ChunkDetailBodyProps) {
  return (
    <div>
      <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Chunk 序号">
          {chunk.chunk_index}
        </Descriptions.Item>
        <Descriptions.Item label="字符数">{chunk.char_count}</Descriptions.Item>
        {chunk.page_no != null ? (
          <Descriptions.Item label="页码">{chunk.page_no}</Descriptions.Item>
        ) : null}
        {chunk.section_path ? (
          <Descriptions.Item label="章节路径">
            {chunk.section_path}
          </Descriptions.Item>
        ) : null}
        <Descriptions.Item label="Hash">
          <Tag>{chunk.chunk_hash}</Tag>
        </Descriptions.Item>
      </Descriptions>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "#f5f5f5",
          padding: 16,
          borderRadius: 8,
          maxHeight: 400,
          overflow: "auto",
        }}
      >
        {chunk.content}
      </pre>
    </div>
  );
}
