"""CRUD de projetos financeiros futuros e seus provisionamentos mensais.

Diferente das análises em `analytics.py` (retroativas, a partir do extrato),
este módulo é prospectivo: o titular define um orçamento e uma data-alvo
para um projeto (ex: viagem, compra grande) e distribui o custo estimado em
`ProjectProvision`s por mês. Toda a agregação — totais, progresso e a
timeline mensal — é calculada aqui no backend; o frontend só renderiza.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Project, ProjectProvision
from app.schemas import (
    ProjectCreate,
    ProjectDetailOut,
    ProjectProvisionCreate,
    ProjectProvisionOut,
    ProjectProvisionUpdate,
    ProjectSummaryOut,
    ProjectTimelineEntryOut,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _month_floor(value: date) -> date:
    """Normaliza qualquer data para o dia 1 do mês (chave da timeline)."""
    return value.replace(day=1)


@dataclass(frozen=True)
class _Totals:
    estimated: Decimal
    provisioned: Decimal
    progress: float


def _totals(project: Project, provisions: list[ProjectProvision]) -> _Totals:
    estimated = sum((p.estimated_value for p in provisions), Decimal("0"))
    provisioned = sum(
        (p.estimated_value for p in provisions if p.is_paid), Decimal("0")
    )
    budget = project.total_budget or Decimal("0")
    progress = round(float(provisioned / budget * 100), 2) if budget else 0.0
    return _Totals(estimated=estimated, provisioned=provisioned, progress=progress)


def _provision_out(provision: ProjectProvision) -> ProjectProvisionOut:
    return ProjectProvisionOut(
        id=provision.id,
        project_id=provision.project_id,
        item=provision.item,
        estimated_value=provision.estimated_value,
        expected_month=provision.expected_month.strftime("%Y-%m"),
        is_paid=provision.is_paid,
    )


def _summary_out(project: Project, provisions: list[ProjectProvision]) -> ProjectSummaryOut:
    totals = _totals(project, provisions)
    return ProjectSummaryOut(
        id=project.id,
        title=project.title,
        target_date=project.target_date,
        total_budget=project.total_budget,
        total_estimated=totals.estimated.quantize(Decimal("0.01")),
        total_provisioned=totals.provisioned.quantize(Decimal("0.01")),
        progress_percentage=totals.progress,
        provisions_count=len(provisions),
    )


def _timeline_out(provisions: list[ProjectProvision]) -> list[ProjectTimelineEntryOut]:
    """Agrupa os provisionamentos por mês esperado de aporte.

    É essa estrutura que a UI usa para mostrar exatamente quanto precisa
    ser alocado em cada mês para diluir o custo do projeto.
    """
    buckets: dict[str, list[ProjectProvision]] = defaultdict(list)
    for provision in provisions:
        buckets[provision.expected_month.strftime("%Y-%m")].append(provision)

    entries = []
    for month in sorted(buckets):
        items = sorted(buckets[month], key=lambda p: p.item)
        estimated = sum((i.estimated_value for i in items), Decimal("0"))
        paid = sum((i.estimated_value for i in items if i.is_paid), Decimal("0"))
        entries.append(
            ProjectTimelineEntryOut(
                month=month,
                estimated=estimated.quantize(Decimal("0.01")),
                paid=paid.quantize(Decimal("0.01")),
                items=[_provision_out(i) for i in items],
            )
        )
    return entries


def _detail_out(project: Project) -> ProjectDetailOut:
    provisions = list(project.provisions)
    summary = _summary_out(project, provisions)
    return ProjectDetailOut(
        **summary.model_dump(),
        provisions=[_provision_out(p) for p in provisions],
        timeline=_timeline_out(provisions),
    )


def _get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.scalar(
        select(Project)
        .options(joinedload(Project.provisions))
        .where(Project.id == project_id)
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


def _get_provision_or_404(
    db: Session, project_id: int, provision_id: int
) -> ProjectProvision:
    provision = db.scalar(
        select(ProjectProvision).where(
            ProjectProvision.id == provision_id,
            ProjectProvision.project_id == project_id,
        )
    )
    if provision is None:
        raise HTTPException(
            status_code=404, detail="Provisionamento não encontrado."
        )
    return provision


@router.get("", response_model=list[ProjectSummaryOut])
def list_projects(db: Session = Depends(get_db)) -> list[ProjectSummaryOut]:
    projects = (
        db.scalars(
            select(Project)
            .options(joinedload(Project.provisions))
            .order_by(Project.target_date)
        )
        .unique()
        .all()
    )
    return [_summary_out(p, list(p.provisions)) for p in projects]


@router.post("", response_model=ProjectDetailOut, status_code=201)
def create_project(
    payload: ProjectCreate, db: Session = Depends(get_db)
) -> ProjectDetailOut:
    project = Project(
        title=payload.title,
        target_date=payload.target_date,
        total_budget=payload.total_budget,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _detail_out(project)


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int, db: Session = Depends(get_db)) -> ProjectDetailOut:
    project = _get_project_or_404(db, project_id)
    return _detail_out(project)


@router.put("/{project_id}", response_model=ProjectDetailOut)
def update_project(
    project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)
) -> ProjectDetailOut:
    project = _get_project_or_404(db, project_id)
    if payload.title is not None:
        project.title = payload.title
    if payload.target_date is not None:
        project.target_date = payload.target_date
    if payload.total_budget is not None:
        project.total_budget = payload.total_budget
    db.commit()
    db.refresh(project)
    return _detail_out(project)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> None:
    project = _get_project_or_404(db, project_id)
    db.delete(project)
    db.commit()


@router.post(
    "/{project_id}/provisions", response_model=ProjectProvisionOut, status_code=201
)
def create_provision(
    project_id: int,
    payload: ProjectProvisionCreate,
    db: Session = Depends(get_db),
) -> ProjectProvisionOut:
    project = _get_project_or_404(db, project_id)
    provision = ProjectProvision(
        project_id=project.id,
        item=payload.item,
        estimated_value=payload.estimated_value,
        expected_month=_month_floor(payload.expected_month),
        is_paid=payload.is_paid,
    )
    db.add(provision)
    db.commit()
    db.refresh(provision)
    return _provision_out(provision)


@router.put(
    "/{project_id}/provisions/{provision_id}", response_model=ProjectProvisionOut
)
def update_provision(
    project_id: int,
    provision_id: int,
    payload: ProjectProvisionUpdate,
    db: Session = Depends(get_db),
) -> ProjectProvisionOut:
    provision = _get_provision_or_404(db, project_id, provision_id)
    if payload.item is not None:
        provision.item = payload.item
    if payload.estimated_value is not None:
        provision.estimated_value = payload.estimated_value
    if payload.expected_month is not None:
        provision.expected_month = _month_floor(payload.expected_month)
    if payload.is_paid is not None:
        provision.is_paid = payload.is_paid
    db.commit()
    db.refresh(provision)
    return _provision_out(provision)


@router.delete("/{project_id}/provisions/{provision_id}", status_code=204)
def delete_provision(
    project_id: int, provision_id: int, db: Session = Depends(get_db)
) -> None:
    provision = _get_provision_or_404(db, project_id, provision_id)
    db.delete(provision)
    db.commit()
