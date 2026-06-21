import { useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Alert, Spin, Typography } from "antd";
import { UserOutlined, RobotOutlined } from "@ant-design/icons";
import type { CitationRead } from "@/client";
import type { CitationListHandle } from "@/components/CitationList";
import { CitationList } from "@/components/CitationList";

const { Text } = Typography;

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: CitationRead[];
  status?: "streaming" | "done" | "error";
  error?: string | null;
}

interface MessageBubbleProps {
  message: UiMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const citationRef = useRef<CitationListHandle>(null);

  const handleCitationClick = useCallback(
    (n: number) => {
      citationRef.current?.expandAndScroll(n);
    },
    [],
  );

  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        marginBottom: 16,
        gap: 8,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: isUser ? "#1677ff" : "#52c41a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {isUser ? (
          <UserOutlined style={{ color: "#fff" }} />
        ) : (
          <RobotOutlined style={{ color: "#fff" }} />
        )}
      </div>
      <div
        style={{
          maxWidth: "75%",
          padding: "10px 16px",
          borderRadius: 12,
          background: isUser ? "#e6f4ff" : "#f6ffed",
          border: isUser ? "1px solid #91caff" : "1px solid #b7eb8f",
        }}
      >
        {message.status === "streaming" && !message.content ? (
          <Spin size="small" />
        ) : message.status === "error" ? (
          <Alert
            type="error"
            message="生成失败"
            description={message.error || "未知错误"}
            showIcon
          />
        ) : isUser ? (
          <Text>{message.content}</Text>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                // 匹配 [N] 格式的引用链接
                const match = href?.match(/^\[(\d+)\]$/);
                if (match) {
                  const n = parseInt(match[1], 10);
                  return (
                    <sup>
                      <a
                        onClick={(e) => {
                          e.preventDefault();
                          handleCitationClick(n);
                        }}
                        style={{ cursor: "pointer", color: "#1677ff" }}
                      >
                        [{n}]
                      </a>
                    </sup>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
        {message.citations.length > 0 && (
          <CitationList
            ref={citationRef}
            citations={message.citations}
            messageId={message.id}
          />
        )}
      </div>
    </div>
  );
}
