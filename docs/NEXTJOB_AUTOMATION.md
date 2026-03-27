# Next Job Automation

## Purpose
This document describes the local automation loop that checks `nextjob.md` every 10 minutes and continues ELO Open World execution.

Primary queue:
- `nextjob.md`

Primary repo:
- `/Users/leo/Menu/py_workspace/elo-open-world`

## Files
Local automation files:
- runner: `/Users/leo/bin/eow-nextjob-runner.sh`
- launch agent: `/Users/leo/Library/LaunchAgents/co.metavie.eow-nextjob.plist`
- prompt template: `/Users/leo/Menu/py_workspace/elo-open-world/.automation/nextjob-prompt.md`
- logs: `/Users/leo/Library/Logs/EOW/`

## Run Model
Every 10 minutes the local runner will:
1. enter the EOW repo
2. read `nextjob.md`
3. pick the highest-priority unblocked task
4. execute one concrete implementation step
5. run local checks
6. update `nextjob.md`
7. commit on `codex/open-world-onboarding-init`
8. push and deploy if web behavior changed and checks passed

## Safety Model
This automation currently uses high-privilege Codex execution.
That is intentional because the task includes:
- local code edits
- git commits
- remote deployment

This is not a background observer. It is an active execution loop.

## Commands
Check status:
```bash
launchctl print gui/$(id -u)/co.metavie.eow-nextjob
```

Tail logs:
```bash
tail -f /Users/leo/Library/Logs/EOW/eow-nextjob.log
```

Stop:
```bash
launchctl bootout gui/$(id -u) /Users/leo/Library/LaunchAgents/co.metavie.eow-nextjob.plist
```

Start:
```bash
launchctl bootstrap gui/$(id -u) /Users/leo/Library/LaunchAgents/co.metavie.eow-nextjob.plist
launchctl kickstart -k gui/$(id -u)/co.metavie.eow-nextjob
```

## Expected Output
The runner should leave these artifacts:
- updated `nextjob.md`
- local git commit(s)
- pushed branch updates
- deployment updates when applicable
- last agent message in:
  - `/Users/leo/Library/Logs/EOW/last-message.txt`

## Operator Guidance
Use this loop only when `nextjob.md` contains a clear queue.
Do not let the queue become vague. The automation is only as good as the next concrete task.
