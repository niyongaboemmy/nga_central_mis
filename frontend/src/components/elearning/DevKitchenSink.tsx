import React, { useState } from "react";
import { copy } from "./copy";
import Mascot, { MascotPose } from "./ui/Mascot";
import { BottomActionBar, Celebration, CompletionDot, EmptyState, ItemTypeIcon, ProgressBar, ProgressRing, SubjectCover, WeekPill } from "./ui/primitives";
import KnowledgeCheckCard from "./learner/KnowledgeCheckCard";

/** `/dev/elearning-ui` — visual review of the design system in light/dark (UX plan Phase 0). DEV only. */
const DevKitchenSink: React.FC = () => {
  const [celebrate, setCelebrate] = useState(false);
  const poses: MascotPose[] = ["hello", "thinking", "cheering", "sleepy", "nudge", "book"];
  return (
    <div className="pb-32 space-y-8">
      <h1 className="text-display text-gray-900 dark:text-white">E-learning UI kitchen sink</h1>
      <section>
        <h2 className="text-base font-semibold mb-3">Mascot</h2>
        <div className="flex flex-wrap gap-6">{poses.map((p) => <Mascot key={p} pose={p} size={64} says={p} />)}</div>
      </section>
      <section className="flex flex-wrap items-center gap-6">
        <ProgressRing value={33} /> <ProgressRing value={100} color="#22c55e" size={72} /> <ProgressBar value={60} className="w-48" />
        <CompletionDot state="NOT_STARTED" /> <CompletionDot state="IN_PROGRESS" /> <CompletionDot state="COMPLETED" /> <CompletionDot state="NOT_STARTED" locked />
        <WeekPill weekNumber="Week 4" startDate="2026-09-21" endDate="2026-09-25" current /> <WeekPill weekNumber="Week 5" startDate="2026-09-28" endDate="2026-10-02" />
      </section>
      <section className="flex flex-wrap gap-3">
        {(["HEADER", "LESSON_NOTE", "SUBJECT_DOCUMENT", "PAGE", "VIDEO", "LINK", "KNOWLEDGE_CHECK", "TASKMENTOR_QUIZ"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1 text-xs"><ItemTypeIcon type={t} /> {copy.builder.itemTypes[t]}</span>
        ))}
      </section>
      <section className="grid md:grid-cols-2 gap-4">
        <SubjectCover name="Web UI Development" code="WEBUI" color="#3b6cff" size="lg" className="border shadow-soft"><p className="text-sm">Cover, large</p></SubjectCover>
        <SubjectCover name="Mathematics" code="MATH" color="#22c55e" className="border"><p className="text-sm">Cover, medium</p></SubjectCover>
      </section>
      <section className="max-w-md">
        <KnowledgeCheckCard itemId={0} questions={[{ id: "q1", type: "MCQ", prompt: "Which property sets inner space?", options: ["margin", "padding", "gap"] }]} />
      </section>
      <EmptyState pose="sleepy" title={copy.home.emptyTitle} body={copy.home.emptyBody} action={{ label: "Celebrate", onClick: () => setCelebrate(true) }} />
      <Celebration show={celebrate} onDone={() => setCelebrate(false)} />
      <BottomActionBar><span className="px-4 text-sm">Bottom action bar</span></BottomActionBar>
    </div>
  );
};

export default DevKitchenSink;
