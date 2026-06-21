import { Button, Table, Tag } from "antd";
import type { TableProps } from "antd";
import type { UseQueryResult } from "@tanstack/react-query";
import type { DocumentChunkListResponse, DocumentChunkRead } from "@/client";
import { formatSize } from "@/utils/formatSize";

interface ChunksSectionProps {
  docStatus: string;
  chunksQuery: UseQueryResult<DocumentChunkListResponse>;
  page: number;
  onPageChange: (page: number) => void;
  onPickChunk: (chunkId: string | null) => void;
}

export function ChunksSection({
  docStatus,
  chunksQuery,
  page,
  onPageChange,
  onPickChunk,
}: ChunksSectionProps) {
  if (docStatus !== "ready") {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#999" }}>
        文档处理完成后将展示切分结果
      </div>
    );
  }

  const columns: TableProps<DocumentChunkRead>["columns"] = [
    { title: "序号", dataIndex: "chunk_index", width: 80 },
    {
      title: "内容预览",
      dataIndex: "content_excerpt",
      ellipsis: true,
    },
    { title: "字符数", dataIndex: "char_count", width: 100, render: formatSize },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => onPickChunk(record.id)}
        >
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <Table<DocumentChunkRead>
      rowKey="id"
      loading={chunksQuery.isLoading}
      columns={columns}
      dataSource={chunksQuery.data?.items ?? []}
      pagination={{
        current: page,
        pageSize: chunksQuery.data?.page_size ?? 20,
        total: chunksQuery.data?.total ?? 0,
        showSizeChanger: false,
        onChange: onPageChange,
      }}
      size="small"
    />
  );
}
