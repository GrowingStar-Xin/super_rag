import { App, Button, Popconfirm, Spin, Tooltip, Typography } from 'antd'
import { DeleteOutlined, MessageOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { conversationsQueryKey } from '@/api/queryKeys'
import { deleteConversation, listConversations } from '@/client/sdk.gen'
import type { ConversationListItem } from '@/client/types.gen'

const { Text } = Typography

interface ConversationSidebarProps {
  currentId: string | null
  onSelect: (id: string) => void
  /** 当前会话被删时回调，让 ChatPage 重置当前 id 并清空 pending */
  onDeleted: (deletedId: string) => void
  /** 新建对话；ChatPage 内部已有 createMutation，这里只触发，避免双重 mutation */
  onCreateNew: () => void
  /** 新建按钮 loading；与 ChatPage 的 createMutation.isPending 联动 */
  isCreating?: boolean
}

export function ConversationSidebar({
  currentId,
  onSelect,
  onDeleted,
  onCreateNew,
  isCreating,
}: ConversationSidebarProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const conversationsQuery = useQuery({
    queryKey: conversationsQueryKey,
    queryFn: async () => {
      // 拉一页足够；侧栏不做无限滚动，超过 100 条的场景留到后续章节
      const res = await listConversations({ query: { page: 1, page_size: 100 } })
      return res.data!
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteConversation({ path: { conversation_id: id } })
      return id
    },
    onSuccess: async (id) => {
      message.success('已删除会话')
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
      if (id === currentId) onDeleted(id)
    },
  })

  const items = conversationsQuery.data?.items ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: '1px solid #f0f0f0' }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          block
          onClick={onCreateNew}
          loading={isCreating}
        >
          新建对话
        </Button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {conversationsQuery.isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 24 }}>
            暂无会话，点上方"新建对话"开始
          </Text>
        ) : (
          <div>
            {items.map((item) => (
              <ConversationItem
                key={item.id}
                item={item}
                isActive={item.id === currentId}
                isDeleting={
                  deleteMutation.isPending && deleteMutation.variables === item.id
                }
                onSelect={() => onSelect(item.id)}
                onDelete={() => deleteMutation.mutate(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ConversationItemProps {
  item: ConversationListItem
  isActive: boolean
  isDeleting: boolean
  onSelect: () => void
  onDelete: () => void
}

function ConversationItem({
  item,
  isActive,
  isDeleting,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      style={{
        cursor: 'pointer',
        background: isActive ? '#e6f4ff' : 'transparent',
        padding: '8px 12px',
        borderRadius: 4,
        margin: '2px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <MessageOutlined style={{ color: isActive ? '#1677ff' : '#999', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text
            ellipsis={{ tooltip: item.title }}
            style={{
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#1677ff' : undefined,
              display: 'block',
            }}
          >
            {item.title}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {item.message_count} 条 · {formatRelativeTime(item.updated_at)}
          </Text>
        </div>
      </div>
      <Popconfirm
        title="删除该会话？"
        description="将一并删除会话内的所有消息和引用，无法恢复。"
        okText="删除"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onConfirm={(e) => {
          e?.stopPropagation()
          onDelete()
        }}
        onCancel={(e) => e?.stopPropagation()}
      >
        <Tooltip title="删除会话">
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={isDeleting}
            onClick={(e) => e.stopPropagation()}
          />
        </Tooltip>
      </Popconfirm>
    </div>
  )
}

/** 把 ISO 时间格式化成"X 分钟前 / X 小时前 / YYYY-MM-DD"。
 * 侧栏空间紧凑，不展示完整 datetime；超过 7 天降级到日期。
 */
function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return '刚刚'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} 分钟前`
  if (diffMs < day) return `${Math.floor(diffMs / hour)} 小时前`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} 天前`
  return date.toISOString().slice(0, 10)
}

