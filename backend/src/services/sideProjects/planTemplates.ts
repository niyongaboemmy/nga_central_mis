/**
 * Implementation-plan templates (the plan "automation"): phases follow the project's stages and
 * each phase lists typical features. Generating a plan dates every phase from the stage plan
 * and spreads the features over it. Teams edit everything afterwards.
 */
export interface PlanTemplate {
  key: string;
  label: string;
  /** category slugs this template suits (first match is suggested) */
  categories: string[];
  phases: Array<{ title: string; stage: "IDEA" | "PLANNING" | "IN_PROGRESS" | "TESTING"; features: string[] }>;
}

const discovery = (extra: string[] = []) => ({
  title: "Discovery",
  stage: "IDEA" as const,
  features: ["Interview the people with the problem", "Write the problem statement and goals", ...extra],
});

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    key: "web",
    label: "Web application",
    categories: ["web"],
    phases: [
      discovery(["Study similar existing solutions"]),
      { title: "Requirements & design", stage: "PLANNING", features: ["User stories and requirements (SRS)", "Wireframes of the main screens", "Database schema", "API design"] },
      { title: "Build", stage: "IN_PROGRESS", features: ["Project setup and repository", "Sign-in and accounts", "Core features", "Admin or settings pages", "Responsive layout"] },
      { title: "Test & launch", stage: "TESTING", features: ["Automated tests", "Testing with real users", "Fix the issues found", "Deploy and write the user guide"] },
    ],
  },
  {
    key: "mobile",
    label: "Mobile app",
    categories: ["mobile"],
    phases: [
      discovery(),
      { title: "Requirements & design", stage: "PLANNING", features: ["User stories and requirements (SRS)", "App screens and navigation flow", "Data storage and offline plan"] },
      { title: "Build", stage: "IN_PROGRESS", features: ["App setup and navigation", "Core screens", "Data sync or storage", "Notifications"] },
      { title: "Test & launch", stage: "TESTING", features: ["Test on real phones", "Pilot with users", "Fix the issues found", "Publish or share the APK"] },
    ],
  },
  {
    key: "iot",
    label: "IoT / hardware",
    categories: ["iot", "robotics"],
    phases: [
      discovery(["List the components and their cost"]),
      { title: "Design", stage: "PLANNING", features: ["Circuit diagram", "Bill of materials", "Firmware design"] },
      { title: "Prototype", stage: "IN_PROGRESS", features: ["Assemble the circuit", "Sensors and readings", "Firmware and control logic", "Dashboard or data logging"] },
      { title: "Test & demo", stage: "TESTING", features: ["Field test", "Calibrate and fix", "Enclosure and final build", "Demo and documentation"] },
    ],
  },
  {
    key: "ai",
    label: "AI / data project",
    categories: ["ai", "data"],
    phases: [
      discovery(["Define the success measure"]),
      { title: "Data & design", stage: "PLANNING", features: ["Collect the data", "Clean and explore the data", "Choose the approach"] },
      { title: "Build", stage: "IN_PROGRESS", features: ["Baseline model or analysis", "Improve the model", "Interface or dashboard"] },
      { title: "Evaluate & share", stage: "TESTING", features: ["Evaluate on unseen data", "Review with users", "Report and presentation"] },
    ],
  },
  {
    key: "game",
    label: "Game",
    categories: ["game"],
    phases: [
      discovery(["Pick the learning goal or audience"]),
      { title: "Game design", stage: "PLANNING", features: ["Game concept and rules", "Level design", "Art and sound list"] },
      { title: "Build", stage: "IN_PROGRESS", features: ["Core game loop", "Levels", "Menus and scoring", "Art and sound"] },
      { title: "Playtest & release", stage: "TESTING", features: ["Playtest with players", "Balance and fix bugs", "Publish the game"] },
    ],
  },
  {
    key: "generic",
    label: "General project",
    categories: [],
    phases: [
      discovery(),
      { title: "Planning", stage: "PLANNING", features: ["Requirements", "Design", "Work plan and roles"] },
      { title: "Execution", stage: "IN_PROGRESS", features: ["First version", "Improvements", "Documentation"] },
      { title: "Review", stage: "TESTING", features: ["Testing or review with users", "Final fixes", "Presentation"] },
    ],
  },
];

export const templateFor = (categorySlug: string | null | undefined) =>
  PLAN_TEMPLATES.find((t) => categorySlug && t.categories.includes(categorySlug)) ?? PLAN_TEMPLATES[PLAN_TEMPLATES.length - 1];
