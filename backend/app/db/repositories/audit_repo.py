from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditAction, AuditLog


class AuditLogRepository:
    """审计日志仓储。只写不删，异步写入以不拖慢主流程。"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def log(
        self,
        *,
        actor_id: UUID | None,
        action: AuditAction,
        resource_type: str,
        resource_id: str,
        old_values: dict | None = None,
        new_values: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_values=old_values,
            new_values=new_values,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry
