"""Checks for representations that change between the two database drivers."""
from datetime import datetime, timedelta, timezone
from unittest import TestCase, main
from uuid import UUID

from argparse import ArgumentTypeError
from unittest.mock import patch
from migrate_database import BOOTSTRAP, column_value, configured_host, endpoint_host, endpoint_name, endpoint_port, signature


class TransferTest(TestCase):
    @patch.dict("os.environ", {"ERP_TARGET_HOST": "maria.internal"})
    def test_cli_cannot_redirect_credentials_to_another_host(self):
        self.assertEqual(configured_host("target", "maria.internal"), "maria.internal")
        with self.assertRaises(ValueError):
            configured_host("target", "other.internal")

    def test_connection_arguments_allow_only_one_endpoint(self):
        for host in ("db.example.test", "127.0.0.1", "::1"):
            self.assertEqual(endpoint_host(host), host)
        for validator, value in ((endpoint_host, "db,other"), (endpoint_name, "erp?mode=test"),
                                 (endpoint_port, "65536"), (endpoint_port, "0")):
            with self.assertRaises(ArgumentTypeError):
                validator(value)

    def test_postgres_and_mariadb_driver_values_compare_exactly(self):
        instant = datetime(2026, 11, 26, 12, 0, 1, 9)
        offset = timezone(timedelta(hours=-3))
        uid = UUID("ffffffff-eeee-dddd-cccc-000000000001")
        pg = (uid, True, instant.replace(hour=9, tzinfo=offset), None, '{"q": 0.50000000000000001}')
        maria = (str(uid), 1, instant, None, '{"q": 0.50000000000000001}')
        self.assertEqual(tuple(map(column_value, pg)), tuple(map(column_value, maria)))

    def test_reconciliation_detects_duplicates_nulls_and_changes(self):
        rows = [("ação", None), ("ação", ""), ("ação", None)]
        self.assertEqual(signature(rows), signature(reversed(rows)))
        self.assertNotEqual(signature(rows), signature(rows[:2]))
        self.assertNotEqual(signature(rows), signature([("ação", "")] * 3))

    def test_pristine_roles_exclude_the_removed_permission(self):
        self.assertNotIn(("admin", "account.suspend"), BOOTSTRAP["role_action"])
        self.assertIn(("leader", "Líder"), BOOTSTRAP["job_role"])


if __name__ == "__main__":
    main()
