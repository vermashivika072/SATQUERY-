import uuid


def new_uuid() -> str:
    return str(uuid.uuid4())


def short_id(length: int = 8) -> str:
    return uuid.uuid4().hex[:length]