"""CATSHUB Harness v2.1 — registry плагинов (JS-only)."""

import hashlib
import re
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import (
    BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text,
    UniqueConstraint, func, select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# ═══════════════════════════════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════════════════════════════

class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    DATABASE_URL: str
    JWT_SECRET: str
    JWT_TTL: int = 60 * 60 * 24 * 7

    ADMIN_USERNAME: str
    ADMIN_PASSWORD: str

    CORS_ORIGINS: str = ""
    PORT: int = 8000


settings = Settings()


# ═══════════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════════

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
)
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(16), default="author", nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(512), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    website: Mapped[str | None] = mapped_column(String(256), nullable=True)
    location: Mapped[str | None] = mapped_column(String(64), nullable=True)
    github: Mapped[str | None] = mapped_column(String(64), nullable=True)
    twitter: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(),
    )


class Plugin(Base):
    __tablename__ = "plugins"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    description: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[str] = mapped_column(String(32), default="utils", nullable=False, index=True)
    icon: Mapped[str] = mapped_column(String(64), default="lucide:package", nullable=False)
    version: Mapped[str] = mapped_column(String(16), nullable=False)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)

    manifest: Mapped[dict] = mapped_column(JSONB, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    code_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    downloads: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    rating_sum: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(),
    )


class Portfolio(Base):
    __tablename__ = "portfolio"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    repo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(),
    )


class PluginInstall(Base):
    __tablename__ = "plugin_installs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    plugin_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("plugins.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    version: Mapped[str] = mapped_column(String(16), nullable=False)
    installed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "plugin_id", name="uq_plugin_install"),)


class PluginRating(Base):
    __tablename__ = "plugin_ratings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    plugin_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("plugins.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    review: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("plugin_id", "user_id", name="uq_plugin_rating"),)


# ═══════════════════════════════════════════════════════════════
# SECURITY
# ═══════════════════════════════════════════════════════════════

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_ALGO = "HS256"

USERNAME_RE = re.compile(r"^[a-z][a-z0-9_-]{2,31}$")
PLUGIN_NAME_RE = re.compile(r"^[a-z][a-z0-9-]{2,63}$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def hash_password(p: str) -> str:
    return pwd_ctx.hash(p[:72])


def verify_password(p: str, h: str) -> bool:
    try:
        return pwd_ctx.verify(p[:72], h)
    except Exception:
        return False


def create_token(user: User) -> str:
    return jwt.encode(
        {
            "sub": str(user.id),
            "username": user.username,
            "role": user.role,
            "exp": int(datetime.utcnow().timestamp()) + settings.JWT_TTL,
        },
        settings.JWT_SECRET,
        algorithm=JWT_ALGO,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(401, "Invalid token")


def calc_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


# ═══════════════════════════════════════════════════════════════
# DEPS
# ═══════════════════════════════════════════════════════════════

async def get_current_user(authorization: str = Header(...)) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid auth header")
    payload = decode_token(authorization[7:])
    user_id = int(payload["sub"])
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return user


async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    return user


# ═══════════════════════════════════════════════════════════════
# LIFESPAN
# ═══════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        admin = (await session.execute(
            select(User).where(User.username == settings.ADMIN_USERNAME)
        )).scalar_one_or_none()

        if admin is None:
            session.add(User(
                username=settings.ADMIN_USERNAME,
                password_hash=hash_password(settings.ADMIN_PASSWORD),
                role="admin",
                is_verified=True,
                display_name="Admin",
                bio="CATSHUB administrator",
            ))
            await session.commit()
            print(f"Admin created: {settings.ADMIN_USERNAME}")
        elif not verify_password(settings.ADMIN_PASSWORD, admin.password_hash):
            admin.password_hash = hash_password(settings.ADMIN_PASSWORD)
            await session.commit()
            print("Admin password updated")

    yield
    await engine.dispose()


# ═══════════════════════════════════════════════════════════════
# APP
# ═══════════════════════════════════════════════════════════════

app = FastAPI(title="CATSHUB Harness", version="2.1.0", lifespan=lifespan)

cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=72)


class LoginRequest(BaseModel):
    username: str
    password: str


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    website: str | None = None
    location: str | None = None
    github: str | None = None
    twitter: str | None = None


class PortfolioCreate(BaseModel):
    title: str = Field(min_length=2, max_length=128)
    description: str = Field(min_length=2, max_length=512)
    url: str | None = None
    repo_url: str | None = None
    image_url: str | None = None
    tags: list[str] = []
    is_featured: bool = False


class PublishRequest(BaseModel):
    name: str = Field(min_length=3, max_length=64)
    description: str = Field(min_length=5, max_length=256)
    version: str = Field(min_length=1, max_length=16)
    category: str = "utils"
    icon: str = "lucide:package"
    code_js: str = Field(min_length=10)
    manifest: dict


class VerifyRequest(BaseModel):
    verified: bool = True


class RoleRequest(BaseModel):
    role: str


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "is_verified": u.is_verified,
        "display_name": u.display_name,
        "bio": u.bio,
        "avatar_url": u.avatar_url,
        "website": u.website,
        "location": u.location,
        "github": u.github,
        "twitter": u.twitter,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def _plugin_brief(p: Plugin, author_username: str) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "category": p.category,
        "icon": p.icon,
        "version": p.version,
        "author": author_username,
        "downloads": p.downloads,
        "rating": round(p.rating_sum / p.rating_count, 2) if p.rating_count else 0.0,
        "rating_count": p.rating_count,
        "verified": p.is_verified,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _portfolio_dict(p: Portfolio) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "title": p.title,
        "description": p.description,
        "url": p.url,
        "repo_url": p.repo_url,
        "image_url": p.image_url,
        "tags": p.tags or [],
        "is_featured": p.is_featured,
        "sort_order": p.sort_order,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


# ═══════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════

@app.post("/api/auth/register")
async def register(payload: RegisterRequest):
    username = payload.username.lower().strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "Username: 3-32 chars, lowercase, digits, _, -")

    async with AsyncSessionLocal() as session:
        existing = (await session.execute(
            select(User).where(User.username == username)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(400, "Username already taken")

        user = User(
            username=username,
            password_hash=hash_password(payload.password),
            role="author",
            is_verified=False,
            display_name=username,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    return {
        "token": create_token(user),
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
    }


@app.post("/api/auth/login")
async def login(payload: LoginRequest):
    username = payload.username.lower().strip()
    async with AsyncSessionLocal() as session:
        user = (await session.execute(
            select(User).where(User.username == username)
        )).scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    return {
        "token": create_token(user),
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
    }


@app.get("/api/me")
async def me(user: User = Depends(get_current_user)):
    return _user_dict(user)


@app.put("/api/me")
async def update_me(payload: ProfileUpdate, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        db_user = await session.get(User, user.id)
        for field, value in payload.dict(exclude_unset=True).items():
            setattr(db_user, field, value)
        db_user.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(db_user)
    return _user_dict(db_user)


# ═══════════════════════════════════════════════════════════════
# USERS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/users/{username}")
async def get_user_profile(username: str):
    username = username.lower().strip()
    async with AsyncSessionLocal() as session:
        user = (await session.execute(
            select(User).where(User.username == username)
        )).scalar_one_or_none()
        if user is None:
            raise HTTPException(404, "User not found")

        plugins_count = (await session.execute(
            select(func.count(Plugin.id)).where(
                Plugin.author_id == user.id, Plugin.is_active == True,
            )
        )).scalar() or 0

        downloads = (await session.execute(
            select(func.sum(Plugin.downloads)).where(
                Plugin.author_id == user.id, Plugin.is_active == True,
            )
        )).scalar() or 0

        portfolio_count = (await session.execute(
            select(func.count(Portfolio.id)).where(Portfolio.user_id == user.id)
        )).scalar() or 0

    data = _user_dict(user)
    data.update({
        "plugins_count": plugins_count,
        "downloads": int(downloads),
        "portfolio_count": portfolio_count,
    })
    return data


@app.get("/api/users/{username}/plugins")
async def get_user_plugins(username: str):
    username = username.lower().strip()
    async with AsyncSessionLocal() as session:
        user = (await session.execute(
            select(User).where(User.username == username)
        )).scalar_one_or_none()
        if user is None:
            raise HTTPException(404, "User not found")

        rows = (await session.execute(
            select(Plugin).where(
                Plugin.author_id == user.id, Plugin.is_active == True,
            ).order_by(Plugin.created_at.desc())
        )).scalars().all()

    return [_plugin_brief(p, user.username) for p in rows]


@app.get("/api/users/{username}/portfolio")
async def get_user_portfolio(username: str):
    username = username.lower().strip()
    async with AsyncSessionLocal() as session:
        user = (await session.execute(
            select(User).where(User.username == username)
        )).scalar_one_or_none()
        if user is None:
            raise HTTPException(404, "User not found")

        items = (await session.execute(
            select(Portfolio).where(Portfolio.user_id == user.id)
            .order_by(Portfolio.is_featured.desc(), Portfolio.sort_order, Portfolio.created_at.desc())
        )).scalars().all()

    return [_portfolio_dict(x) for x in items]


# ═══════════════════════════════════════════════════════════════
# PORTFOLIO
# ═══════════════════════════════════════════════════════════════

@app.post("/api/portfolio")
async def create_portfolio(payload: PortfolioCreate, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        item = Portfolio(
            user_id=user.id,
            title=payload.title,
            description=payload.description,
            url=payload.url,
            repo_url=payload.repo_url,
            image_url=payload.image_url,
            tags=payload.tags,
            is_featured=payload.is_featured,
        )
        session.add(item)
        await session.commit()
        await session.refresh(item)
    return _portfolio_dict(item)


@app.put("/api/portfolio/{item_id}")
async def update_portfolio(item_id: int, payload: PortfolioCreate, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        item = await session.get(Portfolio, item_id)
        if item is None:
            raise HTTPException(404, "Not found")
        if item.user_id != user.id:
            raise HTTPException(403, "Not your portfolio item")

        for field, value in payload.dict(exclude_unset=True).items():
            setattr(item, field, value)
        item.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(item)
    return _portfolio_dict(item)


@app.delete("/api/portfolio/{item_id}")
async def delete_portfolio(item_id: int, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        item = await session.get(Portfolio, item_id)
        if item is None:
            raise HTTPException(404, "Not found")
        if item.user_id != user.id:
            raise HTTPException(403, "Not your portfolio item")
        await session.delete(item)
        await session.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# PLUGINS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/plugins")
async def list_plugins(
    category: str | None = None,
    query: str | None = None,
    verified_only: bool = False,
    author: str | None = None,
    sort: str = "downloads",
    limit: int = 100,
):
    async with AsyncSessionLocal() as session:
        stmt = (
            select(Plugin, User.username)
            .join(User, Plugin.author_id == User.id)
            .where(Plugin.is_active == True)
        )

        if category and category != "all":
            stmt = stmt.where(Plugin.category == category)
        if verified_only:
            stmt = stmt.where(Plugin.is_verified == True)
        if author:
            stmt = stmt.where(User.username == author.lower())
        if query:
            like = f"%{query.lower()}%"
            stmt = stmt.where(
                (Plugin.name.ilike(like)) | (Plugin.description.ilike(like))
            )

        if sort == "new":
            stmt = stmt.order_by(Plugin.created_at.desc())
        elif sort == "rating":
            stmt = stmt.order_by(Plugin.rating_sum.desc(), Plugin.rating_count.desc())
        elif sort == "name":
            stmt = stmt.order_by(Plugin.name.asc())
        else:
            stmt = stmt.order_by(Plugin.downloads.desc(), Plugin.created_at.desc())

        stmt = stmt.limit(min(limit, 200))
        rows = (await session.execute(stmt)).all()

    return [_plugin_brief(p, u) for p, u in rows]


@app.get("/api/plugins/{name}")
async def get_plugin(name: str):
    async with AsyncSessionLocal() as session:
        row = (await session.execute(
            select(Plugin, User)
            .join(User, Plugin.author_id == User.id)
            .where(Plugin.name == name, Plugin.is_active == True)
        )).first()
        if row is None:
            raise HTTPException(404, "Plugin not found")
        p, author = row

    data = _plugin_brief(p, author.username)
    data.update({
        "manifest": p.manifest,
        "code_hash": p.code_hash,
        "code_size": p.code_size,
        "code": p.code,
        "author_info": {
            "username": author.username,
            "display_name": author.display_name,
            "avatar_url": author.avatar_url,
            "is_verified": author.is_verified,
        },
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    })
    return data


@app.get("/api/plugins/{name}/code")
async def get_plugin_code(name: str):
    async with AsyncSessionLocal() as session:
        plugin = (await session.execute(
            select(Plugin).where(Plugin.name == name, Plugin.is_active == True)
        )).scalar_one_or_none()
        if plugin is None:
            raise HTTPException(404, "Plugin not found")
        plugin.downloads += 1
        await session.commit()
        code, code_hash = plugin.code, plugin.code_hash

    return PlainTextResponse(
        code,
        media_type="application/javascript",
        headers={
            "X-Code-Hash": code_hash,
            "Cache-Control": "public, max-age=3600",
            "ETag": code_hash,
        },
    )


@app.post("/api/plugins/publish")
async def publish_plugin(payload: PublishRequest, user: User = Depends(get_current_user)):
    name = payload.name.lower().strip()
    if not PLUGIN_NAME_RE.match(name):
        raise HTTPException(400, "Invalid plugin name")
    if not VERSION_RE.match(payload.version):
        raise HTTPException(400, "Version must be X.Y.Z")

    code_js = payload.code_js
    if len(code_js) > 200_000:
        raise HTTPException(400, "Code too large (max 200KB)")

    code_hash = calc_hash(code_js)
    code_size = len(code_js)

    async with AsyncSessionLocal() as session:
        existing = (await session.execute(
            select(Plugin).where(Plugin.name == name)
        )).scalar_one_or_none()

        if existing is None:
            plugin = Plugin(
                name=name,
                author_id=user.id,
                description=payload.description,
                category=payload.category,
                icon=payload.icon,
                version=payload.version,
                manifest=payload.manifest,
                code=code_js,
                code_size=code_size,
                code_hash=code_hash,
                is_verified=False,
                is_active=True,
            )
            session.add(plugin)
        else:
            if existing.author_id != user.id:
                raise HTTPException(403, "Not your plugin")
            existing.description = payload.description
            existing.category = payload.category
            existing.icon = payload.icon
            existing.version = payload.version
            existing.manifest = payload.manifest
            existing.code = code_js
            existing.code_size = code_size
            existing.code_hash = code_hash
            existing.is_verified = False
            existing.updated_at = datetime.utcnow()

        await session.commit()

    return {
        "ok": True,
        "name": name,
        "version": payload.version,
        "code_hash": code_hash,
        "size": code_size,
    }


@app.delete("/api/plugins/{name}")
async def delete_plugin(name: str, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        plugin = (await session.execute(
            select(Plugin).where(Plugin.name == name)
        )).scalar_one_or_none()
        if plugin is None:
            raise HTTPException(404, "Plugin not found")
        if plugin.author_id != user.id and user.role != "admin":
            raise HTTPException(403, "Not your plugin")
        await session.delete(plugin)
        await session.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# ADMIN
# ═══════════════════════════════════════════════════════════════

@app.post("/api/admin/plugins/{name}/verify")
async def verify_plugin(name: str, payload: VerifyRequest, admin: User = Depends(get_admin_user)):
    async with AsyncSessionLocal() as session:
        plugin = (await session.execute(
            select(Plugin).where(Plugin.name == name)
        )).scalar_one_or_none()
        if plugin is None:
            raise HTTPException(404, "Plugin not found")
        plugin.is_verified = payload.verified
        await session.commit()
    return {"ok": True, "name": name, "verified": payload.verified}


@app.get("/api/admin/users")
async def list_users(admin: User = Depends(get_admin_user), limit: int = 200):
    async with AsyncSessionLocal() as session:
        users = (await session.execute(
            select(User).order_by(User.created_at.desc()).limit(limit)
        )).scalars().all()
    return [_user_dict(u) for u in users]


@app.post("/api/admin/users/{user_id}/role")
async def set_role(user_id: int, payload: RoleRequest, admin: User = Depends(get_admin_user)):
    if payload.role not in ("author", "admin"):
        raise HTTPException(400, "Invalid role")
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
        if user is None:
            raise HTTPException(404, "User not found")
        user.role = payload.role
        await session.commit()
    return {"ok": True, "user_id": user_id, "role": payload.role}


@app.delete("/api/admin/users/{user_id}")
async def delete_user(user_id: int, admin: User = Depends(get_admin_user)):
    if user_id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")
    async with AsyncSessionLocal() as session:
        user = await session.get(User, user_id)
        if user is None:
            raise HTTPException(404, "User not found")
        await session.delete(user)
        await session.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# STATS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/stats")
async def stats():
    async with AsyncSessionLocal() as session:
        plugins_count = (await session.execute(
            select(func.count(Plugin.id)).where(Plugin.is_active == True)
        )).scalar() or 0

        users_count = (await session.execute(
            select(func.count(User.id))
        )).scalar() or 0

        downloads = (await session.execute(
            select(func.sum(Plugin.downloads)).where(Plugin.is_active == True)
        )).scalar() or 0

        avg_rating = (await session.execute(
            select(func.avg(PluginRating.rating))
        )).scalar()

        portfolio_count = (await session.execute(
            select(func.count(Portfolio.id))
        )).scalar() or 0

    return {
        "plugins": plugins_count,
        "users": users_count,
        "downloads": int(downloads),
        "avg_rating": round(float(avg_rating), 2) if avg_rating else 0.0,
        "portfolio": portfolio_count,
    }


# ═══════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "catshub-harness",
        "version": "2.1.0",
    }


# ═══════════════════════════════════════════════════════════════
# FRONTEND
# ═══════════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).parent


@app.get("/")
async def serve_index():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/style.css")
async def serve_css():
    return FileResponse(BASE_DIR / "style.css", media_type="text/css")


@app.get("/script.js")
async def serve_js():
    return FileResponse(BASE_DIR / "script.js", media_type="application/javascript")


@app.get("/{path:path}")
async def spa_fallback(path: str):
    if path.startswith(("api/", "health", "docs", "openapi")):
        raise HTTPException(404)
    return FileResponse(BASE_DIR / "index.html")


# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
