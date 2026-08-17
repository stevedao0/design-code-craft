"""
Phase 1.0 seed: insert fixture data into 5433 DB.

All values are synthetic, NOT from production.
"""
import psycopg2
from datetime import date

DB_URL = "postgresql://vcpmc_user:change_me@localhost:5433/vcpmc_contract_new"


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("DELETE FROM kpi_field_assignments")
    cur.execute("DELETE FROM annual_kpi_targets")
    cur.execute("DELETE FROM contract_records WHERE contract_no LIKE 'FIXTURE-%'")
    cur.execute("DELETE FROM contract_quarantine")

    USER_FAKE = 9991

    cur.execute("""
        INSERT INTO kpi_field_assignments
            (user_id, field_code, reporting_year, is_active, target_amount)
        VALUES (%s, %s, %s, TRUE, %s)
    """, (USER_FAKE, "KARAOKE", 2026, 4_500_000_000))
    cur.execute("""
        INSERT INTO kpi_field_assignments
            (user_id, field_code, reporting_year, is_active, target_amount)
        VALUES (%s, %s, %s, TRUE, %s)
    """, (USER_FAKE, "KHU_VUI_CHOI", 2026, 200_000_000))

    cur.execute("""
        INSERT INTO annual_kpi_targets (user_id, year, annual_target)
        VALUES (%s, %s, %s)
    """, (USER_FAKE, 2026, 4_500_000_000))

    # Fixture contracts: rows that should count
    fixture_contracts = [
        ("KARAOKE",      date(2026, 3, 1), 100_000_000, 108_000_000, 8_000_000, 108_000_000, "fixture_a@example.com"),
        ("KARAOKE",      date(2026, 4, 1), 200_000_000, 216_000_000, 16_000_000, 216_000_000, "fixture_b@example.com"),
        ("PHONG_THU_AM", date(2026, 5, 1),  50_000_000,  54_000_000, 4_000_000,  54_000_000, "fixture_c@example.com"),
        ("KHU_VUI_CHOI", date(2026, 6, 1),  80_000_000,  86_400_000, 6_400_000,  86_400_000, "fixture_d@example.com"),
        ("KARAOKE",      date(2025, 12, 31), 999_000_000, 0, 0, 0, "x@example.com"),
        ("KARAOKE",      date(2026, 7, 1), 0, 0, 0, 5_000_000, "legacy@example.com"),
        ("KARAOKE",      date(2026, 8, 1), 10_000_000, 10_800_000, 800_000, 10_800_000, "dup@example.com"),
        ("SCTT",         date(2026, 9, 1), 30_000_000, 32_400_000, 2_400_000, 32_400_000, "sctt@example.com"),
    ]
    for idx, (lv, dt, bv, av, vat, so_tien, owner) in enumerate(fixture_contracts):
        contract_no = f"FIXTURE-{idx:03d}"
        annex_no = None
        cur.execute("""
            INSERT INTO contract_records
              (contract_no, contract_year, annex_no,
               ngay_lap_hop_dong, linh_vuc,
               royalty_amount_before_vat, royalty_amount_after_vat, vat_amount,
               so_tien_value,
               nguoi_thuc_hien_email, imported_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """, (contract_no, dt.year, annex_no, dt, lv, bv, av, vat, so_tien, owner))
        # Duplicate row for idx==6 (sharing contract_no via annex) to test dedupe
        if idx == 6:
            cur.execute("""
                INSERT INTO contract_records
                  (contract_no, contract_year, annex_no,
                   ngay_lap_hop_dong, linh_vuc,
                   royalty_amount_before_vat, royalty_amount_after_vat, vat_amount,
                   so_tien_value, nguoi_thuc_hien_email, imported_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """, (contract_no, dt.year, "ANNEX-DUP", dt, lv, bv, av, vat, so_tien, owner))

    cur.execute("SELECT COUNT(*) FROM contract_records WHERE contract_no LIKE 'FIXTURE-%'")
    print("FIXTURE contracts:", cur.fetchone()[0])
    cur.execute("""
        SELECT linh_vuc, COUNT(*) FROM contract_records
        WHERE contract_no LIKE 'FIXTURE-%' AND annex_no IS NULL
        GROUP BY linh_vuc ORDER BY linh_vuc
    """)
    for r in cur.fetchall(): print(" ", r)
    cur.execute("SELECT field_code, reporting_year, target_amount FROM kpi_field_assignments ORDER BY id")
    for r in cur.fetchall(): print(" ", r)
    cur.execute("SELECT user_id, year, annual_target FROM annual_kpi_targets")
    for r in cur.fetchall(): print(" ", r)
    conn.close()


if __name__ == "__main__":
    main()