from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.deps import get_current_user
from app.db.session import get_db
from app.db.models.user import User
from app.db.models.chat import Chat
from app.db.models.message import Message
from app.schemas.chat import (
    ChatOut, ChatWithMessages, CreateChatRequest, PostMessageRequest, MessageOut,
)

router = APIRouter(prefix="/chats", tags=["chats"])


def _owned(chat_id: str, user: User, db: Session) -> Chat:
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(404, "Chat not found")
    return chat


@router.get("", response_model=list[ChatOut])
def list_chats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Chat).filter(Chat.user_id == user.id).order_by(Chat.updated_at.desc()).all()


@router.post("", response_model=ChatOut, status_code=201)
def create_chat(payload: CreateChatRequest, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    chat = Chat(user_id=user.id, title=payload.title, context=payload.context)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.get("/{chat_id}", response_model=ChatWithMessages)
def get_chat(chat_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _owned(chat_id, user, db)


@router.post("/{chat_id}/messages", response_model=MessageOut, status_code=201)
def post_message(chat_id: str, payload: PostMessageRequest,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = _owned(chat_id, user, db)
    msg = Message(chat_id=chat.id, role=payload.role, text=payload.text)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.delete("/{chat_id}", status_code=204)
def delete_chat(chat_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = _owned(chat_id, user, db)
    db.delete(chat)
    db.commit()