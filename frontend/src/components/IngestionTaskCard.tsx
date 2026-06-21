import { Alert, Progress, Space, Tag, Typography } from 'antd'
import type { IngestionTaskRead } from '@/client/types.gen'

const { Text } = Typography

const TASK_TYPE_LABEL: Record<IngestionTaskRead['task_type'], string> = {
  ingest: '首次入库',
  reindex: '增量重建',
}

const TASK_STATUS_COLOR: Record<IngestionTaskRead['status'], string> = {
  pending: 'default',
  running: 'processing',
  success: 'success',
  failed: 'error',
}

const TASK_STATUS_LABEL: Record<IngestionTaskRead['status'], string> = {
  pending: '排队中',
  running: '执行中',
  success: '已完成',
  failed: '失败',
}

export function IngestionTaskCard({ task }: { task: IngestionTaskRead }) {
  const percent =
    task.progress_total > 0
      ? Math.min(100, Math.round((task.progress_done / task.progress_total) * 100))
      : 0
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Tag>{TASK_TYPE_LABEL[task.task_type]}</Tag>
        <Tag color={TASK_STATUS_COLOR[task.status]}>
          {TASK_STATUS_LABEL[task.status]}
        </Tag>
        <Text type="secondary">
          创建于 {new Date(task.created_at).toLocaleString('zh-CN')}
        </Text>
      </Space>
      <Progress
        percent={percent}
        status={
          task.status === 'failed'
            ? 'exception'
            : task.status === 'success'
              ? 'success'
              : 'active'
        }
        format={() =>
          task.progress_total > 0
            ? `${task.progress_done} / ${task.progress_total}`
            : task.status === 'success'
              ? '完成'
              : '等待中'
        }
      />
      {task.error_message ? (
        <Alert type="error" showIcon message="任务失败" description={task.error_message} />
      ) : null}
    </Space>
  )
}
