"""基于 Redis 的滑动窗口限流器。

算法：用 sorted set 记录每个 user 最近 N 次请求的时间戳
- key: `rate_limit:user:{user_id}`
- score: 请求时间戳（秒）
- member: 时间戳 + 随机后缀（防并发重复）

每次请求：
1. 移除窗口外的旧记录（ZREMRANGEBYSCORE）
2. 统计窗口内次数（ZCARD）
3. 超过限制 → 429
4. 未超过 → ZADD 当前时间戳
"""

import time
import uuid
from dataclasses import dataclass

import redis

from app.core.config import settings
from app.core.exceptions import RateLimitedError
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class RateLimitConfig:
    window_seconds: int
    max_requests: int


class RateLimiter:
    def __init__(self) -> None:
        self._redis: redis.Redis | None = None

    def _connect(self) -> redis.Redis:
        if self._redis is None:
            self._redis = redis.Redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        return self._redis

    async def check(self, key: str) -> None:
        """滑动窗口限流检查。超限抛 RateLimitedError，否则放行。"""
        if not settings.rate_limit_enabled:
            return

        now = time.time()
        window_start = now - 60  # 固定 1 分钟窗口
        redis_key = f"rate_limit:{key}"

        try:
            r = self._connect()
            pipe = r.pipeline()
            # 移除 1 分钟前的记录
            pipe.zremrangebyscore(redis_key, 0, window_start)
            # 统计当前窗口内的请求数
            pipe.zcard(redis_key)
            _, count = pipe.execute()

            if isinstance(count, int) and count >= settings.rate_limit_per_minute:
                raise RateLimitedError("请求过于频繁，请稍后再试")

            # 记录本次请求
            member = f"{now}:{uuid.uuid4().hex[:8]}"
            r.zadd(redis_key, {member: now})
            r.expire(redis_key, 120)  # key 过期 2 分钟
        except RateLimitedError:
            raise
        except Exception:
            # Redis 不可用时降级放行
            logger.warning("rate limiter Redis 异常，降级放行：key=%s", key, exc_info=True)


_rate_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter
