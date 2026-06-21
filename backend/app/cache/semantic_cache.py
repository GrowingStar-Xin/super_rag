"""语义缓存：用 question embedding 做近似命中。

- 缓存 key：问题向量 L2 归一化后的 pgvector 表示
- 命中判定：cosine_similarity(当前问题向量, 缓存 key) >= min_similarity
- 缓存值：JSON 序列化的 {question, answer, citations}
"""

import json
import time
from dataclasses import dataclass

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import AsyncSessionLocal
from app.ingestion.embedder import get_embeddings

logger = get_logger(__name__)

_CACHE_TABLE_NAME = "semantic_cache"


def _ensure_table_sql() -> str:
    """返回建表 DDL（幂等）；首次调用时 lazy 创建。"""
    dim = settings.embedding_dim
    return f"""
    CREATE TABLE IF NOT EXISTS {_CACHE_TABLE_NAME} (
        id              SERIAL PRIMARY KEY,
        embedding       vector({dim}) NOT NULL,
        question        text NOT NULL,
        answer          text NOT NULL,
        citations       jsonb NOT NULL DEFAULT '[]'::jsonb,
        query_route     jsonb,
        created_at      timestamptz NOT NULL DEFAULT now()
    );
    """


@dataclass(frozen=True)
class CacheHit:
    question: str
    answer: str
    citations: list[dict]
    query_route: dict | None


async def _ensure_table() -> None:
    async with AsyncSessionLocal() as session:
        await session.execute(_ensure_table_sql())
        await session.commit()


async def lookup(question: str) -> CacheHit | None:
    """查询语义缓存。返回 None 表示未命中。"""
    if not settings.semantic_cache_enabled:
        return None
    try:
        await _ensure_table()
        embedding = await get_embeddings().aembed_query(question)
        async with AsyncSessionLocal() as session:
            stmt = f"""
            SELECT question, answer, citations, query_route,
                   1 - (embedding <=> :vec) AS similarity
            FROM {_CACHE_TABLE_NAME}
            WHERE 1 - (embedding <=> :vec) >= :min_sim
            ORDER BY similarity DESC
            LIMIT 1
            """
            row = (
                await session.execute(
                    stmt,
                    {"vec": embedding, "min_sim": settings.semantic_cache_min_similarity},
                )
            ).first()
            if row is None:
                return None
            citations = row.citations if isinstance(row.citations, list) else json.loads(row.citations or "[]")
            query_route = row.query_route
            logger.info(
                "semantic cache hit: similarity=%.4f question=%r",
                row.similarity,
                question[:60],
            )
            return CacheHit(
                question=row.question,
                answer=row.answer,
                citations=citations,
                query_route=query_route,
            )
    except Exception:
        logger.warning("semantic cache lookup 异常，降级为未命中", exc_info=True)
        return None


async def store(
    question: str,
    answer: str,
    citations: list[dict],
    query_route: dict | None = None,
) -> None:
    """写入语义缓存。"""
    if not settings.semantic_cache_enabled:
        return
    try:
        await _ensure_table()
        embedding = await get_embeddings().aembed_query(question)
        async with AsyncSessionLocal() as session:
            # TTL 清理：删除超过 TTL 的条目
            if settings.semantic_cache_ttl_seconds > 0:
                await session.execute(
                    f"DELETE FROM {_CACHE_TABLE_NAME} WHERE now() - created_at > make_interval(secs => :ttl)",
                    {"ttl": settings.semantic_cache_ttl_seconds},
                )
            # pgvector 的 embedding <=> 算子支持 operator class，这里用原生 INSERT 保持兼容
            stmt = f"""
            INSERT INTO {_CACHE_TABLE_NAME} (embedding, question, answer, citations, query_route)
            VALUES (:vec, :q, :a, :cits, :qr)
            """
            await session.execute(
                stmt,
                {
                    "vec": embedding,
                    "q": question,
                    "a": answer,
                    "cits": json.dumps(citations, ensure_ascii=False),
                    "qr": json.dumps(query_route, ensure_ascii=False) if query_route else None,
                },
            )
            await session.commit()
            logger.info("semantic cache stored: question=%r", question[:60])
    except Exception:
        logger.warning("semantic cache store 异常，降级跳过", exc_info=True)
