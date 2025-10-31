#!/usr/bin/env bash
set -euo pipefail

# Monitor GitHub Actions workflow runs
# Usage: ./monitor-workflow.sh [workflow_name] [run_id]

WORKFLOW_NAME="${1:-Build & Sign ZXP}"
RUN_ID="${2:-}"

echo "Monitoring workflow: $WORKFLOW_NAME"

# Get the latest run if no run_id provided
if [ -z "$RUN_ID" ]; then
  echo "Finding latest workflow run..."
  RUN_ID=$(gh run list --workflow="$WORKFLOW_NAME" --limit 1 --json databaseId --jq '.[0].databaseId')
  if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
    echo "❌ No workflow runs found"
    exit 1
  fi
  echo "Found run ID: $RUN_ID"
fi

echo ""
echo "📊 Workflow Run Details:"
echo "=========================="
gh run view "$RUN_ID" --json status,conclusion,createdAt,headBranch,headSha,displayTitle --jq '
  "Status: \(.status)",
  "Conclusion: \(.conclusion // "in_progress")",
  "Created: \(.createdAt)",
  "Branch: \(.headBranch)",
  "Commit: \(.headSha)",
  "Title: \(.displayTitle)"
'

echo ""
echo "⏳ Monitoring workflow progress..."
echo "Press Ctrl+C to stop monitoring (workflow will continue running)"
echo ""

# Monitor until completion
while true; do
  STATUS=$(gh run view "$RUN_ID" --json status,conclusion --jq '.status')
  CONCLUSION=$(gh run view "$RUN_ID" --json status,conclusion --jq '.conclusion // "in_progress"')
  
  echo "[$(date '+%H:%M:%S')] Status: $STATUS | Conclusion: $CONCLUSION"
  
  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo "=========================="
    echo "✅ Workflow completed!"
    echo "=========================="
    
    if [ "$CONCLUSION" = "success" ]; then
      echo "🎉 SUCCESS! All checks passed."
      echo ""
      echo "View details:"
      gh run view "$RUN_ID" --web
      
      # Check if artifacts were created
      echo ""
      echo "📦 Checking artifacts..."
      ARTIFACTS=$(gh run view "$RUN_ID" --json artifacts --jq '.artifacts[].name')
      if [ -n "$ARTIFACTS" ]; then
        echo "Artifacts created:"
        echo "$ARTIFACTS" | while read -r artifact; do
          echo "  - $artifact"
        done
      else
        echo "⚠️  No artifacts found"
      fi
      
      # Check for releases
      echo ""
      echo "📦 Checking releases..."
      LATEST_RELEASE=$(gh release list --limit 1 --json tagName,name --jq '.[0]')
      if [ -n "$LATEST_RELEASE" ] && [ "$LATEST_RELEASE" != "null" ]; then
        TAG=$(echo "$LATEST_RELEASE" | jq -r '.tagName')
        NAME=$(echo "$LATEST_RELEASE" | jq -r '.name')
        echo "✅ Latest release: $NAME ($TAG)"
        echo "View release: gh release view $TAG"
      else
        echo "⚠️  No releases found (this is normal if workflow was manually triggered)"
      fi
    else
      echo "❌ FAILED! Conclusion: $CONCLUSION"
      echo ""
      echo "View logs:"
      gh run view "$RUN_ID" --log-failed
      echo ""
      echo "View full details:"
      gh run view "$RUN_ID" --web
    fi
    break
  fi
  
  sleep 10
done

