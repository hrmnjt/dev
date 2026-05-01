#!/usr/bin/env python3
import json, sys
try:
    data = json.load(sys.stdin)
    data.pop("lastChangelogVersion", None)
    json.dump(data, sys.stdout, indent=2)
    sys.stdout.write("\n")
except Exception:
    sys.stdout.write(sys.stdin.read())
