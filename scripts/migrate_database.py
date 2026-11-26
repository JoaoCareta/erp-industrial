"""Copy the scoped ERP schema from PostgreSQL into a Flyway-initialized MariaDB."""
import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
from ipaddress import IPv6Address
import json
import os
import re
from uuid import UUID

# Column order is explicit because the pre-group upgrade appended item.group_id.
TABLES = {
    "business_group": "id name",
    "plant": "id group_id name",
    "sector": "plant_id id name",
    "account": "id group_id issuer subject name active",
    "team_member": "group_id plant_id sector_id account_id",
    "job_role": "id name",
    "role_action": "role_id action",
    "assignment": "group_id account_id role_id plant_id sector_id",
    "item": "id group_id kind code name dimension active category_id unit_id",
    "draft": "id product_id revision body",
    "publication": "product_id version draft_id actor published_at body",
    "access_audit": "id occurred_at actor action target result reason correlation",
}

# Only these exact V1/V5 seeds may be replaced on a fresh target.
BOOTSTRAP = {
    "job_role": [("leader", "Líder"), ("manager", "Gerente de unidade"),
                 ("regional", "Gerente regional"), ("admin", "Administrador do grupo"),
                 ("operator", "Operador")],
    "role_action": [("leader", "team.read"), ("manager", "team.read"),
                    ("manager", "engineering.read"), ("regional", "team.read"),
                    ("regional", "engineering.read"), ("admin", "team.read"),
                    ("admin", "engineering.read"), ("admin", "engineering.edit"),
                    ("admin", "engineering.publish")],
}

BATCH_SIZE = 500


def column_value(value):
    """Convert driver-specific scalars without parsing historical JSON or rounding numbers."""
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.isoformat(sep=" ", timespec="microseconds")
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return value


def signature(rows):
    """Include duplicate rows independently. SQL ordering differs across the two engines."""
    hashes = []
    for row in rows:
        encoded = json.dumps(tuple(map(column_value, row)), ensure_ascii=False, separators=(",", ":"))
        hashes.append(hashlib.sha256(encoded.encode("utf-8")).digest())
    combined = hashlib.sha256()
    for row_hash in sorted(hashes):
        combined.update(row_hash)
    return len(hashes), combined.hexdigest()


UUID_COLUMNS = {"account_id", "category_id", "unit_id", "product_id", "draft_id", "correlation"}


def projection(table, postgres):
    expressions = []
    for name in TABLES[table].split():
        if postgres and name == "body":
            expressions.append("body::text")  # Preserve the decimal lexemes in JSONB.
        elif not postgres:
            # Native UUID metadata varies by MariaDB protocol/client version.
            if name in UUID_COLUMNS or (name == "id" and table in ("account", "item", "draft")):
                expressions.append(f"cast(`{name}` as char)")
            else:
                expressions.append(f"`{name}`")
        else:
            expressions.append(f'"{name}"')
    return ", ".join(expressions)


def source_cursor(source, table):
    cursor = source.cursor(name=f"transfer_{table}")
    cursor.itersize = BATCH_SIZE
    cursor.execute(f"select {projection(table, True)} from public.{table}")
    return cursor


def target_signature(target, table):
    from pymysql.cursors import SSCursor
    with target.cursor(SSCursor) as rows:
        rows.execute(f"select {projection(table, False)} from `{table}`")
        return signature(rows)


def require_versions(cursor, supported):
    cursor.execute("select version, success from flyway_schema_history where version is not null")
    history = cursor.fetchall()
    versions = {version for version, _ in history}
    if not {"1", "2", "5"} <= versions <= supported or not all(ok for _, ok in history):
        raise ValueError("Unsupported Flyway history. Prepare the scoped source and core-only target.")


def require_supported_schema(source, sql):
    rows = source.execute(
        """select c.table_name, c.column_name from information_schema.columns c
           join information_schema.tables t using (table_catalog,table_schema,table_name)
           where c.table_schema='public' and t.table_type='BASE TABLE'
             and c.table_name <> 'flyway_schema_history'"""
    )
    columns = {}
    for table, column in rows:
        columns.setdefault(table, set()).add(column)
    if columns != {name: set(fields.split()) for name, fields in TABLES.items()}:
        raise ValueError("Unsupported source schema. Upgrade the PostgreSQL staging copy first.")
    with source.cursor() as cursor:
        require_versions(cursor, {"1", "2", "3", "4", "5", "6"})
    require_versions(sql, {"1", "2", "5"})


def copy_rows(source, sql):
    sql.execute("delete from role_action")
    sql.execute("delete from job_role")
    for table, fields in TABLES.items():
        columns = fields.split()
        # Load all catalog endpoints before their self-referential foreign keys.
        initial = columns[:-2] if table == "item" else columns
        insert = (f"insert into `{table}` ({', '.join(f'`{c}`' for c in initial)}) "
                  f"values ({', '.join(['%s'] * len(initial))})")
        with source_cursor(source, table) as rows:
            while batch := rows.fetchmany(BATCH_SIZE):
                sql.executemany(insert, [tuple(map(column_value, row[:len(initial)])) for row in batch])
        if table == "item":
            with source.cursor(name="item_links") as links:
                links.execute("select category_id,unit_id,id from public.item "
                              "where category_id is not null or unit_id is not null")
                while batch := links.fetchmany(BATCH_SIZE):
                    sql.executemany("update item set category_id=%s, unit_id=%s where id=%s",
                                    [tuple(map(column_value, row)) for row in batch])


def transfer(source, target):
    source.execute("set transaction isolation level repeatable read, read only")
    source.execute("set local time zone 'UTC'")
    source.execute("set local search_path to public")
    with target.cursor() as sql:
        sql.execute("select get_lock(concat('erp-migration-', database()), 0)")
        if sql.fetchone()[0] != 1:
            raise RuntimeError("Another transfer is running for this MariaDB database.")
        sql.execute("set session time_zone='+00:00'")
        sql.execute("set session sql_mode='STRICT_ALL_TABLES,NO_AUTO_VALUE_ON_ZERO,NO_ENGINE_SUBSTITUTION'")
        sql.execute("set session transaction isolation level serializable")
        target.begin()
        require_supported_schema(source, sql)
        expected = {}
        for table in TABLES:
            with source_cursor(source, table) as rows:
                expected[table] = signature(rows)
        actual = {table: target_signature(target, table) for table in TABLES}
        if expected != actual:
            if any(actual[t] != signature(BOOTSTRAP.get(t, [])) for t in TABLES):
                raise ValueError("Destination already contains different data. Use a fresh MariaDB database.")
            copy_rows(source, sql)
            for table in TABLES:
                if target_signature(target, table) != expected[table]:
                    raise ValueError(f"Reconciliation failed for {table}.")
        # PostgreSQL sequences can have gaps after rollbacks or deletions. Preserve
        # their high-water mark too. ALTER commits implicitly, so run it only after
        # reconciliation. If it fails, retry against the identical destination.
        last, used = source.execute("select last_value, is_called from access_audit_id_seq").fetchone()
        target.commit()
        sql.execute("select auto_increment from information_schema.tables "
                    "where table_schema=database() and table_name='access_audit'")
        next_id = last + int(used)
        if sql.fetchone()[0] < next_id:
            sql.execute(f"alter table access_audit auto_increment={next_id:d}")
        for table, (count, digest) in expected.items():
            print(f"{table}: {count} SHA-256 {digest}")


def endpoint_host(value):
    if re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", value):
        return value
    try:
        return str(IPv6Address(value))
    except ValueError as error:
        raise argparse.ArgumentTypeError("Expected a database hostname or IP address.") from error


def endpoint_name(value):
    if not re.fullmatch(r"[\w.@-]+", value):
        raise argparse.ArgumentTypeError("Expected a single database or account name.")
    return value


def configured_host(role, requested):
    host = endpoint_host(os.environ.get(f"ERP_{role.upper()}_HOST", "127.0.0.1"))
    if requested is not None and requested != host:
        raise ValueError(f"Requested {role} host differs from ERP_{role.upper()}_HOST.")
    return host


def endpoint_port(value):
    port = int(value)
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("Expected a port between 1 and 65535.")
    return port


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    for prefix, port in (("source", 5432), ("target", 3306)):
        parser.add_argument(f"--{prefix}-host", type=endpoint_host)
        parser.add_argument(f"--{prefix}-port", default=port, type=endpoint_port)
        parser.add_argument(f"--{prefix}-database", default="erp", type=endpoint_name)
        parser.add_argument(f"--{prefix}-user", default="erp", type=endpoint_name)
    return parser.parse_args()


@contextmanager
def connections(args):
    import psycopg
    import pymysql
    with psycopg.connect(host=configured_host("source", args.source_host), port=args.source_port, dbname=args.source_database,
                         user=args.source_user, password=os.environ["ERP_SOURCE_PASSWORD"]) as source:
        with closing(pymysql.connect(host=configured_host("target", args.target_host), port=args.target_port, db=args.target_database,
                                     user=args.target_user, password=os.environ["ERP_TARGET_PASSWORD"],
                                     charset="utf8mb4")) as target:
            yield source, target


if __name__ == "__main__":
    with connections(parse_args()) as (source, target):
        transfer(source, target)
