from pydantic import BaseModel


class AssetOut(BaseModel):
    asset_id: str
    status: str