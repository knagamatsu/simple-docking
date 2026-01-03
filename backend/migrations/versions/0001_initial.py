"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2025-02-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ligands",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("input_type", sa.String(), nullable=True),
        sa.Column("smiles", sa.Text(), nullable=True),
        sa.Column("molfile", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_table(
        "ligand_conformers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("ligand_id", sa.String(), sa.ForeignKey("ligands.id"), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("pdb_path", sa.Text(), nullable=True),
        sa.Column("pdbqt_path", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
    )
    op.create_table(
        "proteins",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("organism", sa.String(), nullable=True),
        sa.Column("source_id", sa.String(), nullable=True),
        sa.Column("receptor_pdbqt_path", sa.Text(), nullable=False),
        sa.Column("receptor_meta_json", sa.JSON(), nullable=True),
        sa.Column("default_box_json", sa.JSON(), nullable=True),
        sa.Column("pocket_method", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
    )
    op.create_table(
        "runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("ligand_id", sa.String(), sa.ForeignKey("ligands.id"), nullable=False),
        sa.Column("preset", sa.String(), nullable=False),
        sa.Column("options_json", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("total_tasks", sa.Integer(), nullable=False),
        sa.Column("done_tasks", sa.Integer(), nullable=False),
        sa.Column("failed_tasks", sa.Integer(), nullable=False),
    )
    op.create_table(
        "tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("run_id", sa.String(), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("protein_id", sa.String(), sa.ForeignKey("proteins.id"), nullable=False),
        sa.Column("conformer_id", sa.String(), sa.ForeignKey("ligand_conformers.id"), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("log_path", sa.Text(), nullable=True),
    )
    op.create_table(
        "results",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("task_id", sa.String(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("best_score", sa.Float(), nullable=True),
        sa.Column("pose_paths_json", sa.JSON(), nullable=True),
        sa.Column("metrics_json", sa.JSON(), nullable=True),
    )
    op.create_table(
        "protein_baselines",
        sa.Column("protein_id", sa.String(), sa.ForeignKey("proteins.id"), primary_key=True),
        sa.Column("method", sa.String(), primary_key=True),
        sa.Column("quantiles_json", sa.JSON(), nullable=True),
        sa.Column("mean", sa.Float(), nullable=True),
        sa.Column("std", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("protein_baselines")
    op.drop_table("results")
    op.drop_table("tasks")
    op.drop_table("runs")
    op.drop_table("proteins")
    op.drop_table("ligand_conformers")
    op.drop_table("ligands")
