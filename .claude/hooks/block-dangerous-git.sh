#!/bin/bash
# PreToolUse-Hook (Claude Code): blockiert gefaehrliche Git-Operationen.
# Angepasste Fassung von mattpocock/skills git-guardrails-claude-code —
# Push auf Ticket-Branches bleibt erlaubt (der AFK-Runner braucht ihn),
# verboten sind Push nach main, Force-Push, Destruktives und Commits auf main.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

DANGEROUS_PATTERNS=(
  "git push[^|&;]*[[:space:]]main([[:space:]]|$)"
  "git push[^|&;]*HEAD:main"
  "push[[:space:]]+--force"
  "push[[:space:]]+-f([[:space:]]|$)"
  "--force-with-lease"
  "git reset --hard"
  "reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "worktree remove[^|&;]*--force[^|&;]*[^[:space:]]"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' entspricht dem Muster '$pattern'. Der Benutzer hat diese Operation gesperrt — main wird nur ueber Pull Requests aktualisiert." >&2
    exit 2
  fi
done

# Branch-Disziplin: keine Commits direkt auf main.
if echo "$COMMAND" | grep -qE "git commit"; then
  BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null)
  if [ "$BRANCH" = "main" ]; then
    echo "BLOCKED: Commit auf main. Erst einen Branch anlegen (git switch -c <ticket/...>) — main wird nur ueber Pull Requests aktualisiert." >&2
    exit 2
  fi
fi

exit 0
