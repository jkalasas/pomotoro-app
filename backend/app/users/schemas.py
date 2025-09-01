from typing import Optional

from pydantic import field_validator
from sqlmodel import SQLModel

from ..auth.utils import get_password_hash


class UserBase(SQLModel):
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    email: str


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    def hash_password(cls, value: str) -> str:
        return get_password_hash(value)


class UserUpdate(SQLModel):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None

    @field_validator("password")
    def hash_password(cls, value: str) -> str:
        if value:
            return get_password_hash(value)
        return value


class UserPublic(UserBase):
    id: int
