# Access Studio / Insights UI checks

Local-only checks, run against the MIS API on :5001 and the frontend dev server on :5173 (real dev DB users).

    cd backend/scripts/access-ux && npm i axe-core@4   # once (kept out of the app's dependencies)
    node ux-audit.cjs /tmp/ux     # axe WCAG 2.1 AA + overflow + clipping + keyboard, 2 themes × 3 viewports, screenshots
    node ui-flows.cjs /tmp/flows  # real workflows: departments, assign/end a position, role editor, explorer, insights

Both exit non-zero on any finding / failure. ui-flows cleans up what it creates.
