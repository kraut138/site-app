import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Icon, Modal } from "./UI.jsx";
import QrEntryList from "./QrEntryList.jsx";
import { QR_LIMITS, buildQrBoardLink } from "../qr.js";
import { forgetQrMedia } from "../qrMedia.js";
import { formatDateTime } from "../data.js";
import * as api from "../api.js";

// 관리자 "QR코드" 탭: 임의의 QR 코드를 만들어 현장에 붙이면, 스캔한 사람이 메모·사진·음성을 남기고
// 같은 QR을 스캔한 다른 사람과 관리자가 그 기록을 확인할 수 있다. (스캔 화면은 QrBoardScreen.jsx)
// 관리자 전용 화면이라 문구는 다른 관리자 화면처럼 한국어로 둔다. 기록 목록(QrEntryList)만 번역 사전을 쓴다.

const QR_COLORS = { dark: "#10151a", light: "#ffffff" };

// 인쇄·이미지로 저장하는 라벨에 함께 적는 안내(현장에 외국인 근로자가 있어 4개 언어로 적는다)
const LABEL_GUIDE = [
  "QR 코드를 스캔해 사진·음성·메모를 남겨 주세요",
  "Scan the QR code to leave a photo, voice message or note",
  "Quét mã QR để gửi ảnh, giọng nói hoặc ghi chú",
  "扫描二维码，留下照片、语音或文字",
];

function useQrImage(link, width) {
  const [url, setUrl] = useState(null); // null: 만드는 중, "": 실패
  useEffect(() => {
    let alive = true;
    setUrl(null);
    QRCode.toDataURL(link, { width, margin: 1, errorCorrectionLevel: "M", color: QR_COLORS })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(""));
    return () => {
      alive = false;
    };
  }, [link, width]);
  return url;
}

function safeFileName(name) {
  return String(name || "QR").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 50) || "QR";
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

// 글자를 정해진 너비 안에서 줄바꿈한다(한글은 띄어쓰기가 없어 글자 단위로 자른다).
function wrapLines(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = "";
  for (const ch of String(text || "")) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/.{0,1}$/, "…");
    return cut;
  }
  return lines;
}

// 제목·QR·안내가 들어간 라벨 이미지(PNG)를 그린다 - 카톡으로 보내거나 문서에 붙이기 좋다.
async function renderLabelPng({ title, note, link }) {
  const W = 1000;
  const H = 1400;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const font = '"Pretendard Variable", Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", sans-serif';
  const qrImg = await loadImage(await QRCode.toDataURL(link, { width: 760, margin: 1, errorCorrectionLevel: "M", color: QR_COLORS }));

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#17456f";
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#17456f";
  ctx.font = `700 32px ${font}`;
  ctx.fillText("현장검측", W / 2, 96);

  ctx.fillStyle = "#10151a";
  ctx.font = `800 62px ${font}`;
  let y = 180;
  for (const line of wrapLines(ctx, title, W - 160, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 76;
  }

  const qrTop = Math.max(y - 20, 250);
  ctx.drawImage(qrImg, (W - 760) / 2, qrTop, 760, 760);
  y = qrTop + 760 + 66;

  if (note) {
    ctx.fillStyle = "#4b5761";
    ctx.font = `500 36px ${font}`;
    for (const line of wrapLines(ctx, note, W - 160, 2)) {
      ctx.fillText(line, W / 2, y);
      y += 48;
    }
    y += 10;
  }

  ctx.fillStyle = "#10151a";
  ctx.font = `600 31px ${font}`;
  for (const line of LABEL_GUIDE) {
    ctx.fillText(line, W / 2, y);
    y += 44;
  }
  return canvas.toDataURL("image/png");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드 권한이 없으면 아래의 오래된 방식으로 복사를 시도한다.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ---------------- 새 QR 코드 만들기 ----------------
function CreateForm({ onCreate }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) {
      setError("QR 코드 이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate({ title, note });
      setTitle("");
      setNote("");
    } catch (err) {
      setError(err.message || "QR 코드를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card card-pad qr-create" onSubmit={submit} data-testid="qr-create-form">
      <div className="section-head">
        <div className="section-title">새 QR 코드 만들기</div>
      </div>
      <div className="qr-create-grid">
        <div className="field">
          <label htmlFor="qr-new-title">이름 (필수)</label>
          <input
            id="qr-new-title"
            className="input"
            value={title}
            maxLength={QR_LIMITS.titleMax}
            placeholder="예: 101동 3층 계단실"
            onChange={(e) => setTitle(e.target.value)}
            data-testid="qr-new-title"
          />
        </div>
        <div className="field">
          <label htmlFor="qr-new-note">안내 메모 (선택, 스캔 화면에 표시)</label>
          <input
            id="qr-new-note"
            className="input"
            value={note}
            maxLength={QR_LIMITS.noteMax}
            placeholder="예: 점검 중 발견한 사항을 사진·음성으로 남겨 주세요"
            onChange={(e) => setNote(e.target.value)}
            data-testid="qr-new-note"
          />
        </div>
        <div className="field">
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="qr-create-submit">
            <Icon.Plus width="15" height="15" /> {busy ? "만드는 중…" : "QR 코드 만들기"}
          </button>
        </div>
      </div>
      {error && (
        <div className="qr-error" role="alert" data-testid="qr-create-error">
          {error}
        </div>
      )}
    </form>
  );
}

// ---------------- 목록의 QR 카드 ----------------
function CodeCard({ code, stat, onOpen }) {
  const qr = useQrImage(buildQrBoardLink(code.id), 200);
  return (
    <button type="button" className="qr-card" onClick={() => onOpen(code.id)} data-testid="qr-card">
      <span className="qr-card-img">{qr ? <img src={qr} alt="" /> : <span className="qr-card-img-ph">{qr === "" ? "생성 실패" : "…"}</span>}</span>
      <span className="qr-card-body">
        <span className="qr-card-title">{code.title}</span>
        {code.note ? <span className="qr-card-note">{code.note}</span> : null}
        <span className="qr-card-meta" data-testid="qr-card-count">
          기록 {stat ? stat.count : 0}건{stat && stat.last ? ` · 최근 ${formatDateTime(stat.last)}` : ""}
        </span>
      </span>
    </button>
  );
}

// ---------------- 라벨 인쇄 미리보기 ----------------
function LabelPrintOverlay({ code, link, onClose }) {
  const qr = useQrImage(link, 900);
  useEffect(() => {
    // 라벨은 세로(A4) 한 장으로 인쇄한다. 서류 탭의 가로 인쇄 설정(@page)은 이 미리보기가 열려 있는 동안만 덮어쓴다.
    const style = document.createElement("style");
    style.setAttribute("data-qr-print-page", "1");
    style.textContent = "@page { size: A4 portrait; margin: 12mm; }";
    document.head.appendChild(style);
    document.body.classList.add("qr-print-mode");
    return () => {
      style.remove();
      document.body.classList.remove("qr-print-mode");
    };
  }, []);

  return createPortal(
    <div className="pour-print-overlay" data-testid="qr-print-overlay">
      <div className="pour-print-toolbar">
        <strong>QR 라벨 인쇄 미리보기</strong>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => window.print()} data-testid="qr-print-now">
          인쇄
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose} data-testid="qr-print-close">
          닫기
        </button>
      </div>
      <div className="qr-label-sheet" data-testid="qr-label-sheet">
        <div className="qr-label-brand">현장검측</div>
        <div className="qr-label-title">{code.title}</div>
        {qr ? <img className="qr-label-qr" src={qr} alt="" /> : <div className="qr-label-qr qr-label-qr-ph">…</div>}
        {code.note ? <div className="qr-label-note">{code.note}</div> : null}
        <div className="qr-label-guide">
          {LABEL_GUIDE.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------- 확인 창(삭제 등) ----------------
function ConfirmModal({ title, children, confirmLabel, busy, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose} width="440px">
      <div className="qr-confirm-body">{children}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-fail" onClick={onConfirm} disabled={busy} data-testid="qr-confirm-ok">
          {busy ? "삭제 중…" : confirmLabel}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy} data-testid="qr-confirm-cancel">
          취소
        </button>
      </div>
    </Modal>
  );
}

// ---------------- QR 코드 1개의 상세 ----------------
function CodeDetail({ code, entries, onBack, onUpdate, onDeleteCode, onDeleteEntry, onRefresh, notify }) {
  const link = buildQrBoardLink(code.id);
  const qr = useQrImage(link, 520);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(code.title);
  const [note, setNote] = useState(code.note || "");
  const [editError, setEditError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type: "code" } | { type: "entry", entry }
  const [busy, setBusy] = useState(false);

  async function saveEdit() {
    setEditError("");
    try {
      await onUpdate(code.id, { title, note });
      setEditing(false);
    } catch (err) {
      setEditError(err.message || "저장하지 못했습니다.");
    }
  }

  async function copyLink() {
    notify((await copyText(link)) ? "링크를 복사했습니다." : "복사하지 못했습니다. 링크를 직접 선택해 복사해주세요.");
  }

  async function downloadLabel() {
    try {
      const url = await renderLabelPng({ title: code.title, note: code.note, link });
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR_${safeFileName(code.title)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      notify("이미지를 만들지 못했습니다. 다시 시도해주세요.");
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.type === "code") await onDeleteCode(code);
      else await onDeleteEntry(confirm.entry);
      setConfirm(null);
    } catch {
      notify("삭제하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="qr-detail">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} data-testid="qr-back" style={{ marginBottom: 12 }}>
        ← 목록으로
      </button>

      <div className="card card-pad qr-detail-top">
        <div className="qr-detail-qr">{qr ? <img src={qr} alt="QR 코드" data-testid="qr-detail-img" /> : <span>{qr === "" ? "생성 실패" : "…"}</span>}</div>
        <div className="qr-detail-info">
          {editing ? (
            <div data-testid="qr-edit-form">
              <div className="field">
                <label>이름</label>
                <input className="input" value={title} maxLength={QR_LIMITS.titleMax} onChange={(e) => setTitle(e.target.value)} data-testid="qr-edit-title" />
              </div>
              <div className="field">
                <label>안내 메모</label>
                <input className="input" value={note} maxLength={QR_LIMITS.noteMax} onChange={(e) => setNote(e.target.value)} data-testid="qr-edit-note" />
              </div>
              {editError && <div className="qr-error">{editError}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveEdit} data-testid="qr-edit-save">
                  저장
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditing(false);
                    setTitle(code.title);
                    setNote(code.note || "");
                    setEditError("");
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="qr-detail-title" data-testid="qr-detail-title">
                {code.title}
              </div>
              {code.note ? <div className="qr-detail-note">{code.note}</div> : null}
              <div className="qr-detail-meta">
                만든 날 {formatDateTime(code.createdAt)}
                {code.createdBy ? ` · ${code.createdBy}` : ""}
              </div>
              <button type="button" className="qr-linkbtn" onClick={() => setEditing(true)} data-testid="qr-edit-open">
                이름·메모 수정
              </button>
            </>
          )}

          <div className="qr-link-row">
            <input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} data-testid="qr-link" />
          </div>
          <div className="qr-actions">
            <button className="btn btn-ghost btn-sm" onClick={copyLink} data-testid="qr-copy">
              링크 복사
            </button>
            <a className="btn btn-ghost btn-sm" href={link} target="_blank" rel="noopener noreferrer" data-testid="qr-open-scan">
              스캔 화면 열기
            </a>
            <button className="btn btn-ghost btn-sm" onClick={downloadLabel} data-testid="qr-download">
              <Icon.Download width="14" height="14" /> 이미지 저장
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPrinting(true)} data-testid="qr-print-open">
              인쇄
            </button>
            <button className="btn btn-ghost btn-sm qr-danger" onClick={() => setConfirm({ type: "code" })} data-testid="qr-delete-code">
              <Icon.Trash width="14" height="14" /> QR 삭제
            </button>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-head qr-list-head">
          <div className="section-title" data-testid="qr-detail-count">
            남겨진 기록 {entries.length}건
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh} data-testid="qr-detail-refresh">
            새로고침
          </button>
        </div>
        <QrEntryList entries={entries} onDelete={(entry) => setConfirm({ type: "entry", entry })} />
      </div>

      {printing && <LabelPrintOverlay code={code} link={link} onClose={() => setPrinting(false)} />}
      {confirm && (
        <ConfirmModal
          title={confirm.type === "code" ? "QR 코드 삭제" : "기록 삭제"}
          confirmLabel="삭제"
          busy={busy}
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        >
          {confirm.type === "code" ? (
            <>
              <strong>{code.title}</strong> QR 코드와 여기에 남겨진 기록 {entries.length}건(사진·음성 포함)이 모두 삭제됩니다.
              <br />
              이미 인쇄해 붙여둔 QR은 더 이상 사용할 수 없게 됩니다. 삭제한 내용은 되돌릴 수 없습니다.
            </>
          ) : (
            <>이 기록(사진·음성 포함)을 삭제합니다. 삭제한 내용은 되돌릴 수 없습니다.</>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}

// ---------------- 탭 본체 ----------------
export default function QrCodes({ createdBy, notify }) {
  const [data, setData] = useState({ status: "loading", codes: [], entries: [], error: "" });
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setData((d) => ({ ...d, status: "loading", error: "" }));
    try {
      const { codes, entries } = await api.fetchQrOverview();
      setData({ status: "ready", codes, entries, error: "" });
    } catch (err) {
      setData((d) => ({ ...d, status: "error", error: (err && err.message) || "" }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const map = new Map();
    for (const e of data.entries) {
      const s = map.get(e.qrId) || { count: 0, last: "" };
      s.count += 1;
      if ((e.createdAt || "") > s.last) s.last = e.createdAt || "";
      map.set(e.qrId, s);
    }
    return map;
  }, [data.entries]);

  async function handleCreate({ title, note }) {
    const created = await api.createQrCode({ title, note, createdBy });
    setData((d) => ({ ...d, codes: [created, ...d.codes] }));
    setSelectedId(created.id); // 만들자마자 큰 QR과 인쇄·저장 버튼이 있는 상세 화면으로 이동한다
    notify("QR 코드를 만들었습니다.");
  }

  async function handleUpdate(id, patch) {
    const updated = await api.updateQrCode(id, patch);
    setData((d) => ({ ...d, codes: d.codes.map((c) => (c.id === id ? { ...c, ...updated } : c)) }));
    notify("저장했습니다.");
  }

  async function handleDeleteCode(code) {
    await api.deleteQrCode(code.id);
    data.entries.filter((e) => e.qrId === code.id).forEach((e) => forgetQrMedia(e.id));
    setData((d) => ({ ...d, codes: d.codes.filter((c) => c.id !== code.id), entries: d.entries.filter((e) => e.qrId !== code.id) }));
    setSelectedId(null);
    notify("QR 코드를 삭제했습니다.");
  }

  async function handleDeleteEntry(entry) {
    await api.deleteQrEntry(entry.id);
    forgetQrMedia(entry.id);
    setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== entry.id) }));
    notify("기록을 삭제했습니다.");
  }

  const selected = selectedId ? data.codes.find((c) => c.id === selectedId) : null;

  if (data.status === "loading" && data.codes.length === 0) {
    return (
      <div className="card card-pad qr-center" data-testid="qr-admin-loading">
        불러오는 중…
      </div>
    );
  }
  if (data.status === "error" && data.codes.length === 0) {
    return (
      <div className="card card-pad qr-center" data-testid="qr-admin-error">
        QR 코드 목록을 불러오지 못했습니다.
        <br />
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }

  if (selected) {
    return (
      <CodeDetail
        key={selected.id}
        code={selected}
        entries={data.entries.filter((e) => e.qrId === selected.id)}
        onBack={() => setSelectedId(null)}
        onUpdate={handleUpdate}
        onDeleteCode={handleDeleteCode}
        onDeleteEntry={handleDeleteEntry}
        onRefresh={load}
        notify={notify}
      />
    );
  }

  return (
    <div data-testid="qr-admin">
      <CreateForm onCreate={handleCreate} />

      <div className="section-head qr-list-head" style={{ marginTop: 22 }}>
        <div className="section-title" data-testid="qr-code-count">
          만든 QR 코드 {data.codes.length}개
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={data.status === "loading"} data-testid="qr-admin-refresh">
          새로고침
        </button>
      </div>
      {data.codes.length === 0 ? (
        <div className="card card-pad qr-center" data-testid="qr-admin-empty">
          아직 만든 QR 코드가 없습니다. 위에서 이름을 입력해 첫 QR 코드를 만들어 보세요.
        </div>
      ) : (
        <div className="qr-grid">
          {data.codes.map((code) => (
            <CodeCard key={code.id} code={code} stat={stats.get(code.id)} onOpen={setSelectedId} />
          ))}
        </div>
      )}
    </div>
  );
}
