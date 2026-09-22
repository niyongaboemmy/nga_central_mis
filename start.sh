#!/usr/bin/env bash
# Central MIS - local development on macOS / Linux.  Windows users: start.bat
#
# Same steps as start.bat: check Node, create .env files, make sure the
# database engine is up, install packages, then start everything. Run it
# again any time - it skips whatever is already done.
set -u
cd "$(dirname "$0")" || exit 1

# ---------------------------------------------------------------- helpers
say()  { printf '  - %s\n' "$*"; }
warn() { printf '\n  [warn] %s\n' "$1"; shift; for l in "$@"; do printf '         %s\n' "$l"; done; echo; }
die()  { printf '\n  [X] %s\n' "$1"; shift; for l in "$@"; do printf '      %s\n' "$l"; done; echo; read -r -p "Press Enter to close... " _; exit 1; }

# port_open <port>: something is listening on 127.0.0.1:<port>. Bash's /dev/tcp
# needs no extra tool; nc is the fallback for shells built without it.
port_open() {
    if (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; then exec 3>&-; return 0; fi
    command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$1" >/dev/null 2>&1
}
# wait_port <port> <seconds>: prints a dot every 5s until it opens; 1 on timeout.
wait_port() {
    local waited=0
    until port_open "$1"; do
        [ "$waited" -ge "$2" ] && { echo; return 1; }
        sleep 5; waited=$((waited + 5)); printf '.'
    done
    echo
}
# npm_install <label> <dir> <hint> [npm args...]: install once, retry once, then stop.
npm_install() {
    local label=$1 dir=$2 hint=$3; shift 3
    say "Installing $label$hint..."
    if ! (cd "$dir" && npm install "$@"); then
        say "That did not finish (usually the connection) - trying once more..."
        (cd "$dir" && npm install "$@") || die "Installing $label failed twice - see the error above." \
            "Check your connection and run ./start.sh again."
    fi
}

echo "==================================================="
echo "   NGA Central MIS  -  local development"
echo "==================================================="
echo
echo "[1/5] Checking Node.js..."
command -v node >/dev/null 2>&1 || die "Node.js is not installed, or not on your PATH." \
    "Install the LTS build from https://nodejs.org/ and run this again."
say "Node $(node -v)"

echo "[2/5] Checking configuration..."
[ -f "backend/.env" ]  || { cp "backend/.env.example" "backend/.env" && say "Created backend/.env"; }
[ -f "frontend/.env" ] || { cp "frontend/.env.example" "frontend/.env" && say "Created frontend/.env"; }
# backend/.env is git-ignored: your local settings can never be pushed.
say "Configuration present"

# --------------------------------------------------------------- 3. Database
echo "[3/5] Checking MySQL..."
if ! port_open 3306; then
    warn "MySQL is not accepting connections on port 3306." \
         "Start it (macOS: brew services start mysql, or XAMPP's manager), then press Enter to retry..."
    read -r _
    port_open 3306 || die "Still cannot reach MySQL. Fix that first."
fi
say "MySQL ready"

# ------------------------------------------------------------ 4. Dependencies
# Dependencies come before the database here: db:setup is a TypeScript script
# run through the backend's own node_modules, so it cannot run until they exist.
echo "[4/5] Checking dependencies..."
# Test for the tool each dev script actually runs, not just the folder: an
# `npm install` cut off half-way leaves node_modules present but without its
# .bin entries, and the app then dies with "vite: command not found".
# Re-running npm install repairs such a folder, so that is the fix as well
# as the first-run path.
[ -f "node_modules/.bin/concurrently" ]        || npm_install "root packages" . ""
[ -f "backend/node_modules/.bin/ts-node" ]     || npm_install "backend packages" backend " (first run, takes a few minutes)"
[ -f "frontend/node_modules/.bin/vite" ]       || npm_install "frontend packages" frontend ""
say "Dependencies ready"

# The setup script talks to MySQL itself (backend/.env), so no mysql CLI is
# needed here. Once the database exists, --refresh re-applies only the local
# accounts and SSO clients (a few queries); otherwise the database is built.
if (cd backend && npm run db:setup -- --refresh >/dev/null 2>&1); then
    say "Database ready (dev accounts refreshed)"
else
    say "Building the database (first run, takes a few minutes)..."
    (cd backend && npm run db:setup) || die "Database setup failed - see the error above." \
        "If MySQL has a root password, put it in backend/.env as DB_PASSWORD." \
        "To wipe and rebuild an existing database:" \
        "    cd backend && npm run db:setup -- --force"
fi

# ----------------------------------------------------------------- 5. Launch
echo "[5/5] Starting Central MIS..."
echo
echo "==================================================="
echo "  Open:  http://localhost:5173"
echo "  API:   http://localhost:5001"
echo
echo "  Sign in as  superadmin  /  Admin@1234"
echo "  or as any role:  dev.admin, dev.teacher,"
echo "  dev.classteacher, dev.student, dev.parent ..."
echo "  Same password for all. Full list: guides/START_HERE.pdf"
echo
echo "  The 6-digit code is shown on the login page"
echo "  itself - no email is sent in development."
echo
echo "  Press Ctrl+C in this window to stop."
echo "==================================================="
echo
npm run dev
read -r -p "Press Enter to close... " _
