from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class MessageOut(BaseModel):
    id: UUID
    role: str
    text: str
    turn_id: str | None = None
    rag_sources: list | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatOut(BaseModel):
    id: UUID
    title: str
    context: str
    aoi: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatWithMessages(ChatOut):
    messages: list[MessageOut] = []


class CreateChatRequest(BaseModel):
    title: str = "New Session"
    context: str = "Satellite / AI"


class PostMessageRequest(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str