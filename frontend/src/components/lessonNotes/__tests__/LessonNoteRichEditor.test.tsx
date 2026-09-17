import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../../contexts/ToastContext";
import LessonNoteRichEditor from "../LessonNoteRichEditor";

vi.mock("../../../api/lessonNotes", () => ({
  lessonNotesApi: {
    listPromptPresets: () => Promise.resolve({ data: { data: [] } }),
  },
}));

// BubbleMenu (tippy.js under the hood) needs browser layout APIs jsdom doesn't implement
// (elementFromPoint, popper positioning) and isn't what these tests exercise — stub it out.
vi.mock("@tiptap/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tiptap/react")>();
  return { ...actual, BubbleMenu: () => null };
});

const renderEditor = (onUploadImage = vi.fn().mockResolvedValue("data:image/png;base64,AAA")) => {
  const onChange = vi.fn();
  render(
    <ToastProvider>
      <LessonNoteRichEditor
        initialContent=""
        editable
        onChange={onChange}
        onUploadImage={onUploadImage}
        onRequestAIEdit={vi.fn()}
        onAIEditAccepted={vi.fn()}
      />
    </ToastProvider>,
  );
  return { onChange, onUploadImage };
};

describe("LessonNoteRichEditor — table, color, and image features", () => {
  beforeEach(() => {
    // Tiptap's Table(resizable) + BubbleMenu rely on layout APIs jsdom doesn't implement.
    if (!("ResizeObserver" in window)) {
      (window as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (!document.elementFromPoint) {
      document.elementFromPoint = () => null;
    }
    // jsdom's Range doesn't implement getClientRects/getBoundingClientRect, which
    // ProseMirror calls on every selection change to scroll the caret into view.
    if (!Range.prototype.getClientRects) {
      (Range.prototype as any).getClientRects = () => [];
    }
    if (!Range.prototype.getBoundingClientRect) {
      (Range.prototype as any).getBoundingClientRect = () => ({
        top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {},
      });
    }
  });

  it("inserts a table and shows the table contextual toolbar", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByTitle("Insert table"));

    const editorRoot = document.querySelector(".ProseMirror") as HTMLElement;
    await waitFor(() => expect(editorRoot.querySelector("table")).toBeTruthy());
    // Contextual table toolbar only renders while the cursor is inside a table.
    await waitFor(() => expect(screen.getByTitle("Delete table")).toBeInTheDocument());
    expect(screen.getByTitle("Add row below")).toBeInTheDocument();
    expect(screen.getByTitle("Merge cells")).toBeInTheDocument();
  });

  it("adds a row and deletes the table via the contextual toolbar", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByTitle("Insert table"));

    const editorRoot = document.querySelector(".ProseMirror") as HTMLElement;
    await waitFor(() => expect(editorRoot.querySelector("table")).toBeTruthy());
    const rowsBefore = editorRoot.querySelectorAll("table tr").length;

    await user.click(screen.getByTitle("Add row below"));
    await waitFor(() =>
      expect(editorRoot.querySelectorAll("table tr").length).toBe(rowsBefore + 1),
    );

    await user.click(screen.getByTitle("Delete table"));
    await waitFor(() => expect(editorRoot.querySelector("table")).toBeNull());
  });

  it("applies cell shading from the table toolbar's color picker", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByTitle("Insert table"));

    const editorRoot = document.querySelector(".ProseMirror") as HTMLElement;
    await waitFor(() => expect(editorRoot.querySelector("table")).toBeTruthy());

    await user.click(screen.getByTitle("Cell shading"));
    const swatch = document.querySelector('button[title="#ef4444"]') as HTMLElement;
    expect(swatch).toBeTruthy();
    await user.click(swatch);

    await waitFor(() => {
      const cell = editorRoot.querySelector("table td, table th") as HTMLElement;
      expect(cell.style.backgroundColor).toBeTruthy();
    });
  });

  it("applies a cell padding preset to the current cell", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByTitle("Insert table"));

    const editorRoot = document.querySelector(".ProseMirror") as HTMLElement;
    await waitFor(() => expect(editorRoot.querySelector("table")).toBeTruthy());

    await user.click(screen.getByTitle("Compact cell padding"));
    await waitFor(() => {
      const cell = editorRoot.querySelector("table td, table th") as HTMLElement;
      expect(cell.style.padding).toBe("0.15rem 0.4rem");
    });
  });

  it("applies a text color via the color picker", async () => {
    const user = userEvent.setup();
    renderEditor();

    const editorRoot = document.querySelector(".ProseMirror") as HTMLElement;
    editorRoot.focus();
    await user.type(editorRoot, "hello");
    // select all so the mark applies to the typed text
    await user.keyboard("{Control>}a{/Control}");

    await user.click(screen.getByTitle("Text color"));
    const swatch = document.querySelector('button[title="#3b82f6"]') as HTMLElement;
    await user.click(swatch);

    await waitFor(() => expect(editorRoot.querySelector('span[style*="color"]')).toBeTruthy());
  });

  it("inserts an image via the toolbar file picker without a network upload", async () => {
    const user = userEvent.setup();
    const onUploadImage = vi.fn().mockResolvedValue("data:image/png;base64,AAA");
    renderEditor(onUploadImage);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-bytes"], "photo.png", { type: "image/png" });
    await user.upload(fileInput, file);

    expect(onUploadImage).toHaveBeenCalledWith(file);
    const editorRoot = document.querySelector(".ProseMirror") as HTMLElement;
    await waitFor(() =>
      expect(editorRoot.querySelector('img[src^="data:image/png"]')).toBeTruthy(),
    );
  });

  it("shows crop/replace/delete once an inserted image is selected", async () => {
    const user = userEvent.setup();
    const onUploadImage = vi.fn().mockResolvedValue("data:image/png;base64,AAA");
    renderEditor(onUploadImage);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-bytes"], "photo.png", { type: "image/png" });
    await user.upload(fileInput, file);

    const editorRoot = document.querySelector(".ProseMirror") as HTMLElement;
    await waitFor(() => expect(editorRoot.querySelector("img")).toBeTruthy());
    // Inserting an image leaves it as the active NodeSelection, same as clicking it.
    await waitFor(() => expect(screen.getByTitle("Delete image")).toBeInTheDocument());
    expect(screen.getByTitle("Crop image")).toBeInTheDocument();

    await user.click(screen.getByTitle("Delete image"));
    await waitFor(() => expect(editorRoot.querySelector("img")).toBeNull());
  });

  it("opens the math formula modal with the visual builder categories", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByTitle("Insert formula"));
    expect(await screen.findByText("Formula Builder")).toBeInTheDocument();
    expect(screen.getByText("Algebra")).toBeInTheDocument();
    expect(screen.getByText("Greek")).toBeInTheDocument();
    // Nothing entered yet, so Insert stays disabled. (Two elements match this accessible
    // name: the toolbar's icon button — named via its title attribute — and the modal's
    // own footer button; only the latter has visible text.)
    const insertButtons = screen.getAllByRole("button", { name: /insert formula/i });
    const modalInsertButton = insertButtons.find((b) => b.textContent?.trim() === "Insert formula");
    expect(modalInsertButton).toBeDisabled();
  });
});
