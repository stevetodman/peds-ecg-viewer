#!/bin/bash
# Auto-commit ML progress every 30 minutes
# Usage: ./ml/auto_commit.sh &

INTERVAL=1800  # 30 minutes in seconds
LOG_FILE="ml/auto_commit.log"

echo "Starting auto-commit daemon at $(date)" >> $LOG_FILE

while true; do
    sleep $INTERVAL

    # Check if there are changes
    if [[ -n $(git status -s ml/) ]]; then
        timestamp=$(date +"%Y-%m-%d %H:%M")

        # Stage ML directory changes
        git add ml/

        # Commit with timestamp
        git commit -m "Auto-save ML progress: $timestamp

🤖 Generated with [Claude Code](https://claude.com/claude-code)" >> $LOG_FILE 2>&1

        echo "[$timestamp] Committed ML changes" >> $LOG_FILE
    else
        echo "[$(date +"%Y-%m-%d %H:%M")] No changes to commit" >> $LOG_FILE
    fi
done
