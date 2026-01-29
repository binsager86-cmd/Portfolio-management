#!/usr/bin/env python3
"""
Standalone cron script for daily price updates and snapshots.

This script can be run via:
1. DigitalOcean App Platform "Jobs" component
2. GitHub Actions scheduled workflow
3. External cron service that can run scripts
4. Windows Task Scheduler locally

Usage:
    python cron_update.py                    # Run full update (prices + snapshots)
    python cron_update.py --prices-only      # Only update prices
    python cron_update.py --snapshots-only   # Only save snapshots

Environment:
    DATABASE_URL - PostgreSQL connection string (for production)
    CRON_SECRET_KEY - Not required for direct script execution
"""

import os
import sys
import argparse
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    parser = argparse.ArgumentParser(description='Portfolio daily update cron job')
    parser.add_argument('--prices-only', action='store_true', help='Only update prices')
    parser.add_argument('--snapshots-only', action='store_true', help='Only save snapshots')
    args = parser.parse_args()
    
    print(f"=" * 60)
    print(f"🚀 CRON JOB STARTED")
    print(f"📅 Time: {datetime.now().isoformat()}")
    print(f"=" * 60)
    
    try:
        from auto_price_scheduler import run_price_update_job
        
        if args.prices_only:
            print("Running prices only...")
            # TODO: If you need prices-only, split run_price_update_job
        elif args.snapshots_only:
            print("Running snapshots only...")
            # TODO: If you need snapshots-only, split run_price_update_job
        else:
            print("Running full update (prices + snapshots)...")
            run_price_update_job()
        
        print(f"\n✅ CRON JOB COMPLETED SUCCESSFULLY")
        print(f"📅 Finished: {datetime.now().isoformat()}")
        return 0
        
    except Exception as e:
        print(f"\n❌ CRON JOB FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
