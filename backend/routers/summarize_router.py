import logging
import traceback
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, increment_usage, User
from auth import get_current_user
from config import settings
from services.summarizer import summarize_video

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/summarize", tags=["summarize"])


class SummarizeRequest(BaseModel):
    videoUrl: str


class SummarizeResponse(BaseModel):
    type: str
    overview: str
    sections: list
    highlights: list


@router.post("", response_model=SummarizeResponse)
async def summarize(
    request: SummarizeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Quota check for free tier
    if user.tier == "free" and user.monthly_usage >= settings.FREE_TIER_MONTHLY_LIMIT:
        raise HTTPException(status_code=402, detail="Quota exceeded")

    try:
        result = await summarize_video(request.videoUrl)
    except Exception as e:
        logger.error("Summarize error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to summarize video: {str(e)}")

    # Increment usage
    increment_usage(db, user)

    return {
        "type": result.get("type", "other"),
        "overview": result.get("overview", ""),
        "sections": result.get("sections", []),
        "highlights": result.get("highlights", []),
    }
