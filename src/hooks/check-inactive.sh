#!/bin/bash
# Hook: warn when editing a template that is marked inactive in Passport.
# Runs as a PreToolUse hook on Edit and Write tool calls.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('input',{}).get('file_path',''))" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Extract the template directory from the file path
TEMPLATE_DIR=""
SLUG=""
if [[ "$FILE_PATH" == *"/article-templates/"* ]]; then
  SLUG=$(echo "$FILE_PATH" | sed -n 's|.*/article-templates/\([^/]*\).*|\1|p')
  TEMPLATE_DIR="${FILE_PATH%%/article-templates/*}/article-templates/$SLUG"
elif [[ "$FILE_PATH" == *"/admin-templates/"* ]]; then
  SLUG=$(echo "$FILE_PATH" | sed -n 's|.*/admin-templates/\([^/]*\).*|\1|p')
  TEMPLATE_DIR="${FILE_PATH%%/admin-templates/*}/admin-templates/$SLUG"
fi

if [ -z "$TEMPLATE_DIR" ] || [ -z "$SLUG" ]; then
  exit 0
fi

META="$TEMPLATE_DIR/metadata.json"
if [ ! -f "$META" ]; then
  exit 0
fi

INACTIVE=$(python3 -c "import json; print(json.load(open('$META')).get('metadata',{}).get('inactive',False))" 2>/dev/null)

if [ "$INACTIVE" = "True" ]; then
  echo "WARNING: Template \"$SLUG\" is marked inactive (disabled) in Passport. Changes will not be visible to subscribers until it is reactivated by setting \"inactive\": false in metadata.json."
fi
