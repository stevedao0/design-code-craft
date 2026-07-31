"""
Migration: Add source_template_contract fields to contract_records
Phase: TEMPLATE-CREATE-01

This migration adds:
- source_template_contract_id: INT NULL
- source_template_contract_no: VARCHAR(255) NULL

These fields track which contract was used as template for creating new contracts
(separate from reference_contract_* which is for renewal/renewal contracts).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'add_source_template_contract_fields'
down_revision = None  # Set this to the previous migration revision
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add source_template_contract_id column
    op.add_column(
        'contract_records',
        sa.Column('source_template_contract_id', sa.Integer(), nullable=True)
    )
    # Add source_template_contract_no column
    op.add_column(
        'contract_records',
        sa.Column('source_template_contract_no', sa.String(255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('contract_records', 'source_template_contract_no')
    op.drop_column('contract_records', 'source_template_contract_id')
