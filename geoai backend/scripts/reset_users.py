"""
Inspect and reset users in the geoai database.
Usage:
    python scripts/reset_users.py list
    python scripts/reset_users.py reset analyst@geoai.demo analyst geoai-demo
    python scripts/reset_users.py delete-all
"""
import sys
from app.db.session import SessionLocal
from app.db.models.user import User
from app.core.security import hash_password

def list_users():
    db = SessionLocal()
    users = db.query(User).all()
    if not users:
        print("No users in database.")
    else:
        for u in users:
            print(f"{u.email} | {u.username} | {u.role} | {u.id}")
    db.close()

def reset_user(email, username, password):
    db = SessionLocal()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        existing.password_hash = hash_password(password)
        existing.username = username
        print(f"Updated password for {email}")
    else:
        user = User(
            email=email,
            username=username,
            password_hash=hash_password(password),
            role="analyst"
        )
        db.add(user)
        print(f"Created user {email}")
    db.commit()
    db.close()

def delete_all():
    db = SessionLocal()
    count = db.query(User).delete()
    db.commit()
    db.close()
    print(f"Deleted {count} users")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: list | reset <email> <username> <password> | delete-all")
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "list":
        list_users()
    elif cmd == "reset":
        if len(sys.argv) != 5:
            print("Usage: reset <email> <username> <password>")
            sys.exit(1)
        reset_user(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "delete-all":
        delete_all()
    else:
        print(f"Unknown command: {cmd}")