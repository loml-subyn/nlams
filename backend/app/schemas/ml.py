"""Pydantic schemas for ML inference endpoints."""

from typing import Optional, List, Any
from pydantic import BaseModel, Field


class MlModelStatus(BaseModel):
    name: str
    version: str
    status: str = Field(..., description="available | unavailable | degraded")
    trained_at: Optional[str] = None


class MlPrediction(BaseModel):
    label: str
    score: float
    government_probability: Optional[float] = None
    confidence: Optional[float] = None
    unit: Optional[str] = None


class MlExplanationFactor(BaseModel):
    name: str
    value: Any


class MlExplanation(BaseModel):
    summary: str
    factors: List[MlExplanationFactor]


class MlInputSnapshot(BaseModel):
    entity_type: str = Field(..., description="project | parcel | party")
    entity_id: str


class MlPredictionResponse(BaseModel):
    model: MlModelStatus
    prediction: MlPrediction
    explanation: MlExplanation
    input_snapshot: MlInputSnapshot
    generated_at: str
    disclaimer: str


class MlHealthResponse(BaseModel):
    status: str
    model: MlModelStatus


class LandNaturePredictRequest(BaseModel):
    village: Optional[str] = Field(None, max_length=200)
    area_hectares: Optional[float] = Field(None, gt=0, le=100000)
    survey_number: Optional[str] = Field(None, max_length=200)
    party_count: int = Field(0, ge=0, le=10000)
    land_type: Optional[str] = Field(None, max_length=50)
    parcel_id: Optional[str] = None


class StagingPartyItem(BaseModel):
    id: str
    source_sno: str
    raw_name: Optional[str] = None
    name_norm: Optional[str] = None
    raw_address: Optional[str] = None
    raw_type: Optional[str] = None
    party_type: Optional[str] = None
    area_hectares: Optional[float] = None


class StagingParcelItem(BaseModel):
    id: str
    source_sno: str
    raw_district: Optional[str] = None
    raw_sub_district: Optional[str] = None
    raw_village: Optional[str] = None
    raw_survey_number: Optional[str] = None
    raw_area: Optional[str] = None
    raw_land_type: Optional[str] = None
    raw_land_nature: Optional[str] = None
    raw_land_category: Optional[str] = None
    village_norm: Optional[str] = None
    survey_number_norm: Optional[str] = None
    area_hectares: Optional[float] = None
    land_type_mapped: Optional[str] = None
    ownership_status_mapped: Optional[str] = None
    land_nature_label: Optional[str] = None
    party_count: int = 0
    created_at: Optional[str] = None
    parties: Optional[List[StagingPartyItem]] = None


class StagingSummaryResponse(BaseModel):
    total_parcels: int
    total_parties: int
    government_parcels: int
    private_parcels: int
    total_area_hectares: float
    villages: List[str]
    source_files: List[str]
    document_title: Optional[str] = None
    document_publish_date: Optional[str] = None


class StagingParcelsResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[StagingParcelItem]


class StagingPromoteRequest(BaseModel):
    project_id: str
    staging_parcel_ids: Optional[List[str]] = None
    source_file: Optional[str] = None


class StagingPromoteResponse(BaseModel):
    promoted_parcels: int
    promoted_owners: int
    project_id: str
    message: str


class IngestResponse(BaseModel):
    source_file: str
    land_rows_seen: int
    land_rows_loaded: int
    land_rows_rejected: int
    land_rows_duplicate: int
    party_rows_seen: int
    party_rows_loaded: int
    party_rows_rejected: int
    party_rows_duplicate: int
    document_title: Optional[str] = None
    document_publish_date: Optional[str] = None
