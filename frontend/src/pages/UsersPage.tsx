import { App, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import { useAuthStore } from '@/stores/authStore'

const { Title } = Typography

interface UserRow {
  id: string
  username: string
  display_name: string
  status: string
  is_admin: boolean
  role_names: string[]
  created_at: string
}

interface UserFormValues {
  username?: string
  display_name: string
  password?: string | null
  status: string
  role_ids: string[]
}

export function UsersPage() {
  const { message } = App.useApp()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // TODO: 替换为实际 API 调用
      return { items: [] as UserRow[], total: 0 }
    },
  })

  const columns: ColumnsType<UserRow> = [
    { title: '用户名', dataIndex: 'username' },
    { title: '显示名', dataIndex: 'display_name' },
    {
      title: '状态', dataIndex: 'status',
      render: (s: string) => <Tag color={s === 'active' ? 'green' : 'red'}>{s}</Tag>,
    },
    {
      title: '角色', dataIndex: 'role_names',
      render: (roles: string[]) => roles?.map((r) => <Tag key={r}>{r}</Tag>),
    },
    { title: '创建时间', dataIndex: 'created_at' },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />}>编辑</Button>
          <Popconfirm
            title="删除该用户？"
            okType="danger"
            disabled={record.id === currentUserId}
            onConfirm={() => message.info('TODO: delete user')}
          >
            <Button size="small" danger icon={<DeleteOutlined />} disabled={record.id === currentUserId}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>用户管理</Title>
        <Button type="primary" icon={<PlusOutlined />}>新建用户</Button>
      </div>
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
      />
    </div>
  )
}
