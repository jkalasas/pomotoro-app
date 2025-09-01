from uuid import UUID

from sqlmodel import SQLModel

from ..users.schemas import UserCreate


class UserRegister(UserCreate): ...


class Token(SQLModel):
    access_token: str
    refresh_token: str
    token_type: str


class TokenData(SQLModel):
    user_id: int | None = None
