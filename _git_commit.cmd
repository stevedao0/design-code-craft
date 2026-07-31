@echo off
cd /d F:\APPs
set GIT_INDEX_FILE=%TEMP%\git-orphan
set GIT_EDITOR=cmd /c exit 0
set GIT_SEQUENCE_EDITOR=cmd /c exit 0
git commit-tree -m "chore: reset main with current app source" -p 4aeb83317ca8cb760e144abe7fb1a1a958b398ce 6525d683eaae5ac78e756639f786be5ad358e098
