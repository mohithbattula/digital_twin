import ast, sys

files = [
    "backend/graph/nodes/persona.py",
    "backend/api/chat.py",
    "backend/graph/state.py",
]

all_ok = True
for f in files:
    try:
        src = open(f, encoding="utf-8").read()
        ast.parse(src)
        print(f"OK  {f}")
    except SyntaxError as e:
        print(f"ERR {f}: {e}")
        all_ok = False

sys.exit(0 if all_ok else 1)
