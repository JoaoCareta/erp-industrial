"""Exercise failed transfers in the disposable scoped database pair created by upgrade.ps1."""
from contextlib import contextmanager
import os
import re
from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from migrate_database import BOOTSTRAP, TABLES, connections, parse_args, signature, target_signature, transfer


@contextmanager
def marker(connection, statement, removal, key):
    with connection.cursor() as sql:
        sql.execute(statement, (key,))
        connection.commit()
        try:
            yield
        finally:
            sql.execute(removal, (key,))
            connection.commit()


def check(args):
    import pymysql
    if not re.fullmatch(r"erp-check-[0-9a-f]{32}", os.environ.get("ERP_VERIFY_PROJECT", "")):
        raise ValueError("Use verify.ps1 to prepare the isolated databases.")
    if (args.source_database, args.target_database) != ("erp_scoped", "erp_upgrade_scoped"):
        raise ValueError("Use the disposable scoped databases from upgrade.ps1.")
    with connections(args) as (pg, maria):
        pristine = {table: signature(BOOTSTRAP.get(table, [])) for table in TABLES}
        actual = {table: target_signature(maria, table) for table in TABLES}
        assert actual == pristine, "This check requires a freshly initialized MariaDB."
        maria.commit()
        nonce = str(uuid4())
        with marker(maria, "insert into business_group (id,name) values (%s,'target marker')",
                    "delete from business_group where id=%s", nonce):
            try:
                with connections(args) as (source, target):
                    transfer(source, target)
            except ValueError as error:
                assert "Destination already contains different data" in str(error)
            else:
                raise AssertionError("A divergent target was overwritten.")
            assert target_signature(maria, "business_group") == signature([(nonce, "target marker")])
        # This source value is legal in PostgreSQL but exceeds MariaDB's indexed role key.
        # The copy reaches job_role only after copying several other tables and deleting seeds.
        long_role = nonce.ljust(192, "x")
        with marker(pg, "insert into job_role (id,name) values (%s,'source marker')",
                    "delete from job_role where id=%s", long_role):
            try:
                with connections(args) as (source, target):
                    transfer(source, target)
            except pymysql.err.DataError as error:
                assert error.args[0] == 1406, error
            else:
                raise AssertionError("An oversized role was truncated.")
            assert {t: target_signature(maria, t) for t in TABLES} == pristine, "Partial transfer committed."
    print("Verified divergent target rejection and transaction rollback.")


if __name__ == "__main__":
    check(parse_args())
