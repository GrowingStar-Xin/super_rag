import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Avatar, Button, Empty, Input, Space, Spin, Typography } from 'antd'
import { PlusOutlined, RobotOutlined, SendOutlined, UserOutlined } from '@ant-design/icons'
import { createConversation, getConversation } from '@/client'
import { streamChat } from '@/api/chatStream'
import type { ChatStreamEvent } from '@/api/chatStream'
import { QueryRoutePanel } from '@/components/QueryRoutePanel'
import { AgentStepsPanel } from '@/components/AgentStepsPanel'
import { TraceIdPanel } from '@/components/TraceIdPanel'
import { formatApiError } from '@/utils/errors'
import { CitationList } from '@/components/CitationList'
import type { CitationListHandle } from '@/components/CitationList'
import { gfmComponents } from '@/components/markdownComponents'
import { conversationsQueryKey } from '@/api/queryKeys'
import { ConversationSidebar } from '@/components/ConversationSidebar'
import { useAuthStore } from '@/stores/authStore'

import type { 
  AgentStep, 
  CitationRead, 
  MessageRead, 
  QueryRouteRead, 
  VerifyResultRead
 } from '@/client/types.gen'

import {Layout, Tag} from 'antd'
const {Sider, Content} = Layout
const REFUSAL_ANSWER = '抱歉，知识库中没有找到与该问题相关的可靠依据。'


const { Title, Text } = Typography
const { TextArea } = Input

const STORAGE_KEY_PREFIX = 'rag.chat.conversation_id'

type AssistantStatus = 'streaming' | 'done' | 'error'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: CitationRead[]
  queryRoute?: QueryRouteRead | null
  agentSteps?: AgentStep[] | null
  verifyResult?: VerifyResultRead | null
  traceId?: string | null
  traceUrl?: string | null
  refused?: boolean
  cacheHit?: boolean
  status?: AssistantStatus
  error?: string | null
}

function fromServerMessage(m: MessageRead): UiMessage {
  return {
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
    citations: m.citations ?? [],
    queryRoute: m.query_route ?? null,
    agentSteps: m.agent_steps ?? null,
    verifyResult: m.verify_result ?? null,
    traceId: m.trace_id ?? null,
    traceUrl: m.trace_url ?? null,
    cacheHit: m.cache_hit ?? false,
    // 历史消息：直接按"内容是否等于固定拒答文案"判定，与后端 metadata.refused 等价
    refused: m.role === 'assistant' && m.content === REFUSAL_ANSWER,
    status: 'done',
  }
}

export function ChatPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  const storageKey = `${STORAGE_KEY_PREFIX}.${userId}`
  const [conversationId, setConversationId] = useState<string | null>(
    () => localStorage.getItem(storageKey),
  )
  const [draft, setDraft] = useState('')
  // 流式过程中的临时消息（只放在前端 state，结束后由历史接口回填正式 id）
  const [pendingMessages, setPendingMessages] = useState<UiMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 创建会话：第一次进入页面 / 点"新建对话"时调用
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await createConversation({ body: { title: '新对话' } })
      return res.data!
    },
    onSuccess: (conversation) => {
      localStorage.setItem(storageKey, conversation.id)
      setConversationId(conversation.id)
      setPendingMessages([])
      queryClient.removeQueries({ queryKey: ['conversation'] })
    },
  })

  // 没有 conversation_id 时自动创建一个
  useEffect(() => {
    if (!conversationId && !createMutation.isPending) {
      createMutation.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // 拉取历史消息
  const historyQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const res = await getConversation({ path: { conversation_id: conversationId! } })
      return res.data!
    },
    enabled: Boolean(conversationId),
  })

  // 历史消息变化 / 新对话切换 → 清空 pending（已并入历史）
  useEffect(() => {
    if (historyQuery.data) {
      queueMicrotask(() => setPendingMessages([]))
    }
  }, [historyQuery.data])

  const allMessages = useMemo<UiMessage[]>(() => {
    const history = (historyQuery.data?.messages ?? []).map(fromServerMessage)
    return [...history, ...pendingMessages]
  }, [historyQuery.data, pendingMessages])

  // 自动滚到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [allMessages])

  // 组件卸载或新建对话时取消进行中的请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handleNewConversation = () => {
    abortRef.current?.abort()
    createMutation.mutate()
  }

  const handleSelectConversation = (id: string) => {
    if (id === conversationId) return
    abortRef.current?.abort()
    setPendingMessages([])
    setIsStreaming(false)
    localStorage.setItem(storageKey, id)
    setConversationId(id)
  }

  const handleConversationDeleted = (deletedId: string) => {
    if (deletedId !== conversationId) return
    abortRef.current?.abort()
    setPendingMessages([])
    setIsStreaming(false)
    localStorage.removeItem(storageKey)
    setConversationId(null)
    queryClient.removeQueries({ queryKey: ['conversation', deletedId] })
  }

  const updateAssistant = (updater: (prev: UiMessage) => UiMessage) => {
    setPendingMessages((prev) => {
      if (prev.length === 0) return prev
      const lastIdx = prev.length - 1
      const last = prev[lastIdx]
      if (!last) return prev
      const next = prev.slice()
      next[lastIdx] = updater(last)
      return next
    })
  }

  const handleSend = async () => {
    const question = draft.trim()
    if (!question || !conversationId || isStreaming) return

    setDraft('')
    const userMsg: UiMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: question,
      citations: [],
      status: 'done',
    }
    const assistantMsg: UiMessage = {
      id: `local-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      citations: [],
      status: 'streaming',
    }
    setPendingMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      await streamChat({
        conversationId,
        question,
        signal: ctrl.signal,
        onEvent: (event: ChatStreamEvent) => {
          switch (event.type) {
            case 'start':
              updateAssistant((prev) => ({
                ...prev,
                traceId: event.traceId,
                traceUrl: event.traceUrl,
                cacheHit: event.cacheHit,
              }))
              break
            case 'query_route':
              updateAssistant((prev) => ({ ...prev, queryRoute: event.queryRoute }))
              break
            case 'agent_steps':
              updateAssistant((prev) => ({ ...prev, agentSteps: event.steps }))
              break
            case 'citations':
              updateAssistant((prev) => ({ ...prev, citations: event.citations }))
              break
            case 'token':
              updateAssistant((prev) => ({ ...prev, content: prev.content + event.delta }))
              break
            case 'verify_result':
              updateAssistant((prev) => {
                const verifyResult: VerifyResultRead = {
                  verified: event.verified,
                  reason: event.reason,
                }
                if (!event.verified && event.replacementAnswer) {
                  // 严格按 PRD：verify 失败时整段替换 + 清空引用 + 标 refused
                  return {
                    ...prev,
                    content: event.replacementAnswer,
                    citations: [],
                    refused: true,
                    verifyResult,
                  }
                }
                return { ...prev, verifyResult }
              })
              break
            case 'end':
              updateAssistant((prev) => ({
                ...prev,
                status: 'done',
                refused: prev.refused || event.refused,
              }))
              break
            case 'error':
              updateAssistant((prev) => ({ ...prev, status: 'error', error: event.message }))
              break
          }
        },
      })
      // 流正常结束 → 用后端历史替换前端 pending
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] }),
        queryClient.invalidateQueries({ queryKey: conversationsQueryKey }),
      ])
    } catch (err) {
      const fallback = err instanceof Response ? await formatApiError(err) : (err as Error).message
      updateAssistant((prev) => ({
        ...prev,
        status: 'error',
        error: fallback || '请求失败',
      }))
      message.error(fallback || '问答请求失败')
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter 换行；Enter 发送
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }
  return (
    <Layout
      style={{
        height: 'calc(100vh - 112px)',
        background: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #f0f0f0',
      }}
    >
      <Sider
        width={260}
        theme="light"
        style={{ borderRight: '1px solid #f0f0f0', background: '#fafafa' }}
      >
        <ConversationSidebar
          currentId={conversationId}
          onSelect={handleSelectConversation}
          onDeleted={handleConversationDeleted}
          onCreateNew={handleNewConversation}
          isCreating={createMutation.isPending}
        />
      </Sider>
      <Content style={{ display: 'flex', flexDirection: 'column' }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {historyQuery.isLoading ? (
            <Spin />
          ) : allMessages.length === 0 ? (
            <Empty description="还没有问题，在下方输入开始提问" />
          ) : (
            allMessages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
        </div>
        <div
          style={{
            padding: 12,
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            gap: 8,
            background: '#fafafa',
          }}
        >
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，按 Enter 发送，Shift+Enter 换行"
            autoSize={{ minRows: 2, maxRows: 6 }}
            disabled={!conversationId || isStreaming}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={isStreaming}
            disabled={!conversationId || !draft.trim()}
          >
            发送
          </Button>
        </div>
      </Content>
    </Layout>
  )
}
const CITATION_HASH_PREFIX = '#cite-'

/** 把答案里的引用编号 `[N]` 改写成 markdown hash 链接，交给下方 CitationList 处理点击。
 *
 * 严格只匹配纯 `[N]`（不含反引号、不含尖括号），格式由后端 prompt 强约束。
 * 链接文本用 `[[N]](url)` 这种"成对方括号嵌套"形式 CommonMark 解析最稳定。
 */
function linkifyCitations(content: string, maxIndex: number, messageId: string): string {
  if (maxIndex <= 0) return content
  return content.replace(/\[(\d+)\]/g, (raw, num: string) => {
    const n = Number(num)
    if (n < 1 || n > maxIndex) return raw
    return `[[${n}]](${CITATION_HASH_PREFIX}${messageId}-${n})`
  })
}

interface MessageBubbleProps {
  message: UiMessage
}

/** assistant 气泡顶部状态条：拒答提示 + 校验结果 Tag/Alert。
 *
 * 优先级：拒答提示在最上（用户最关心"答案是否可信"），校验结果其次。
 * 拒答场景下不再单独展示 verify Alert，避免重复警告。
 */
function AssistantHeader({ message }: { message: UiMessage }) {
  if (message.refused) {
    return (
      <Alert
        type="warning"
        showIcon
        title="未在知识库中找到可靠依据"
        description={
          message.verifyResult && message.verifyResult.verified === false
            ? `答案校验未通过：${message.verifyResult.reason ?? '缺乏引用支撑'}，已替换为拒答提示`
            : undefined
        }
        style={{ marginBottom: 8 }}
      />
    )
  }
  // 缓存命中与已校验是并列的状态指示，不互斥
  const tags: React.ReactNode[] = []
  if (message.cacheHit) {
    tags.push(<Tag key="cache" color="cyan">缓存命中</Tag>)
  }
  if (message.verifyResult?.verified === true) {
    tags.push(<Tag key="verified" color="green">已校验</Tag>)
  }
  if (tags.length === 0) return null
  return <div style={{ marginBottom: 8 }}>{tags}</div>
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const citationRef = useRef<CitationListHandle>(null)

  const handleCitationClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault()
    const n = Number(href.split('-').pop())
    if (Number.isFinite(n)) {
      citationRef.current?.expandAndScroll(n)
    }
  }

  const components = useMemo(() => ({
    a: ({ href, children, ...props }: React.ComponentProps<'a'>) => {
      const link = href ?? ''
      if (link.startsWith(CITATION_HASH_PREFIX)) {
        return (
          <a {...props} href={link} onClick={(e) => handleCitationClick(e, link)}>
            {children}
          </a>
        )
      }
      return <a {...props} href={link} target="_blank" rel="noreferrer">{children}</a>
    },
    ...gfmComponents,
  }), [])
  const renderedContent = useMemo(
    () => linkifyCitations(message.content, message.citations.length, message.id),
    [message.content, message.citations.length, message.id],
  )
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        marginBottom: 24,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <Avatar
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
        style={{ background: isUser ? '#1677ff' : '#52c41a', flexShrink: 0 }}
      />
      <div
        style={{
          maxWidth: '78%',
          background: isUser ? '#e6f4ff' : '#f6f6f6',
          padding: '12px 16px',
          borderRadius: 8,
        }}
      >
        {message.error ? (
          <Alert type="error" title={message.error} style={{ marginBottom: 8 }} />
        ) : null}
        {!isUser ? <AssistantHeader message={message} /> : null}
        {message.content ? (
          isUser ? (
            <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {renderedContent}
            </ReactMarkdown>
          )
        ) : message.status === 'streaming' ? (
          <Text type="secondary">
            <Spin size="small" /> 正在思考...
          </Text>
        ) : null}
        {!isUser && message.traceId ? (
          <TraceIdPanel traceId={message.traceId} traceUrl={message.traceUrl} />
        ) : null}
        {!isUser && message.queryRoute ? (
          <QueryRoutePanel queryRoute={message.queryRoute} />
        ) : null}
        {!isUser && message.agentSteps && message.agentSteps.length > 0 ? (
          <AgentStepsPanel steps={message.agentSteps} />
        ) : null}
        {!isUser && message.citations.length > 0 ? (
          <CitationList ref={citationRef} citations={message.citations} messageId={message.id} />
        ) : null}
      </div>
    </div>
  )
}