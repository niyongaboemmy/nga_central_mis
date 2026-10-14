import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  upload: vi.fn(),
  findByName: vi.fn(),
  replaceContent: vi.fn(),
  getTree: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../../api/documents", () => ({
  documentApi: { upload: api.upload, findByName: api.findByName, replaceContent: api.replaceContent },
  folderApi: { getTree: api.getTree, create: api.create },
}));

import SaveToDocumentsDialog from "../SaveToDocumentsDialog";
import DownloadMenu from "../DownloadMenu";
import { cleanFileName, exportForDownload, mimeFor, numberedName, projectZipName, withExtension } from "../saveCode";

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });
const doc = (over: Record<string, unknown> = {}) => ({
  document_id: 7,
  original_name: "main.py",
  folder_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  ...over,
});
const TREE = [
  { folder_id: 1, name: "Code", color: "#3b82f6", parent_folder_id: null, children: [{ folder_id: 2, name: "Python", color: "#10b981", parent_folder_id: 1, children: [] }] },
  { folder_id: 3, name: "Notes", color: "#f59e0b", parent_folder_id: null, children: [] },
];
const fieldsOf = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, v instanceof File ? `file:${v.name}:${v.type}` : v]));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("academic_period_year_id", "5");
  for (const f of Object.values(api)) f.mockReset();
  api.getTree.mockImplementation(() => ok(TREE));
  api.findByName.mockImplementation(() => ok(null));
  api.upload.mockImplementation((form: FormData) => ok(doc({ original_name: (form.get("file") as File).name })));
  api.replaceContent.mockImplementation(() => ok({ ...doc(), previous_version: 1 }));
});
afterEach(cleanup);

const PY = [{ path: "main.py", content: 'print("hi")\n' }];
const WEB = [
  { path: "index.html", content: "<h1>Hi</h1>" },
  { path: "style.css", content: "h1{}" },
  { path: "script.js", content: "1" },
];
const open = (files = PY, active = files[0].path, onSaved = vi.fn(), onClose = vi.fn()) => {
  render(<SaveToDocumentsDialog files={files} activePath={active} zipName="garage.zip" languageLabel="Python" languageId="python" onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
};
/** Lets the 300 ms "is the name taken here?" check run. */
const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
};

describe("saveCode helpers", () => {
  it("names, extensions and types", () => {
    expect(withExtension("homework", "py")).toBe("homework.py");
    expect(withExtension("homework.py", "py")).toBe("homework.py");
    expect(withExtension("a/b:c.py", "py")).toBe("a-b-c.py");
    expect(cleanFileName("  ..hidden  ")).toBe("hidden");
    expect(numberedName("main.py", 2)).toBe("main (2).py");
    expect(numberedName("main (2).py", 3)).toBe("main (3).py");
    expect(numberedName("Makefile", 2)).toBe("Makefile (2)");
    expect(projectZipName("Kigali Garage!", "playground")).toBe("kigali-garage.zip");
    expect(projectZipName("", "playground")).toBe("playground.zip");
    expect(mimeFor("index.html")).toBe("text/html");
    expect(mimeFor("main.py")).toBe("text/plain");
    expect(mimeFor("q.sql")).toBe("application/sql");
  });
  it("downloads one file as it is, several as a .zip", async () => {
    const one = await exportForDownload(PY, "x.zip");
    expect(one.name).toBe("main.py");
    expect(await one.blob.text()).toBe('print("hi")\n');
    const many = await exportForDownload(WEB, "site.zip");
    expect(many.name).toBe("site.zip");
    expect(many.blob.type).toBe("application/zip");
    expect(many.blob.size).toBeGreaterThan(50);
  });
});

describe("DownloadMenu", () => {
  it("offers Download and Save to Documents, and closes on Esc", () => {
    const onDownload = vi.fn();
    const onSave = vi.fn();
    render(<DownloadMenu downloadLabel="main.py" onDownload={onDownload} onSaveToDocuments={onSave} />);
    fireEvent.click(screen.getByTestId("playground-download"));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual([expect.stringMatching(/^Download.*main\.py to this device/), expect.stringMatching(/^Save to Documents/)]);
    expect(document.activeElement).toBe(screen.getByTestId("playground-download-file"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("playground-save-docs"));
    fireEvent.click(screen.getByTestId("playground-save-docs"));
    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByTestId("playground-download"));
    fireEvent.click(screen.getByTestId("playground-download-file"));
    expect(onDownload).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("playground-download"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("SaveToDocumentsDialog", () => {
  it("writes the note without an ampersand (the server escapes it)", () => {
    render(<SaveToDocumentsDialog files={PY} activePath="main.py" zipName="x.zip" languageLabel="HTML, CSS & JavaScript" languageId="html" onClose={() => undefined} />);
    expect((screen.getByRole("textbox", { name: /Note/ }) as HTMLTextAreaElement).value).toBe("HTML, CSS and JavaScript code saved from the Code Playground");
  });

  it("saves the file to My Documents for the selected year, with a note and tags", async () => {
    const { onSaved } = open();
    expect((screen.getByTestId("save-docs-name") as HTMLInputElement).value).toBe("main.py");
    await settle();
    expect(api.findByName).toHaveBeenLastCalledWith({ name: "main.py", academicYearId: 5 });
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(screen.getByTestId("save-docs-done")).toBeTruthy());
    const form = api.upload.mock.calls[0][0] as FormData;
    expect(fieldsOf(form)).toEqual({
      file: "file:main.py:text/plain",
      academicYearId: "5",
      description: "Python code saved from the Code Playground",
      tags: "code-playground,python",
    });
    expect(await (form.get("file") as File).text()).toBe('print("hi")\n');
    expect(screen.getByTestId("save-docs-done").textContent).toMatch(/Saved to Documents[\s\S]*My Documents › main\.py/);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ original_name: "main.py" }), "new");
    expect(screen.getByRole("link", { name: /Open Documents/ }).getAttribute("target")).toBe("_blank");
  });

  it("keeps the extension and saves into the folder picked (remembered next time)", async () => {
    open();
    await waitFor(() => expect(screen.getAllByTestId("save-docs-folder").length).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: /Open Code/ }));
    fireEvent.click(screen.getByText("Python"));
    fireEvent.change(screen.getByTestId("save-docs-name"), { target: { value: "homework" } });
    expect(screen.getByTestId("save-docs-where").textContent).toBe("My Documents › Code › Python › homework.py");
    await settle();
    expect(api.findByName).toHaveBeenLastCalledWith({ name: "homework.py", folderId: 2 });
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    expect(fieldsOf(api.upload.mock.calls[0][0])).toMatchObject({ file: "file:homework.py:text/plain", folderId: "2" });
    await waitFor(() => expect(localStorage.getItem("codePlayground.saveFolder")).toBe("2"));

    cleanup();
    open();
    // The folder used last time is selected and opened to.
    await waitFor(() => expect(screen.getByTestId("save-docs-where").textContent).toBe("My Documents › Code › Python › main.py"));
  });

  it("updates the copy saved before (keeping its history) unless a new copy is chosen", async () => {
    api.findByName.mockImplementation(({ name }: { name: string }) => ok(name === "main.py" ? doc() : null));
    open();
    await settle();
    expect(screen.getByTestId("save-docs-existing").textContent).toMatch(/main\.py is already here \(saved 2 h ago\)/);
    expect(screen.getByTestId("save-docs-submit").textContent).toBe("Update");
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(screen.getByTestId("save-docs-done")).toBeTruthy());
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.replaceContent.mock.calls[0][0]).toBe(7);
    expect(fieldsOf(api.replaceContent.mock.calls[0][1])).toEqual({ file: "file:main.py:text/plain", changeDescription: "Python code saved from the Code Playground" });
    expect(screen.getByTestId("save-docs-done").textContent).toMatch(/Updated in Documents[\s\S]*kept in the file's history/);
  });

  it("Save pressed before the name check ran: looks first, and asks when the name is taken", async () => {
    api.findByName.mockImplementation(({ name }: { name: string }) => ok(name === "main.py" ? doc() : null));
    open();
    fireEvent.click(screen.getByTestId("save-docs-submit")); // at once, no waiting
    await waitFor(() => expect(screen.getByTestId("save-docs-existing")).toBeTruthy());
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.replaceContent).not.toHaveBeenCalled();
    expect(screen.getByTestId("save-docs-submit").textContent).toBe("Update");
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(screen.getByTestId("save-docs-done")).toBeTruthy());
    expect(api.replaceContent).toHaveBeenCalledTimes(1);
  });

  it("Save pressed at once with a free name saves straight away", async () => {
    open();
    fireEvent.change(screen.getByTestId("save-docs-name"), { target: { value: "fresh" } });
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(screen.getByTestId("save-docs-done")).toBeTruthy());
    expect(fieldsOf(api.upload.mock.calls[0][0]).file).toBe("file:fresh.py:text/plain");
  });

  it("saves a new copy under the next free name", async () => {
    api.findByName.mockImplementation(({ name }: { name: string }) => ok(name === "main.py" || name === "main (2).py" ? doc({ original_name: name }) : null));
    open();
    await settle();
    fireEvent.click(screen.getByTestId("save-docs-copy"));
    expect(screen.getByTestId("save-docs-submit").textContent).toBe("Save");
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    expect(fieldsOf(api.upload.mock.calls[0][0]).file).toBe("file:main (3).py:text/plain");
    expect(api.replaceContent).not.toHaveBeenCalled();
  });

  it("saves a project as one .zip, or just the open file", async () => {
    open(WEB, "style.css");
    expect((screen.getByTestId("save-docs-name") as HTMLInputElement).value).toBe("garage.zip");
    fireEvent.click(screen.getByTestId("save-docs-file"));
    expect((screen.getByTestId("save-docs-name") as HTMLInputElement).value).toBe("style.css");
    fireEvent.click(screen.getByTestId("save-docs-project"));
    await settle();
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    const file = api.upload.mock.calls[0][0].get("file") as File;
    expect([file.name, file.type]).toEqual(["garage.zip", "application/zip"]);
    expect(file.size).toBeGreaterThan(50);
  });

  it("creates a folder inside the one selected and saves there", async () => {
    api.create.mockImplementation(() => ok({ folder_id: 9, name: "Week 3" }));
    open();
    await waitFor(() => expect(screen.getAllByTestId("save-docs-folder").length).toBe(2));
    fireEvent.click(screen.getByText("Notes"));
    fireEvent.click(screen.getByTestId("save-docs-new-folder"));
    api.getTree.mockImplementation(() => ok([...TREE.slice(0, 1), { ...TREE[1], children: [{ folder_id: 9, name: "Week 3", color: "", parent_folder_id: 3, children: [] }] }]));
    fireEvent.change(screen.getByTestId("save-docs-folder-name"), { target: { value: "Week 3" } });
    fireEvent.keyDown(screen.getByTestId("save-docs-folder-name"), { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("save-docs-where").textContent).toBe("My Documents › Notes › Week 3 › main.py"));
    expect(api.create).toHaveBeenCalledWith({ name: "Week 3", parentFolderId: 3 });
  });

  it("shows why a save failed and lets the person try again", async () => {
    api.upload.mockImplementationOnce(() => Promise.reject({ response: { data: { message: "File size exceeds maximum limit of 50MB" } } }));
    open();
    await settle();
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(screen.getByTestId("save-docs-error").textContent).toMatch(/50MB/));
    fireEvent.click(screen.getByTestId("save-docs-submit"));
    await waitFor(() => expect(screen.getByTestId("save-docs-done")).toBeTruthy());
  });

  it("still saves to My Documents when the folders can't load, and Esc closes", async () => {
    api.getTree.mockImplementation(() => Promise.reject(new Error("offline")));
    const { onClose } = open();
    await waitFor(() => expect(screen.getByText(/couldn't be loaded/)).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
