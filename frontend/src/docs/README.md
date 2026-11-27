# Staff documentation

How-to guides shown to signed-in staff at `/docs` (menu: Workspace → Help → Documentation).

One folder per app, one markdown file per guide:

```
src/docs/
  mis/           Amashuri
  task-mentor/   Task Mentor
  tendo/         Tendo
  tupo/          Tupo
  tmcode/        TMCode
  desktop/       Amashuri Desktop
```

## Adding or changing a guide

Add or edit a file in the app's folder. It is picked up at build time; nothing else needs wiring.

- **File name:** `NN-kebab-case-name.md`. `NN` sets the order in the folder. `01-overview.md` comes first. The name without `NN-` is the address: `tendo/02-take-a-register.md` → `/docs/tendo/take-a-register`.
- **Start of the file:**

  ```
  ---
  title: Take a class register
  summary: One sentence saying what this guide helps you do.
  ---
  ```

- **Body:** `##` and `###` headings (the title comes from the frontmatter, so no `#`), paragraphs, `-` lists, `1.` numbered steps, `**bold**` for labels on screen, `` `code` `` for things typed exactly, `[links](https://...)`, pipe tables, and callouts written as `> **Note:**`, `> **Tip:**` or `> **Important:**`. No HTML and no images: they are not rendered.

## Adding a folder

Create the folder and add the app to `MODULES` in `index.ts` (name, one-line description, icon).

## Writing rules

- Write for teachers and school staff. Short sentences, one step per line, the exact labels people see on screen.
- Only describe what is live. Check the label and the page in the app before writing a step.
- Say "Amashuri". Use generic examples; never a real person's name, e-mail, phone number or marks.
- `src/docs/__tests__/docs.test.ts` checks every file against these rules.
