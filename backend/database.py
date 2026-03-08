from datetime import datetime, date
from sqlalchemy import create_engine, Column, Integer, String, Date, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from config import settings

DATABASE_URL = settings.DATABASE_URL

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    tier = Column(String, default="free")  # "free" or "pro"
    monthly_usage = Column(Integer, default=0)
    usage_reset_date = Column(Date, default=date.today)
    created_at = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, email: str, password_hash: str):
    user = User(email=email, password_hash=password_hash, usage_reset_date=date.today())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def increment_usage(db: Session, user: User):
    today = date.today()
    first_of_month = today.replace(day=1)

    # Reset if month rolled over
    if user.usage_reset_date < first_of_month:
        user.monthly_usage = 0
        user.usage_reset_date = first_of_month

    user.monthly_usage += 1
    db.commit()
