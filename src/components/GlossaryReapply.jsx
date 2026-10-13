import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import { formatDateTime } from "../data.js";
import { GLOSSARY_MESSAGES, glossaryHash } from "../voice.js";

// 관리자 "용어 DB" 탭의 "저장된 음성 기록에 다시 적용" 카드.
// 용어 표를 고쳐도 이미 저장된 음성 검측 기록의 '순화한 문장'과 '요약'은 저장할 때의 표대로 남는다.
// 이 카드는 모든 기록의 원문(말한 그대로)에 지금의 표를 다시 적용해 → 몇 건이 어떻게 바뀌는지 먼저 보여 주고 → 확인하면 바뀔 기록만 저장한다.
// 원문은 건드리지 않으므로 표를 또 고친 뒤 다시 눌러도 된다. 관리자 화면은 한국어만 쓰므로 문구를 번역 사전이 아니라 여기에 바로 적었다.
// props: terms(지금 표 - 마지막으로 적용한 표와 같은지는 이 표의 지문으로 견주므로 표를 다시 읽지 않는다), adminName,
//        busy/setBusy(다른 저장과 겹치지 않게 부모와 함께 쓰는 표시), notify

const SAMPLE_COUNT = 5;

function errorText(err) {
  const code = err && err.code ? String(err.code) : "";
  if (code === "glossary/table-changed" && err.message) return err.message;
  if (code === "voice/timeout" || code === "glossary/timeout") return "시간이 오래 걸려 멈췄어요. 연결을 확인하고 다시 시도해 주세요.";
  return "기록을 읽거나 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
}

function Chip({ kind, label, n }) {
  return (
    <span className={`gl-chip gl-chip-${kind}${n === 0 ? " is-zero" : ""}`} data-testid={`gl-reapply-chip-${kind}`}>
      {label} <b>{n}</b>건
    </span>
  );
}

export default function GlossaryReapply({ terms, adminName, busy, setBusy, notify }) {
  const [phase, setPhase] = useState("idle"); // idle | checking | review | applying | done
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null); // planGlossaryReapply 결과
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null); // 적용한 결과 { updated, missing, stopped, total }
  const [info, setInfo] = useState({ state: "loading", applied: null }); // 마지막으로 다시 적용한 기록(meta/glossaryApplied)
  const mounted = useRef(true);
  const stop = useRef(false);
  const planTableHash = useRef(""); // 미리보기를 만들던 때 이 화면의 표 지문(그 뒤에 이 화면에서 표를 고쳤는지 알아보는 용도)

  const tableHash = useMemo(() => glossaryHash(terms), [terms]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      const applied = await api.fetchGlossaryApplied();
      if (mounted.current) setInfo({ state: "ready", applied });
    } catch {
      if (mounted.current) setInfo((prev) => ({ ...prev, state: "error" }));
    }
  }, []);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  // 미리보기를 본 채로 이 화면에서 표를 고쳤다면 보여 준 내용이 더는 맞지 않으므로 닫고 다시 하게 한다.
  // (다른 기기에서 고친 경우는 적용 단계에서 걸러진다 - api.applyGlossaryReapply)
  useEffect(() => {
    if (phase === "review" && planTableHash.current && planTableHash.current !== tableHash) {
      setPlan(null);
      setPhase("idle");
      setError(GLOSSARY_MESSAGES["table-changed"]);
    }
  }, [phase, tableHash]);

  async function check() {
    if (busy || phase === "checking" || phase === "applying") return;
    setError("");
    setResult(null);
    setPhase("checking");
    setBusy("reapply");
    const hashAtStart = tableHash;
    try {
      const next = await api.planGlossaryReapply();
      if (!mounted.current) return;
      planTableHash.current = hashAtStart;
      setPlan(next);
      setPhase("review");
      if (next.changes.length === 0) {
        // 바꿀 기록이 없다는 것도 '이 표를 모든 기록에 확인했다'는 뜻이라 기록해 둔다(안내 문구를 최신으로 맞춘다).
        api
          .recordGlossaryApplied({ tableHash: next.tableHash, total: next.total, changed: 0 }, adminName)
          .then(() => mounted.current && loadInfo())
          .catch(() => {});
      }
    } catch (err) {
      if (!mounted.current) return;
      setError(errorText(err));
      setPhase("idle");
    } finally {
      setBusy("");
    }
  }

  async function apply() {
    if (busy || phase !== "review" || !plan || plan.changes.length === 0) return;
    setError("");
    stop.current = false;
    setProgress({ done: 0, total: plan.changes.length });
    setPhase("applying");
    setBusy("reapply");
    try {
      const res = await api.applyGlossaryReapply(plan, adminName, {
        onProgress: (p) => mounted.current && setProgress(p),
        shouldStop: () => stop.current,
      });
      if (!mounted.current) return;
      setResult(res);
      setPhase("done");
      notify(res.stopped ? `중간에 멈췄어요. ${res.updated}건은 바뀌었습니다.` : `저장된 음성 기록 ${res.updated}건에 새 표를 적용했습니다.`);
      loadInfo();
    } catch (err) {
      if (!mounted.current) return;
      setError(errorText(err));
      // 일부는 이미 바뀌었을 수 있어 미리보기부터 다시 하게 한다.
      setPlan(null);
      setPhase("idle");
    } finally {
      setBusy("");
    }
  }

  function close() {
    setPhase("idle");
    setPlan(null);
    setResult(null);
    setError("");
  }

  const working = phase === "checking" || phase === "applying";
  const samples = plan ? plan.changes.filter((c) => c.normalized !== c.before).slice(0, SAMPLE_COUNT) : [];
  const visibleCount = plan ? plan.changes.filter((c) => c.normalized !== c.before).length : 0;
  const applied = info.state === "ready" ? info.applied : null;
  const stale = !!applied && applied.tableHash !== tableHash;

  return (
    <section className="card card-pad gl-reapply" data-testid="gl-reapply">
      <div className="section-head">
        <div className="section-title">저장된 음성 기록에 다시 적용</div>
        <span className="eyebrow">RE-APPLY</span>
      </div>

      {(phase === "idle" || phase === "checking") && (
        <>
          <p className="gl-reapply-desc">
            용어 표를 고쳐도 <strong>이미 저장된 음성 검측 기록</strong>의 ‘순화한 문장’과 ‘요약’은 예전 표대로 남아 있어요. 모든 기록의 원문(말한 그대로)에 지금 표를 다시 적용해 새로 만들어요. 원문은 그대로 두고, 저장하기 전에 몇 건이 어떻게 바뀌는지 먼저 보여 드려요.
          </p>
          {info.state === "ready" && (
            <div className={`gl-reapply-status${stale ? " is-stale" : ""}`} role="status" data-testid="gl-reapply-status">
              {applied
                ? `마지막 적용: ${formatDateTime(applied.at)}${applied.by ? ` · ${applied.by}` : ""} · ${applied.changed}건 바뀜`
                : "아직 한 번도 다시 적용하지 않았어요."}
              {stale ? <b data-testid="gl-reapply-stale"> — 그 뒤에 표를 고쳤어요. 다시 적용해 주세요.</b> : null}
              {applied && !stale ? <b data-testid="gl-reapply-current"> — 지금 표 그대로예요.</b> : null}
            </div>
          )}
          <div className="gl-reapply-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={check} disabled={!!busy || working} data-testid="gl-reapply-check">
              {phase === "checking" ? "기록 확인하는 중…" : "바뀔 기록 미리보기"}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="gl-error gl-reapply-msg" role="alert" data-testid="gl-reapply-error">
          {error}
        </div>
      )}

      {phase === "review" && plan && (
        <div className="gl-reapply-review" data-testid="gl-reapply-review">
          <div className="gl-chips" data-testid="gl-reapply-chips">
            <Chip kind="total" label="전체 기록" n={plan.total} />
            <Chip kind="changed" label="바뀔 기록" n={plan.changes.length} />
            <Chip kind="same" label="그대로" n={plan.total - plan.changes.length - plan.noText} />
            {plan.noText > 0 && <Chip kind="skip" label="원문 없음" n={plan.noText} />}
          </div>
          <div className="gl-reapply-note" data-testid="gl-reapply-note">
            지금 표의 용어 {plan.termCount}개로 계산했어요{plan.tableSaved ? "" : " (아직 고친 적 없는 기본 표예요)"}.
          </div>

          {plan.changes.length === 0 ? (
            <div className="gl-reapply-note" data-testid="gl-reapply-nochange">
              바뀔 기록이 없어요. 저장된 모든 음성 기록이 이미 지금의 표대로예요.
            </div>
          ) : (
            <>
              {samples.length > 0 && (
                <details className="gl-details" open data-testid="gl-reapply-samples">
                  <summary>
                    바뀌는 예시 <b>{samples.length}</b>건{visibleCount > samples.length ? ` (문장이 바뀌는 기록 ${visibleCount}건 중)` : ""}
                  </summary>
                  <ul className="gl-list">
                    {samples.map((c) => (
                      <li key={c.id} className="gl-reapply-sample" data-testid="gl-reapply-sample">
                        <span className="gl-list-row">{[c.zone, c.elem].filter(Boolean).join(" · ")}</span>
                        <span className="gl-reapply-before">{c.before || c.rawText}</span>
                        <span className="gl-reapply-after">→ {c.normalized}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {samples.length === 0 && <div className="gl-reapply-note">문장은 그대로이고 요약 문구만 새로 만들어지는 기록이에요.</div>}
              <div className="gl-reapply-foot">
                <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={!!busy} data-testid="gl-reapply-apply">
                  {plan.changes.length}건에 새 표 적용하기
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={close} data-testid="gl-reapply-cancel">
                  취소
                </button>
              </div>
            </>
          )}
          {plan.changes.length === 0 && (
            <div className="gl-reapply-foot">
              <button type="button" className="btn btn-primary btn-sm" onClick={close} data-testid="gl-reapply-close">
                닫기
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "applying" && (
        <div className="gl-reapply-progress" role="status" data-testid="gl-reapply-progress">
          <div className="gl-reapply-progress-text" data-testid="gl-reapply-progress-text">
            {progress.done} / {progress.total}건 저장 중…
          </div>
          <div className="bar-track">
            <div className="bar-fill gl-reapply-fill" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
          <div className="gl-reapply-foot">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => (stop.current = true)} data-testid="gl-reapply-stop">
              중지
            </button>
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div className="gl-reapply-done" role="status" data-testid="gl-reapply-done">
          <div className="gl-reapply-done-title">{result.stopped ? "중간에 멈췄어요" : "저장된 기록에 새 표를 적용했어요"}</div>
          <div data-testid="gl-reapply-done-text">
            {result.stopped
              ? `${result.updated}건은 바뀌었고 나머지 ${result.total - result.updated - result.missing}건은 그대로예요. 다시 미리보기를 누르면 남은 기록부터 이어서 할 수 있어요.`
              : `${result.updated}건의 순화한 문장과 요약을 새 표대로 바꿨어요.`}
            {result.missing > 0 ? ` (그 사이 지워진 기록 ${result.missing}건은 건너뛰었어요.)` : ""}
          </div>
          <div className="gl-reapply-foot">
            <button type="button" className="btn btn-primary btn-sm" onClick={close} data-testid="gl-reapply-close">
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
