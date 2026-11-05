import React, { useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import { Icon, EmptyState } from "./UI.jsx";
import * as api from "../api.js";
import { dayKeyOf, isDayKey, dayRange, shiftDay, longDate } from "../paperwork/dayTools.js";
import { digestDay } from "../paperwork/digestReports.js";
import { workLogModel, tbmModel, inspectionModels, inspectionZipName, INSPECTION_FILLED, INSPECTION_BLANK } from "../paperwork/formModels.js";
import { fillWorkLog, fillTbmLog } from "../paperwork/docxFill.js";
import { fillInspectionRequest } from "../paperwork/hwpFill.js";
import PaperworkPreview, { EyeIcon } from "./PaperworkPreview.jsx";

// "5. 서류 작성" - 하루치 음성 기록(voiceReports)을 읽어 작업일보·TBM 일지(워드)와 검측요청서(한글)의 양식 파일을 자동으로 채워 내려받게 한다.
// 기록에서 알 수 없는 칸(현장명·날씨·출역 인원·서명 등)은 값을 만들지 않고 양식의 빈 칸 그대로 둔다. 어떻게 채우는지는 src/paperwork/ 에 있다.
// 양식 원본은 public/templates/ 에 있고, 내려받을 때마다 이 브라우저 안에서 채운다(서버로 보내는 것은 없다).
// "미리보기" 단추는 내려받을 파일과 똑같은 바이트를 만들어(같은 채우기 함수) 내려받지 않고 화면에 종이 모양으로 보여 준다(PaperworkPreview.jsx).

const BASE = import.meta.env.BASE_URL || "/";
const TEMPLATE_URLS = {
  workLog: `${BASE}templates/work-log.docx`,
  tbm: `${BASE}templates/tbm-log.docx`,
  inspection: `${BASE}templates/inspection-request.hwp`,
};
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_HWP = "application/x-hwp";
const MIME_ZIP = "application/zip";

const templateCache = new Map();
function loadTemplate(key) {
  if (!templateCache.has(key)) {
    const job = fetch(TEMPLATE_URLS[key])
      .catch(() => {
        throw new Error("양식 파일을 불러오지 못했습니다.");
      })
      .then((res) => {
        if (!res.ok) throw new Error("양식 파일을 불러오지 못했습니다.");
        return res.arrayBuffer();
      })
      .then((buf) => new Uint8Array(buf));
    // 실패한 요청은 기억해 두지 않아 다시 누르면 다시 시도한다
    job.catch(() => templateCache.delete(key));
    templateCache.set(key, job);
  }
  return templateCache.get(key);
}

function saveFile(bytes, fileName, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// 내려받은 뒤(또는 미리보기에서) 알려 주는 글. 칸에 다 못 넣어 줄인 것이 있을 때만 글이 있다.
const workLogWarnText = (report) => (report.omitted ? `기록이 많아 ${report.omitted}건은 표에 다 넣지 못하고 "외 ${report.omitted}건"으로 줄였어요.` : "");
const inspectionWarnText = (shortened) => (shortened ? `${shortened}건은 칸이 좁아 일부 글을 "…"로 줄였어요. 한글에서 열어 확인해 주세요.` : "");
const countShortened = (report) => (Object.values(report.fields).some((f) => f.truncated) ? 1 : 0);

function Tags({ filled, blank }) {
  return (
    <div className="pw-tags">
      {filled.map((t) => (
        <span key={`f-${t}`} className="pw-tag pw-tag-fill">
          채움 · {t}
        </span>
      ))}
      {blank.map((t) => (
        <span key={`b-${t}`} className="pw-tag pw-tag-blank">
          공란 · {t}
        </span>
      ))}
    </div>
  );
}

function Blank({ children }) {
  return children ? children : <span className="pw-blank">(공란)</span>;
}

export default function Paperwork({ notify, checklistItems = [] }) {
  const [dayKey, setDayKey] = useState(() => dayKeyOf());
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [reports, setReports] = useState([]);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState("");
  const [unchecked, setUnchecked] = useState({}); // 검측요청서 목록에서 체크를 푼 것(key → true)
  const [warn, setWarn] = useState({}); // 서류별로 내려받은 뒤의 안내 글
  const [preview, setPreview] = useState(null); // 열어 둔 미리보기 { kind, title, fileName, bytes, notice }
  const openerRef = useRef(null); // 미리보기를 연 단추(닫으면 그 단추로 돌아온다)

  useEffect(() => {
    if (!isDayKey(dayKey)) return undefined;
    let alive = true;
    setStatus("loading");
    const { start, end } = dayRange(dayKey);
    api
      .fetchVoiceReportsInRange(start, end)
      .then((list) => {
        if (!alive) return;
        setReports(list);
        setStatus("ready");
      })
      .catch(() => {
        if (!alive) return;
        setStatus("error");
        if (notify) notify("음성 기록을 불러오지 못했습니다. 연결을 확인해 주세요.");
      });
    return () => {
      alive = false;
    };
  }, [dayKey, tick, notify]);

  const digest = useMemo(() => digestDay(reports, { checklistItems }), [reports, checklistItems]);
  const workLog = useMemo(() => workLogModel(digest, dayKey), [digest, dayKey]);
  const tbm = useMemo(() => tbmModel(digest, dayKey), [digest, dayKey]);
  const inspections = useMemo(() => inspectionModels(digest, dayKey), [digest, dayKey]);
  const chosen = inspections.filter((m) => !unchecked[m.key]);

  const run = async (id, job, failText) => {
    if (busy) return;
    setBusy(id);
    try {
      await job();
    } catch (e) {
      if (notify) notify(`${failText} ${e && e.message ? e.message : ""}`.trim());
    } finally {
      setBusy("");
    }
  };

  // 서류 파일 만들기: 내려받기와 미리보기가 같은 함수를 써서, 미리보기에 보이는 것 = 내려받는 파일의 내용이 되게 한다.
  const makeWorkLog = async () => fillWorkLog(await loadTemplate("workLog"), workLog);
  const makeTbm = async () => fillTbmLog(await loadTemplate("tbm"), tbm);
  const makeInspection = async (m) => fillInspectionRequest(await loadTemplate("inspection"), m.values);

  const downloadWorkLog = () =>
    run(
      "worklog",
      async () => {
        const { bytes, report } = await makeWorkLog();
        saveFile(bytes, workLog.fileName, MIME_DOCX);
        setWarn((w) => ({ ...w, worklog: workLogWarnText(report) }));
        if (notify) notify("작업일보를 내려받았습니다.");
      },
      "작업일보를 만들지 못했습니다."
    );

  const downloadTbm = () =>
    run(
      "tbm",
      async () => {
        const { bytes } = await makeTbm();
        saveFile(bytes, tbm.fileName, MIME_DOCX);
        setWarn((w) => ({ ...w, tbm: "" }));
        if (notify) notify("TBM 일지를 내려받았습니다.");
      },
      "TBM 일지를 만들지 못했습니다."
    );

  // 검측요청서 한 장 이상. 한 장이면 .hwp 하나, 여러 장이면 .zip 하나로 내려받는다.
  const downloadInspections = (models) =>
    run(
      models.length === 1 ? `hwp:${models[0].key}` : "hwp-zip",
      async () => {
        const files = {};
        let shortened = 0;
        for (const m of models) {
          const { bytes, report } = await makeInspection(m);
          files[m.fileName] = bytes;
          shortened += countShortened(report);
        }
        if (models.length === 1) saveFile(files[models[0].fileName], models[0].fileName, MIME_HWP);
        else saveFile(zipSync(files, { level: 6 }), inspectionZipName(dayKey), MIME_ZIP);
        setWarn((w) => ({ ...w, inspection: inspectionWarnText(shortened) }));
        if (notify) notify(models.length === 1 ? "검측요청서를 내려받았습니다." : `검측요청서 ${models.length}장을 압축 파일로 내려받았습니다.`);
      },
      "검측요청서를 만들지 못했습니다."
    );

  // 미리보기: 파일을 내려받지 않고 화면에서 본다. 열기만 하고, 내려받는 일은 미리보기 창의 「받기」에서 한다.
  const openPreview = (id, trigger, build) => {
    openerRef.current = trigger || null;
    return run(
      `pv:${id}`,
      async () => {
        setPreview(await build());
      },
      "미리보기를 만들지 못했습니다."
    );
  };

  const previewWorkLog = (trigger) =>
    openPreview("worklog", trigger, async () => {
      const { bytes, report } = await makeWorkLog();
      return { kind: "docx", title: "작업일보", fileName: workLog.fileName, bytes, notice: workLogWarnText(report) };
    });

  const previewTbm = (trigger) =>
    openPreview("tbm", trigger, async () => {
      const { bytes } = await makeTbm();
      return { kind: "docx", title: "TBM 일지", fileName: tbm.fileName, bytes, notice: "" };
    });

  const previewInspection = (m, trigger) =>
    openPreview(`hwp:${m.key}`, trigger, async () => {
      const { bytes, report } = await makeInspection(m);
      return { kind: "hwp", title: "검측요청서", fileName: m.fileName, bytes, notice: inspectionWarnText(countShortened(report)) };
    });

  const closePreview = () => {
    setPreview(null);
    const opener = openerRef.current;
    if (opener) setTimeout(() => document.body.contains(opener) && !opener.disabled && opener.focus(), 0);
  };

  const downloadPreview = (p) => saveFile(p.bytes, p.fileName, p.kind === "hwp" ? MIME_HWP : MIME_DOCX);

  const today = dayKeyOf();
  const changeDay = (key) => {
    if (!isDayKey(key)) return;
    setDayKey(key);
    setReports([]);
    setUnchecked({});
    setWarn({});
  };

  return (
    <div className="pw-wrap" data-testid="pw-root">
      <div className="card pw-head">
        <div className="section-title">작성할 날짜</div>
        <div className="pw-date-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeDay(shiftDay(dayKey, -1))} aria-label="전날" data-testid="pw-prev">
            ‹ 전날
          </button>
          <input
            type="date"
            className="pw-date-input"
            value={dayKey}
            max={today}
            onChange={(e) => changeDay(e.target.value)}
            aria-label="서류를 만들 날짜"
            data-testid="pw-date"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeDay(shiftDay(dayKey, 1))} disabled={dayKey >= today} aria-label="다음 날" data-testid="pw-next">
            다음 날 ›
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeDay(today)} disabled={dayKey === today} data-testid="pw-today">
            오늘
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTick((n) => n + 1)} disabled={status === "loading"} data-testid="pw-reload">
            다시 불러오기
          </button>
        </div>
        <div className="pw-summary" data-testid="pw-summary">
          {status === "loading" && "음성 기록을 불러오는 중…"}
          {status === "error" && "음성 기록을 불러오지 못했습니다. 연결을 확인하고 다시 불러오기를 눌러 주세요."}
          {status === "ready" &&
            (digest.total > 0
              ? `${longDate(dayKey)} · 음성 기록 ${digest.total}건${tbm.place ? ` · ${tbm.place}` : ""}`
              : `${longDate(dayKey)} · 이 날 남긴 음성 기록이 없어요`)}
        </div>
        <div className="pw-note">
          서류는 위 날짜에 남긴 음성 기록(순화한 내용)을 바탕으로 채워요. 기록에서 알 수 없는 칸은 만들어 내지 않고 비워 두니, 현장명·날씨·출역 인원·서명 같은 칸은 내려받은 뒤 직접 적어 주세요.
        </div>
      </div>

      {status === "error" ? (
        <EmptyState message="음성 기록을 불러오지 못했습니다. 연결을 확인하고 다시 불러오기를 눌러 주세요." />
      ) : (
        <>
          {/* ---------------- 작업일보 ---------------- */}
          <div className="card pw-doc" data-testid="pw-worklog">
            <div className="pw-doc-head">
              <div>
                <div className="section-title">작업일보 (.docx)</div>
                <div className="pw-doc-desc">공종 · 위치 · 작업 내용은 같은 동·층·공종끼리 묶어 한 줄씩 적어요.</div>
              </div>
              <div className="pw-doc-actions">
                <button type="button" className="btn btn-ghost" onClick={(e) => previewWorkLog(e.currentTarget)} disabled={status !== "ready" || !!busy} data-testid="pw-worklog-pv">
                  <EyeIcon width="15" height="15" />
                  {busy === "pv:worklog" ? "여는 중…" : "미리보기"}
                </button>
                <button type="button" className="btn btn-primary" onClick={downloadWorkLog} disabled={status !== "ready" || !!busy} data-testid="pw-worklog-dl">
                  <Icon.Download width="15" height="15" />
                  {busy === "worklog" ? "만드는 중…" : "작업일보 받기"}
                </button>
              </div>
            </div>
            <Tags filled={workLog.filled} blank={workLog.blank} />
            <table className="pw-table" data-testid="pw-worklog-table">
              <thead>
                <tr>
                  <th>공종</th>
                  <th>위치(동·층·구간)</th>
                  <th>작업 내용</th>
                </tr>
              </thead>
              <tbody>
                {workLog.rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="pw-blank">
                      채울 작업 내용이 없어 표는 비워 둬요
                    </td>
                  </tr>
                ) : (
                  workLog.rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <Blank>{r.trade}</Blank>
                      </td>
                      <td>
                        <Blank>{r.place}</Blank>
                      </td>
                      <td>{r.content.join(" / ")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {warn.worklog && <div className="pw-warn">{warn.worklog}</div>}
          </div>

          {/* ---------------- TBM 일지 ---------------- */}
          <div className="card pw-doc" data-testid="pw-tbm">
            <div className="pw-doc-head">
              <div>
                <div className="section-title">작업 전 안전점검회의(TBM) 일지 (.docx)</div>
                <div className="pw-doc-desc">위험요인은 기록에 위험 낱말(추락·개구부·감전·미설치 등)이 들어 있을 때만 옮겨 적어요.</div>
              </div>
              <div className="pw-doc-actions">
                <button type="button" className="btn btn-ghost" onClick={(e) => previewTbm(e.currentTarget)} disabled={status !== "ready" || !!busy} data-testid="pw-tbm-pv">
                  <EyeIcon width="15" height="15" />
                  {busy === "pv:tbm" ? "여는 중…" : "미리보기"}
                </button>
                <button type="button" className="btn btn-primary" onClick={downloadTbm} disabled={status !== "ready" || !!busy} data-testid="pw-tbm-dl">
                  <Icon.Download width="15" height="15" />
                  {busy === "tbm" ? "만드는 중…" : "TBM 일지 받기"}
                </button>
              </div>
            </div>
            <Tags filled={tbm.filled} blank={tbm.blank} />
            <table className="pw-table" data-testid="pw-tbm-table">
              <tbody>
                <tr>
                  <th>일시</th>
                  <td>{tbm.dateLabel} (시간은 공란)</td>
                </tr>
                <tr>
                  <th>작업 장소</th>
                  <td>
                    <Blank>{tbm.place}</Blank>
                  </td>
                </tr>
                <tr>
                  <th>작업 내용</th>
                  <td>
                    <Blank>{tbm.work}</Blank>
                  </td>
                </tr>
                <tr>
                  <th>위험요인</th>
                  <td>{tbm.hazards.length ? tbm.hazards.map((h, i) => <div key={i}>{h}</div>) : <span className="pw-blank">(공란)</span>}</td>
                </tr>
              </tbody>
            </table>
            {warn.tbm && <div className="pw-warn">{warn.tbm}</div>}
          </div>

          {/* ---------------- 검측요청서 ---------------- */}
          <div className="card pw-doc" data-testid="pw-inspection">
            <div className="pw-doc-head">
              <div>
                <div className="section-title">검측요청서 (.hwp)</div>
                <div className="pw-doc-desc">같은 동·층·공종(세부 공종)의 기록마다 한 장씩 만들어요. 한 장이면 한글 파일 하나, 여러 장이면 압축 파일 하나로 받아요.</div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => downloadInspections(chosen)}
                disabled={status !== "ready" || !!busy || chosen.length === 0}
                data-testid="pw-ins-dl-all"
              >
                <Icon.Download width="15" height="15" />
                {busy === "hwp-zip" ? "만드는 중…" : chosen.length === 1 ? "검측요청서 받기" : `선택한 ${chosen.length}장 받기`}
              </button>
            </div>
            <Tags filled={INSPECTION_FILLED} blank={INSPECTION_BLANK} />
            {inspections.length === 0 ? (
              <div className="pw-empty" data-testid="pw-ins-empty">
                이 날짜에는 검측요청서로 만들 음성 기록이 없어요.
              </div>
            ) : (
              <div className="pw-ins-list">
                {inspections.map((m, i) => (
                  <div key={m.key} className="pw-ins-row" data-testid="pw-ins-row">
                    <input
                      type="checkbox"
                      checked={!unchecked[m.key]}
                      onChange={(e) => setUnchecked((u) => ({ ...u, [m.key]: !e.target.checked }))}
                      aria-label={`${m.label} 선택`}
                      data-testid={`pw-ins-check-${i}`}
                    />
                    <div className="pw-ins-body">
                      <div className="pw-ins-title">{m.label}</div>
                      <div className="pw-ins-line">
                        <span>검측 부위</span> <Blank>{m.values.part}</Blank>
                      </div>
                      <div className="pw-ins-line">
                        <span>검측 사항</span> <Blank>{m.values.matters.replace(/\n/g, " / ")}</Blank>
                      </div>
                      <div className="pw-ins-line pw-ins-meta">
                        기록 {m.count}건 · {m.fileName}
                      </div>
                    </div>
                    <div className="pw-ins-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => previewInspection(m, e.currentTarget)}
                        disabled={status !== "ready" || !!busy}
                        data-testid={`pw-ins-pv-${i}`}
                      >
                        <EyeIcon width="14" height="14" />
                        {busy === `pv:hwp:${m.key}` ? "여는 중…" : "미리보기"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => downloadInspections([m])}
                        disabled={status !== "ready" || !!busy}
                        data-testid={`pw-ins-dl-${i}`}
                      >
                        <Icon.Download width="14" height="14" />
                        {busy === `hwp:${m.key}` ? "만드는 중…" : "받기"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="pw-note">
              한글(.hwp) 파일은 양식 파일의 빈 칸에 글을 채워 만들어요. 칸이 좁아 긴 글은 두 줄까지만 들어가고, 넘치는 글은 "…"로 줄여요. 내려받은 뒤 한글에서 한 번 열어 확인해 주세요.
            </div>
            {warn.inspection && <div className="pw-warn">{warn.inspection}</div>}
          </div>
        </>
      )}
      {preview && <PaperworkPreview preview={preview} onClose={closePreview} onDownload={downloadPreview} />}
    </div>
  );
}
