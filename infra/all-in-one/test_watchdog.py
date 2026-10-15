import unittest
from unittest.mock import patch

from watchdog import SyncRecovery, restart_sync
from readiness import checks


class RecoveryTests(unittest.TestCase):
    def test_startup_grace_and_transient_failure(self):
        recovery = SyncRecovery(0)
        for now in (0, 30, 60):
            self.assertFalse(recovery.tick(now, False, True))
        self.assertFalse(recovery.tick(90, True, True))
        self.assertFalse(recovery.tick(120, False, True))
        self.assertFalse(recovery.tick(150, False, True))
        self.assertTrue(recovery.tick(180, False, True))

    def test_dependencies_block_restarts_and_reset_failure_count(self):
        recovery = SyncRecovery(0)
        for now in range(0, 1200, 30):
            self.assertFalse(recovery.tick(now, False, False))
        self.assertFalse(recovery.tick(1200, False, True))
        self.assertFalse(recovery.tick(1230, False, True))
        self.assertTrue(recovery.tick(1260, False, True))

    def test_persistent_outage_backs_off_without_restarting_stack(self):
        recovery = SyncRecovery(0)
        attempts = [now for now in range(0, 3600, 30) if recovery.tick(now, False, True)]
        self.assertEqual(attempts[:5], [90, 180, 300, 540, 1020])
        self.assertEqual(attempts[-2:], [1920, 2820])
        self.assertEqual(recovery.backoff, 900)
        for now in range(3600, 3900, 30):
            self.assertFalse(recovery.tick(now, True, True))
        self.assertEqual(recovery.backoff, 60)

    def test_stable_recovery_clears_previous_retry_deadline(self):
        recovery = SyncRecovery(0)
        for now in range(0, 1950, 30):
            recovery.tick(now, False, True)
        self.assertEqual(recovery.next_attempt, 2820)
        for now in range(1950, 2250, 30):
            self.assertFalse(recovery.tick(now, True, True))
        self.assertFalse(recovery.tick(2250, False, True))
        self.assertFalse(recovery.tick(2280, False, True))
        self.assertTrue(recovery.tick(2310, False, True))

    @patch("watchdog.subprocess.run")
    def test_restart_is_scoped_and_bounded(self, run):
        run.return_value.returncode = 0
        self.assertTrue(restart_sync())
        run.assert_called_once_with(
            ["supervisorctl", "-c", "/opt/aio/supervisord.conf", "restart", "powersync"],
            capture_output=True, timeout=75,
        )
        run.return_value.returncode = 1
        self.assertFalse(restart_sync())

    @patch.dict("os.environ", {"REDIS_PASSWORD": "test"})
    @patch("readiness.command_ready", return_value=True)
    @patch("readiness.postgres_ready", return_value=True)
    @patch("readiness.http_ready")
    def test_sync_failure_does_not_hide_healthy_services(self, http, postgres, command):
        http.side_effect = lambda url, headers=None: ":8082/" not in url
        self.assertEqual(checks(), {
            "postgres": True, "redis": True, "api/database/storage": True,
            "sync": False, "web": True,
        })


if __name__ == "__main__":
    unittest.main()
