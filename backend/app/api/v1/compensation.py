from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from datetime import datetime, timezone
import uuid
import random
import string

from app.db.session import get_db
from app.models.compensation import Compensation, Payment
from app.models.user import User
from app.core.deps import require_role, get_current_user
from app.schemas.compensation import (
    CompensationCreate,
    CompensationUpdate,
    CompensationResponse,
    PaginatedCompensations,
    PaymentCreate,
    PaymentUpdate,
    PaymentResponse,
    PaginatedPayments,
)
from app.models.audit import AuditLog

router = APIRouter(tags=["compensation"])


def generate_pfms_reference():
    return "PFMS-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=12))


# ===== Compensation =====
@router.get("/compensation", response_model=PaginatedCompensations)
async def list_compensations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    parcel_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    project_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Compensation)
    count_query = select(func.count(Compensation.id))

    if parcel_id:
        query = query.where(Compensation.parcel_id == parcel_id)
        count_query = count_query.where(Compensation.parcel_id == parcel_id)
    if status_filter:
        query = query.where(Compensation.status == status_filter)
        count_query = count_query.where(Compensation.status == status_filter)

    total = (await db.execute(count_query)).scalar()
    query = (
        query.order_by(Compensation.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    items = result.scalars().all()
    return PaginatedCompensations(
        items=[CompensationResponse.model_validate(c) for c in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/compensation", response_model=CompensationResponse, status_code=status.HTTP_201_CREATED
)
async def create_compensation(
    data: CompensationCreate,
    current_user: User = Depends(
        require_role(["super_admin", "state_authority", "district_officer"])
    ),
    db: AsyncSession = Depends(get_db),
):
    solatium = data.solatium or (data.market_value * 1.0 if data.market_value else 0)
    total = (data.market_value or 0) + solatium + (data.additional_compensation or 0)

    comp = Compensation(
        parcel_id=data.parcel_id,
        market_value=data.market_value,
        solatium=solatium,
        additional_compensation=data.additional_compensation,
        total_award=total,
        assessed_by=current_user.id,
        assessment_date=datetime.now(timezone.utc),
    )
    db.add(comp)
    await db.flush()

    # Audit log
    audit = AuditLog(
        entity_type="compensation",
        entity_id=comp.id,
        action="create",
        performed_by=current_user.id,
        new_value=data.model_dump(exclude_none=True),
        remarks="Compensation assessment created",
    )
    db.add(audit)
    await db.commit()
    await db.refresh(comp)
    return CompensationResponse.model_validate(comp)


@router.patch("/compensation/{comp_id}", response_model=CompensationResponse)
async def update_compensation(
    comp_id: uuid.UUID,
    data: CompensationUpdate,
    current_user: User = Depends(
        require_role(["super_admin", "state_authority", "district_officer"])
    ),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Compensation).where(Compensation.id == comp_id))
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Compensation not found")

    old_status = comp.status
    update_dict = data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(comp, key, value)

    # Recalculate total
    comp.total_award = (
        (comp.market_value or 0) + (comp.solatium or 0) + (comp.additional_compensation or 0)
    )

    # Audit log on status change
    if "status" in update_dict and update_dict["status"] != old_status:
        audit = AuditLog(
            entity_type="compensation",
            entity_id=comp.id,
            action="status_change",
            performed_by=current_user.id,
            old_value={"status": old_status},
            new_value={"status": update_dict["status"]},
            remarks=f"Compensation status changed from {old_status} to {update_dict['status']}",
        )
        db.add(audit)

    await db.commit()
    await db.refresh(comp)
    return CompensationResponse.model_validate(comp)


# ===== Payments =====
@router.get("/payments", response_model=PaginatedPayments)
async def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    compensation_id: Optional[uuid.UUID] = None,
    payment_status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Payment)
    count_query = select(func.count(Payment.id))

    if compensation_id:
        query = query.where(Payment.compensation_id == compensation_id)
        count_query = count_query.where(Payment.compensation_id == compensation_id)
    if payment_status:
        query = query.where(Payment.payment_status == payment_status)
        count_query = count_query.where(Payment.payment_status == payment_status)

    total = (await db.execute(count_query)).scalar()
    query = (
        query.order_by(Payment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    result = await db.execute(query)
    items = result.scalars().all()
    return PaginatedPayments(
        items=[PaymentResponse.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    data: PaymentCreate,
    current_user: User = Depends(
        require_role(["super_admin", "state_authority", "district_officer"])
    ),
    db: AsyncSession = Depends(get_db),
):
    payment = Payment(
        compensation_id=data.compensation_id,
        land_owner_id=data.land_owner_id,
        amount=data.amount,
        pfms_reference=generate_pfms_reference(),
    )
    db.add(payment)
    await db.flush()

    audit = AuditLog(
        entity_type="payment",
        entity_id=payment.id,
        action="create",
        performed_by=current_user.id,
        new_value={
            "compensation_id": str(data.compensation_id),
            "amount": data.amount,
        },
        remarks=f"Payment of ₹{data.amount:,.2f} created with PFMS ref {payment.pfms_reference}",
    )
    db.add(audit)
    await db.commit()
    await db.refresh(payment)
    return PaymentResponse.model_validate(payment)


@router.patch("/payments/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: uuid.UUID,
    data: PaymentUpdate,
    current_user: User = Depends(
        require_role(["super_admin", "state_authority", "district_officer"])
    ),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    old_status = payment.payment_status
    update_dict = data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(payment, key, value)

    # Audit log on status change
    if "payment_status" in update_dict and update_dict["payment_status"] != old_status:
        audit = AuditLog(
            entity_type="payment",
            entity_id=payment.id,
            action="status_change",
            performed_by=current_user.id,
            old_value={"payment_status": old_status},
            new_value={"payment_status": update_dict["payment_status"]},
            remarks=f"Payment status changed from {old_status} to {update_dict['payment_status']}",
        )
        db.add(audit)

    await db.commit()
    await db.refresh(payment)
    return PaymentResponse.model_validate(payment)


@router.post("/compensation/calculate-statutory", response_model=dict)
async def calculate_statutory_compensation(
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Statutory award computation under RFCTLARR Act 2013 (Section 26 & Section 30)."""
    area_ha = float(body.get("area_hectares", 1.0))
    circle_rate = float(body.get("circle_rate_per_sqm", 500.0))
    dist_km = float(body.get("urban_distance_km", 15.0))
    assets_val = float(body.get("assets_value", 0.0))
    months = float(body.get("interest_months", 12.0))

    area_sqm = area_ha * 10000.0
    base_land_value = area_sqm * circle_rate

    # Rural Multiplier Factor per First Schedule of RFCTLARR Act 2013
    if dist_km <= 10.0:
        multiplier = 1.0
        loc_desc = "Urban / Sub-urban area (<= 10km)"
    elif dist_km <= 20.0:
        multiplier = 1.25
        loc_desc = "Semi-rural corridor (10km - 20km)"
    elif dist_km <= 30.0:
        multiplier = 1.50
        loc_desc = "Rural area (20km - 30km)"
    elif dist_km <= 50.0:
        multiplier = 1.75
        loc_desc = "Deep rural area (30km - 50km)"
    else:
        multiplier = 2.0
        loc_desc = "Remote rural area (> 50km)"

    multiplied_land_value = base_land_value * multiplier
    total_market_value = multiplied_land_value + assets_val

    # Section 30(3): 12% per annum Additional Market Value (1.0% per month)
    amv_12_pct = round(multiplied_land_value * (0.12 * (months / 12.0)), 2)

    # Section 30(1): 100% Solatium on Total Market Value
    solatium_100_pct = round(total_market_value, 2)

    total_statutory_award = round(total_market_value + amv_12_pct + solatium_100_pct, 2)

    return {
        "area_hectares": area_ha,
        "area_sqm": area_sqm,
        "circle_rate_per_sqm": circle_rate,
        "base_circle_rate_value": round(base_land_value, 2),
        "rural_multiplier_factor": multiplier,
        "location_classification": loc_desc,
        "multiplied_land_value": round(multiplied_land_value, 2),
        "assets_value": assets_val,
        "total_basic_market_value": round(total_market_value, 2),
        "solatium_100_percent": solatium_100_pct,
        "additional_market_value_12_pct": amv_12_pct,
        "interest_months": months,
        "total_statutory_award": total_statutory_award,
        "legal_act_reference": "Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013 (RFCTLARR)",
        "statutory_notes": [
            f"Section 26: Land market value multiplied by factor of {multiplier}x based on urban distance ({dist_km} km).",
            f"Section 30(1): 100% Solatium mandatory on aggregate market value of land and attached assets.",
            f"Section 30(3): Additional Market Value calculated at 12% p.a. for {months:.0f} month period.",
        ],
    }
