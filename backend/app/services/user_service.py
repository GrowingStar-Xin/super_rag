from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditAction
from app.db.repositories.audit_repo import AuditLogRepository

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.security import hash_password
from app.db.models import User, UserStatus
from app.db.repositories.role_repo import RoleRepository
from app.db.repositories.user_repo import UserRepository


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.role_repo = RoleRepository(session)

    async def list_users(self, page: int, page_size: int) -> tuple[list[User], int]:
        return await self.user_repo.list_paginated(page, page_size)

    async def get_user(self, user_id: UUID) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if user is None:
            raise NotFoundError("用户不存在")
        return user

    async def create_user(
        self, *, username: str, password: str, display_name: str,
        role_ids: Sequence[UUID] | None = None,
    ) -> User:
        username = username.strip()
        display_name = display_name.strip() or username
        if not username:
            raise ValidationError("用户名不能为空")
        if not password or len(password) < 4:
            raise ValidationError("密码长度至少 4 位")
        existing = await self.user_repo.get_by_username(username)
        if existing is not None:
            raise ConflictError(f"用户名 {username} 已存在")

        user = User(
            username=username,
            password_hash=hash_password(password),
            display_name=display_name,
            status=UserStatus.ACTIVE,
        )
        if role_ids:
            roles = await self.role_repo.get_many(list(role_ids))
            user.roles = roles
        await self.user_repo.add(user)
        await self.session.commit()
        await self.session.refresh(user, attribute_names=["roles"])
        return user

    async def update_user(
        self, user_id: UUID, *,
        display_name: str | None = None,
        status: UserStatus | None = None,
        password: str | None = None,
    ) -> User:
        user = await self.get_user(user_id)
        if display_name is not None:
            display_name = display_name.strip()
            if not display_name:
                raise ValidationError("昵称不能为空")
            user.display_name = display_name
        if status is not None:
            user.status = status
        if password is not None:
            if len(password) < 4:
                raise ValidationError("密码长度至少 4 位")
            user.password_hash = hash_password(password)
        await self.session.commit()
        await self.session.refresh(user, attribute_names=["roles"])
        return user

    async def set_roles(
        self, user_id: UUID, role_ids: Sequence[UUID], *, actor_id: UUID | None = None,
    ) -> User:
        user = await self.get_user(user_id)
        old_role_ids = [str(r.id) for r in user.roles]
        roles = await self.role_repo.get_many(list(role_ids))
        await self.user_repo.set_roles(user, roles)
        audit_repo = AuditLogRepository(self.session)
        await audit_repo.log(
            actor_id=actor_id,
            action=AuditAction.USER_ROLE_CHANGE,
            resource_type="user",
            resource_id=str(user_id),
            old_values={"role_ids": old_role_ids},
            new_values={"role_ids": [str(r.id) for r in roles]},
        )
        await self.session.commit()
        await self.session.refresh(user, attribute_names=["roles"])
        return user

    async def delete_user(
        self, user_id: UUID, *, actor_id: UUID | None = None,
    ) -> None:
        user = await self.get_user(user_id)
        audit_repo = AuditLogRepository(self.session)
        await audit_repo.log(
            actor_id=actor_id,
            action=AuditAction.USER_DELETE,
            resource_type="user",
            resource_id=str(user_id),
            old_values={"username": user.username, "display_name": user.display_name},
        )
        await self.user_repo.delete(user)
        await self.session.commit()