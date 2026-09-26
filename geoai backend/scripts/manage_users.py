"""
User management for GeoAI.
Usage (from C:\Users\verma\Desktop\Satqquery\geoai backend):
    python -m scripts.manage_users list
    python -m scripts.manage_users create analyst@geoai.demo analyst geoai-demo
    python -m scripts.manage_users reset analyst@geoai.demo geoai-demo
    python -m scripts.manage_users delete-all
"""
import sys
from app.db.session import SessionLocal
from app.db.models.user import User
from app.core.security import hash_password, verify_password


def list_users():
    db = SessionLocal()
    users = db.query(User).all()
    if not users:
        print("No users in database.")
    else:
        for u in users:
            ok = verify_password("geoai-demo", u.password_hash)
            print(f"{u.email} | {u.username} | role={u.role} | "
                  f"password_ok={ok} | id={u.id}")
    db.close()


def create_user(email, username, password):
    db = SessionLocal()
    if db.query(User).filter(User.email == email).first():
        print(f"User {email} already exists. Use 'reset' instead.")
        db.close()
        return
    user = User(
        email=email,
        username=username,
        password_hash=hash_password(password),
        role="analyst"
    )
    db.add(user)
    db.commit()
    print(f"Created user: {email}")
    db.close()


def reset_user(email, password):
    db = SessionLocal()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        print(f"User {email} not found. Use 'create' instead.")
        db.close()
        return
    user.password_hash = hash_password(password)
    db.commit()
    print(f"Reset password for {email}")
    db.close()


def delete_all():
    db = SessionLocal()
    count = db.query(User).delete()
    db.commit()
    db.close()
    print(f"Deleted {count} users")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: list | create <email> <username> <password> | "
              "reset <email> <password> | delete-all")
        sys.exit(1)
    cmd = sys.argv[1]
    try:
        if cmd == "list":
            list_users()
        elif cmd == "create":
            create_user(sys.argv[2], sys.argv[3], sys.argv[4])
        elif cmd == "reset":
            reset_user(sys.argv[2], sys.argv[3])
        elif cmd == "delete-all":
            delete_all()
        else:
            print(f"Unknown command: {cmd}")
            sys.exit(1)
    except IndexError:
        print("Missing arguments. See usage above.")
        sys.exit(1)