#!/usr/bin/env python3
"""
Entry point for DigitalOcean cron jobs.

Usage:
    python cron_update.py          # Full update (prices + snapshots)
"""

import sys
import logging
import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("CronUpdate")


def main():
    logger.info("=" * 60)
    logger.info("🚀 CRON JOB STARTED")
    logger.info(f"📅 Time: {datetime.datetime.utcnow().isoformat()} UTC")
    logger.info("=" * 60)
    logger.info("Mode: full update (prices + snapshots)")

    try:
        from auto_price_scheduler import run_price_update_job
        run_price_update_job()
        logger.info("✅ CRON JOB COMPLETED SUCCESSFULLY")
        logger.info(f"📅 Finished: {datetime.datetime.utcnow().isoformat()} UTC")
        return 0
    except Exception as e:
        logger.error(f"❌ CRON JOB FAILED: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
