import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getGlossaryTerms, getGlossaryFuzzy, refreshGlossary } from "../glossaryStore.js";
import { fuzzyLabel, normalizeFuzzy, toJamo } from "../fuzzyTerms.js";
import { SHORT_SOUNDS, MIN_FUZZY_SOUNDS, autoSegment, bestMatch, buildEntries } from "../spacing.js";

// "5. 서류 작성" 탭 안의 하위 화면 '음성 보정 관제'.
// 띄어쓰기 없이 붙어서 들어온 현장 말을 (Step 1) 용어 DB 단어 기준으로 먼저 끊고, (Step 2) 끊은 낱말마다 용어 DB의 현장 은어와 소리(자모) 레벤슈타인 거리를 견주어
// 표준 용어로 바꾸는 과정을 한 단계씩 보여 주는 관제 화면이다. 쓰는 용어 표와 '비슷한 용어 찾기' 단계는 "현장용어/은어 DB"에 저장된 것과 같다(여기서 고치지는 않는다).
// 이 화면은 계산 과정을 보여 주기만 하고 아무것도 저장하지 않는다. 끊기·견주기 계산은 src/spacing.js에 있고, 음성 보고의 실제 처리(VoiceInspection)도 같은 계산을 쓴다.

// 용어 DB의 단어로 눌러 볼 수 있는 예시 문장(붙여 쓴 글)을 만든다. 소리가 비슷한 글자로 바꾼 "잘못 들은" 예시도 하나 넣는다.
const MISHEAR = { 시: "씨", 사: "싸", 가: "카", 다: "타", 바: "파", 지: "치", 게: "개", 기: "키" };
function buildSamples(entries) {
  if (entries.length === 0) return [];
  const pick = (i) => entries[i % entries.length];
  const mishear = (key) => {
    for (let i = 0; i < key.length; i += 1) {
      if (MISHEAR[key[i]]) return key.slice(0, i) + MISHEAR[key[i]] + key.slice(i + 1);
    }
    return key;
  };
  const samples = [
    { label: "#1 용어 두 개 붙여쓰기", text: `${pick(0).key}밑에${pick(1).key}확인해` },
    { label: "#2 완료 보고", text: `${pick(2).key}잡고${pick(3).key}했고완료` },
  ];
  // 소리가 비슷한 글자로 바꿀 수 있는 글자가 있고, 소리가 5개를 넘는(= 비슷한 용어 찾기 대상인) 용어를 골라 잘못 들은 말을 만든다.
  const target = entries.find((e) => e.jamo.length > SHORT_SOUNDS && mishear(e.key) !== e.key);
  if (target) samples.push({ label: "#3 비슷하게 잘못 들은 말", text: `${mishear(target.key)}위에${pick(1).key}받쳐라` });
  return samples;
}

export default function VoiceLockMonitor({ notify }) {
  const [terms, setTerms] = useState(() => getGlossaryTerms());
  const [level, setLevel] = useState(() => getGlossaryFuzzy());
  const [input, setInput] = useState("");
  const [run, setRun] = useState(null); // 실행한 글과 그 결과
  const [query, setQuery] = useState("");

  // 화면이 열릴 때 용어 표를 최신으로 읽어 온다(읽지 못하면 지금 들고 있는 표를 그대로 쓴다).
  useEffect(() => {
    let alive = true;
    refreshGlossary().then(() => {
      if (!alive) return;
      setTerms(getGlossaryTerms());
      setLevel(getGlossaryFuzzy());
    });
    return () => {
      alive = false;
    };
  }, []);

  const entries = useMemo(() => buildEntries(terms), [terms]); // 표에 보여 주고 견주는 현장 은어
  const segEntries = useMemo(() => buildEntries(terms, true), [terms]); // 끊을 때는 표준 용어를 직접 말한 것도 한 낱말로 본다(실제 처리와 같다)
  const samples = useMemo(() => buildSamples(entries), [entries]);
  const lv = normalizeFuzzy(level);

  const execute = useCallback(
    (text) => {
      const raw = String(text == null ? input : text).trim();
      if (!raw) {
        if (notify) notify("분석할 말을 입력해 주세요.");
        return;
      }
      const spaced = autoSegment(raw, segEntries, lv);
      const rows = spaced.map((token) => {
        const m = bestMatch(token, entries, lv);
        return { token, jamo: toJamo(token), match: m };
      });
      const final = rows.map((r) => (r.match ? `[${r.match.entry.standard}]` : r.token)).join(" ");
      setRun({ raw, spaced: spaced.join(" "), rows, final });
    },
    [entries, segEntries, input, lv, notify]
  );

  // 처음 열릴 때(용어 표가 준비되면) 첫 예시로 한 번 실행해 보여 준다.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (started || samples.length === 0) return;
    setStarted(true);
    setInput(samples[0].text);
    execute(samples[0].text);
  }, [started, samples, execute]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return entries.filter((e) => !q || `${e.slang} ${e.standard}`.toLowerCase().includes(q));
  }, [entries, query]);

  const loadSample = (text) => {
    setInput(text);
    execute(text);
  };

  return (
    <div className="space-y-5" data-testid="voicelock-monitor">
      <div className="card bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
        <h3 className="text-base font-black text-blue-900">🚀 전처리(자동 띄어쓰기) & 음운 레벤슈타인 관제</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          띄어쓰기 없이 붙어서 들어온 현장 말을 먼저 자동으로 끊고(Step 1), 용어 DB의 현장 은어와 소리(자모)를 견주어 표준 용어로 바꿉니다(Step 2).
          용어 표 {terms.length}개 · 비슷한 용어 찾기 {fuzzyLabel(lv)} 기준이며, 현장용어/은어 DB에 저장된 값을 그대로 씁니다.
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") execute();
            }}
            placeholder="띄어쓰기 없는 문장도 그대로 입력해 보세요"
            className="flex-1 min-w-0 px-4 py-3 border-2 border-slate-300 rounded-lg text-sm outline-none focus:border-blue-600"
            data-testid="voicelock-input"
          />
          <button
            type="button"
            onClick={() => execute()}
            className="px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold whitespace-nowrap"
            data-testid="voicelock-run"
          >
            실시간 파이프라인 실행
          </button>
        </div>

        {samples.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-xs font-bold text-slate-500">내 용어 DB로 만든 붙여쓴 예시:</span>
            {samples.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => loadSample(s.text)}
                className="px-2.5 py-1 rounded-md bg-slate-200 hover:bg-slate-300 text-xs font-semibold text-slate-700"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {entries.length === 0 && (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
            견줄 용어가 없습니다. “현장용어/은어 DB”에 한글 은어를 먼저 등록해 주세요.
          </p>
        )}

        {run && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <div className="text-[11px] font-extrabold text-blue-600 mb-1">STEP 0 · 원본 수신</div>
                <div className="text-sm font-bold text-slate-900 break-all" data-testid="voicelock-step0">{run.raw}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <div className="text-[11px] font-extrabold text-blue-600 mb-1">STEP 1 · 자동 띄어쓰기 복원</div>
                <div className="text-sm font-bold text-slate-900 break-all" data-testid="voicelock-step1">{run.spaced}</div>
              </div>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg px-4 py-3">
              <div className="text-xs text-slate-600">STEP 2 · 표준 용어 변환 결과 (바뀐 말은 [ ]로 표시)</div>
              <div className="text-base font-extrabold text-blue-800 mt-1 break-words" data-testid="voicelock-final">{run.final}</div>
            </div>
          </>
        )}
      </div>

      {run && (
        <div className="card bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
          <h3 className="text-base font-black text-slate-800 mb-3">토큰별 음운 레벤슈타인 분석 표</h3>
          <div className="overflow-auto max-h-64 border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 sticky top-0">
                  {["분절 단어", "입력 음운(자소)", "매칭 현장 은어", "은어 음운", "음운 오류 수", "음운 유사도", "표준 용어 변환 결과"].map((h) => (
                    <th key={h} className="px-3 py-2 font-bold whitespace-nowrap border-b-2 border-slate-200">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {run.rows.map((r, i) => {
                  const m = r.match;
                  const dist = m ? m.dist : 0;
                  const distClass = dist === 0 ? "bg-green-100 text-green-700" : dist <= 1 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
                  const dash = <span className="text-slate-400">-</span>;
                  return (
                    <tr key={`${r.token}-${i}`} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold">{r.token}</td>
                      <td className="px-3 py-2"><span className="font-mono text-[11px] bg-slate-100 rounded px-1.5 py-0.5 text-slate-600">{r.jamo.join(" ")}</span></td>
                      <td className="px-3 py-2">{m ? <strong>{m.entry.slang}</strong> : dash}</td>
                      <td className="px-3 py-2">{m ? <span className="font-mono text-[11px] bg-slate-100 rounded px-1.5 py-0.5 text-slate-600">{m.entry.jamo.join(" ")}</span> : dash}</td>
                      <td className="px-3 py-2">{m ? <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${distClass}`}>{Number.isInteger(dist) ? dist : dist.toFixed(1)}개 불일치</span> : dash}</td>
                      <td className="px-3 py-2">{m ? <span className="font-extrabold text-blue-600">{(m.sim * 100).toFixed(1)}%</span> : <span className="text-slate-400">0%</span>}</td>
                      <td className="px-3 py-2">{m ? <span className="font-extrabold text-green-700 bg-green-100 rounded px-1.5 py-0.5">✅ {m.entry.standard}</span> : <span className="text-slate-400">(유지)</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-black text-slate-800">📖 현장용어/은어 DB 용어 ({entries.length}개)</h3>
          <span className="text-[11px] text-slate-500">* 용어를 클릭하면 위 입력창에 자동 입력됩니다</span>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="용어 안에서 검색..."
          className="w-full sm:w-56 mb-3 px-3 py-2 border border-slate-300 rounded-md text-xs outline-none focus:border-blue-600"
        />
        <div className="overflow-auto max-h-96 border border-slate-200 rounded-lg">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 sticky top-0">
                {["No", "현장 은어/사투리", "분해 음운(자소 구조)", "표준 용어", "판정 기준"].map((h) => (
                  <th key={h} className="px-3 py-2 font-bold whitespace-nowrap border-b-2 border-slate-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => {
                    loadSample(e.key);
                    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <td className="px-3 py-2 text-slate-400">{e.no}</td>
                  <td className="px-3 py-2 font-bold text-blue-900">{e.slang}</td>
                  <td className="px-3 py-2"><span className="font-mono text-[11px] bg-slate-100 rounded px-1.5 py-0.5 text-slate-600">{e.jamo.join(" ")}</span></td>
                  <td className="px-3 py-2 font-bold">{e.standard}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {lv === "off" || e.jamo.length < MIN_FUZZY_SOUNDS
                      ? "정확히 같을 때만"
                      : e.jamo.length <= SHORT_SOUNDS
                        ? "비슷한 소리 바꿈만"
                        : fuzzyLabel(lv)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    맞는 용어가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
