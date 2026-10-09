import UserAvatar from "../ui/UserAvatar";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Send, Target, Users } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import { familiesApi, type ChildSummary, type FamilyPrefs } from "../../api/families";
import { Card, CardTitle, EmptyState, Muted, Spinner } from "../officeHours/ohUi";
import { useToast } from "../../contexts/ToastContext";
import Modal from "../ui/Modal";
import { SubjectCompetences } from "../competency/MyCompetences";
import type { MyCompetences } from "../../api/competency";

/**
 * For parents and guardians: each child's last two weeks in plain words
 * (lessons, punctuality, discipline notes, work and marks), and how the
 * weekly summary reaches them (app, Telegram, email; never SMS).
 */
const MyChildren: React.FC = () => {
  const [data, setData] = useState<{ children: ChildSummary[]; preferences: FamilyPrefs; telegramLinked: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skillsOf, setSkillsOf] = useState<ChildSummary | null>(null);
  const { showToast } = useToast();
  useEffect(() => {
    familiesApi.me().then((r) => setData(r.data.data), (e) => setError(apiError(e, "Couldn't load your children.")));
  }, []);

  const save = async (p: Partial<FamilyPrefs>) => {
    if (!data) return;
    try {
      const next = (await familiesApi.savePrefs(p)).data.data;
      setData({ ...data, preferences: next });
      showToast("Saved.", "success");
    } catch (e) {
      showToast(apiError(e, "Couldn't save."), "error");
    }
  };

  if (error) return <div className="p-6"><EmptyState title="My children" body={error} /></div>;
  if (!data) return <div className="p-6"><Spinner label="Loading" /></div>;
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> My children
        </h1>
        <Muted className="mt-1">How things are going at school, updated every day from lesson registers and schoolwork.</Muted>
      </header>

      {data.children.length === 0 ? (
        <Card><Muted>No children are linked to your account yet. Contact the school office.</Muted></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="fam-children">
          {data.children.map((c) => (
            <Card key={c.studentId} labelledBy={`child-${c.studentId}`}>
              <CardTitle id={`child-${c.studentId}`}>
                <UserAvatar decorative userId={c.studentId} name={c.name} size={40} className="mr-3 align-middle" />
                {c.name}
                {c.className && <span className="ml-2 text-sm font-normal text-slate-600 dark:text-gray-300">{c.className}</span>}
              </CardTitle>
              {c.attention && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">Worth a conversation this week</p>
              )}
              {c.attendance || c.conduct || c.schoolwork || c.skills ? (
                <dl className="space-y-2 text-sm">
                  {c.attendance && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">Lessons</dt><dd className="text-slate-900 dark:text-white">{c.attendance}</dd></div>}
                  {c.conduct && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">Behaviour</dt><dd className="text-slate-900 dark:text-white">{c.conduct}</dd></div>}
                  {c.schoolwork && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">Schoolwork</dt><dd className="text-slate-900 dark:text-white">{c.schoolwork}</dd></div>}
                  {c.skills && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">Skills</dt><dd className="text-slate-900 dark:text-white">{c.skills}</dd></div>}
                </dl>
              ) : (
                <Muted>No information from the school yet.</Muted>
              )}
              {c.asOf && <Muted className="mt-3 !text-xs">Updated {c.asOf}</Muted>}
              <button type="button" onClick={() => setSkillsOf(c)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
                <Target className="h-4 w-4" aria-hidden /> See {c.firstName}'s skills
              </button>
            </Card>
          ))}
        </div>
      )}

      {skillsOf && <ChildSkills child={skillsOf} onClose={() => setSkillsOf(null)} />}

      <Card labelledBy="fam-summary">
        <CardTitle id="fam-summary" icon={<Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />}>Weekly summary</CardTitle>
        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-800 dark:text-gray-100">Send me a summary every Friday afternoon</span>
            <input type="checkbox" className="h-4 w-4" checked={data.preferences.weeklyDigest} onChange={(e) => void save({ weeklyDigest: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-800 dark:text-gray-100">Also by email</span>
            <input type="checkbox" className="h-4 w-4" checked={data.preferences.digestEmail} disabled={!data.preferences.weeklyDigest} onChange={(e) => void save({ digestEmail: e.target.checked })} />
          </label>
          <p className="text-slate-700 dark:text-gray-200">
            {data.telegramLinked ? "It also comes to you on Telegram." : <>Want it on Telegram? <Link to="/reminders" className="font-semibold text-blue-700 underline dark:text-blue-300">Connect Telegram</Link> (free).</>}
          </p>
        </div>
      </Card>

      <Card labelledBy="fam-tutor">
        <CardTitle id="fam-tutor" icon={<Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" />}>AI Tutor</CardTitle>
        <Muted>Choose whether your children may use the school's AI study coach. <Link to="/family/ai-tutor" className="font-semibold text-blue-700 underline dark:text-blue-300">Open</Link></Muted>
      </Card>
    </div>
  );
};

/** One child's learning-outcome progress, in the same plain words students see. */
const ChildSkills: React.FC<{ child: ChildSummary; onClose: () => void }> = ({ child, onClose }) => {
  const [data, setData] = useState<MyCompetences | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    familiesApi.competences(child.studentId).then((r) => setData(r.data.data), (e) => setError(apiError(e, "Couldn't load the skills.")));
  }, [child.studentId]);
  return (
    <Modal isOpen onClose={onClose} title={`${child.firstName}'s skills`} size="2xl">
      <div className="space-y-3" data-testid="fam-skills">
        <Muted>
          The skills in each subject's learning outcomes. "Shown" means {child.firstName} scored {data?.competent_pct ?? 70}% or more on work that checks it; "Practising" means it was checked and needs more work.
        </Muted>
        {error ? <Muted>{error}</Muted> : !data ? <Spinner /> : !data.subjects.length ? (
          <Muted>Nothing to show yet: {child.firstName}'s subjects don't have learning outcomes in the system yet.</Muted>
        ) : (
          data.subjects.map((s, i) => <SubjectCompetences key={s.subject_id} subject={s} open={i === 0} />)
        )}
      </div>
    </Modal>
  );
};

export default MyChildren;
