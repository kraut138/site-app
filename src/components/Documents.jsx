import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, Icon } from "./UI.jsx";
import SignaturePad from "./SignaturePad.jsx";
import { useLanguage } from "../LanguageContext.jsx";

// "서류" 탭 (확인용): 별지 제35호 서식(구조물별 콘크리트 타설현황)을 보여주고, 전자서명 버튼으로 서명 화면을 띄운다.
// 표의 내용은 예시이고, 서명은 App.jsx의 상태에만 보관된다(새로고침/로그아웃하면 사라짐).
// 서식 자체는 공식 서식이라 한국어로 고정하고, 버튼·안내 문구만 번역한다.
export const DOC_SLOTS = ["tester", "contractor", "supervisor"];

const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

function sampleRow() {
  const d = new Date();
  return {
    building: "101동",
    date: `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`,
    part: "5층 슬래브",
    design: "120",
    poured: "118.5",
    mix: "A1",
    supplier: "○○레미콘",
    method: "Pump",
    time: "09:30",
    temp: "22",
    slump: "80",
    air: "4.5",
    chloride: "0.1",
    strength: "",
  };
}

// 별지 제35호 서식 본문 (화면 미리보기와 인쇄 미리보기에서 똑같이 쓴다)
function FormSheet({ signatures, inline }) {
  const r = sampleRow();
  const sig = (slot) => signatures[slot];
  const cell = (slot) => (
    <>
      <td className="name">{sig(slot) ? sig(slot).name : ""}</td>
      <td className="sig" data-testid={`doc-sig-${slot}`}>{sig(slot) ? <img src={sig(slot).image} alt="" /> : null}</td>
    </>
  );
  return (
    <div className={`pour-sheet${inline ? " inline" : ""}`}>
      <div className="pour-sheet-top"><span>[별지 제35호 서식]</span><span>(제 1 쪽)</span></div>
      <h2>구조물별 콘크리트 타설현황</h2>
      <div className="pour-sheet-sub">1 구조물별 콘크리트 타설현황(횡양식)</div>
      <table className="pour-table">
        <colgroup>
          {[5, 6.2, 7.5, 4, 4, 4.5, 5.5, 4.3, 3.8, 3.8, 4, 4, 4, 4.8, 5, 6.5, 5, 6.5, 5, 6.5].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>구조물명</th>
            <th rowSpan={2}>타설일자</th>
            <th rowSpan={2}>타설부위</th>
            <th rowSpan={2}>설계량<br />(㎥)</th>
            <th rowSpan={2}>타설량<br />(㎥)</th>
            <th rowSpan={2}>콘크리트<br />배합종류</th>
            <th rowSpan={2}>납품<br />회사</th>
            <th rowSpan={2}>타설<br />방법</th>
            <th rowSpan={2}>타설<br />시간</th>
            <th rowSpan={2}>타설시<br />온 도<br />(℃)</th>
            <th colSpan={4}>시 험 결 과</th>
            <th colSpan={2}>시 험 자</th>
            <th colSpan={2}>시공사<br />담당자</th>
            <th colSpan={2}>공사감독자<br />(건설사업관리기술인)</th>
          </tr>
          <tr>
            <th>슬럼프<br />(mm)</th>
            <th>공기량<br />(%)</th>
            <th>염분량<br />(㎏/㎥)</th>
            <th>28일 압축<br />강도(MPa)</th>
            <th>성명</th><th>서명</th>
            <th>성명</th><th>서명</th>
            <th>성명</th><th>서명</th>
          </tr>
        </thead>
        <tbody>
          <tr data-testid="doc-row">
            <td>{r.building}</td>
            <td>{r.date}</td>
            <td>{r.part}</td>
            <td className="num">{r.design}</td>
            <td className="num">{r.poured}</td>
            <td>{r.mix}</td>
            <td>{r.supplier}</td>
            <td>{r.method}</td>
            <td>{r.time}</td>
            <td className="num">{r.temp}</td>
            <td className="num">{r.slump}</td>
            <td className="num">{r.air}</td>
            <td className="num">{r.chloride}</td>
            <td className="num">{r.strength}</td>
            {cell("tester")}
            {cell("contractor")}
            {cell("supervisor")}
          </tr>
        </tbody>
      </table>

      <div className="pour-notes">
        <div>※ 작성요령</div>
        <div>1. 슬럼프, 공기량과 28일강도 시험자가 다를 경우 슬럼프, 공기량 시험자는 상단에, 28일강도 시험자는 하단에 성명과 서명</div>
        <div>2. 직접타설 : Mixer Truck으로부터 직접 받아 타설. 3. Pump : Pump Car로 타설</div>
        <div>4. 콘크리트 배합 사례</div>
        <div>&nbsp;&nbsp;․ 25-21-80을 A1으로 할 경우 25-21-120는 A2, 25-21-150는 A3 등으로 기재합니다.</div>
        <div>&nbsp;&nbsp;․ 19-24-80을 B1으로 할 경우 19-24-120는 B2, 19-24-150는 B3 등으로 기재합니다.</div>
      </div>
    </div>
  );
}

// 전자서명 화면: 서명 칸 선택 → 성명 → 직접 서명 → 확인 체크 → 서명 완료
function SignDialog({ signatures, defaultName, onSubmit, onClose }) {
  const { t } = useLanguage();
  const [slot, setSlot] = useState(DOC_SLOTS.find((s) => !signatures[s]) || DOC_SLOTS[0]);
  const [name, setName] = useState(defaultName || "");
  const [ink, setInk] = useState(null);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");

  function submit() {
    if (!name.trim()) return setError(t("doc.needName"));
    if (!ink) return setError(t("doc.needInk"));
    if (!agree) return setError(t("doc.needCheck"));
    onSubmit(slot, { name: name.trim(), image: ink });
  }

  return (
    <Modal title={t("doc.signTitle")} onClose={onClose} width="640px">
      <div className="field">
        <label>{t("doc.slot")}</label>
        <div className="doc-slot-pills">
          {DOC_SLOTS.map((s) => (
            <button
              type="button"
              key={s}
              className={`doc-slot-pill${slot === s ? " active" : ""}`}
              onClick={() => setSlot(s)}
              data-testid={`slot-pill-${s}`}
            >
              {t(`doc.slot.${s}`)}
              {signatures[s] ? " ✓" : ""}
            </button>
          ))}
        </div>
        {signatures[slot] && <div className="doc-resign">{t("doc.resign")}</div>}
      </div>
      <div className="field">
        <label>{t("doc.signerName")}</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="doc-name" />
      </div>
      <div className="field">
        <label>{t("doc.pad")}</label>
        <SignaturePad onChange={setInk} />
      </div>
      <label className="doc-agree">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="doc-agree" />
        <span>{t("doc.agree")}</span>
      </label>
      {error && <div className="doc-error" data-testid="doc-error">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={submit} data-testid="doc-submit">{t("doc.submit")}</button>
        <button className="btn btn-ghost" onClick={onClose}>{t("doc.cancel")}</button>
      </div>
    </Modal>
  );
}

// 인쇄 미리보기: 브라우저 인쇄 기능으로 종이 출력 또는 "PDF로 저장"을 한다.
function PrintOverlay({ signatures, onClose }) {
  const { t } = useLanguage();
  useEffect(() => {
    document.body.classList.add("doc-print-mode");
    return () => document.body.classList.remove("doc-print-mode");
  }, []);
  return createPortal(
    <div className="pour-print-overlay" data-testid="doc-print-overlay">
      <div className="pour-print-toolbar">
        <strong>{t("doc.printTitle")}</strong>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => window.print()} data-testid="doc-print-now">{t("doc.print")}</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose} data-testid="doc-print-close">{t("doc.close")}</button>
      </div>
      <FormSheet signatures={signatures} />
    </div>,
    document.body
  );
}

export default function Documents({ signatures, signerName, signerAccount, onSign, onClear, notify }) {
  const { t } = useLanguage();
  const [signing, setSigning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const signed = DOC_SLOTS.filter((s) => signatures[s]);

  return (
    <div>
      <div className="doc-toolbar">
        <div className="doc-title">{t("doc.formTitle")}</div>
        <div className="doc-btns">
          {signed.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={onClear} data-testid="doc-clear">{t("doc.clearSigs")}</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setPrinting(true)} data-testid="doc-print-open">{t("doc.print")}</button>
          <button className="btn btn-primary" onClick={() => setSigning(true)} data-testid="doc-sign-open">
            <Icon.Inspection width="15" height="15" /> {t("doc.signButton")}
          </button>
        </div>
      </div>
      <div className="pour-hint" data-testid="doc-note">{t("doc.demoNote")}</div>

      <div className="doc-sheet-wrap">
        <FormSheet signatures={signatures} inline />
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-head"><div className="section-title">{t("doc.records")}</div></div>
        {signed.length === 0 ? (
          <div className="doc-empty" data-testid="doc-no-sigs">{t("doc.noSigs")}</div>
        ) : (
          signed.map((s) => (
            <div className="doc-record" key={s} data-testid={`doc-record-${s}`}>
              <span className="doc-record-slot">{t(`doc.slot.${s}`)}</span>
              <img className="doc-record-img" src={signatures[s].image} alt="" />
              <span className="doc-record-name">{signatures[s].name}</span>
              <span className="doc-record-meta">{fmtTime(signatures[s].at)}{signatures[s].account ? ` · ${signatures[s].account}` : ""}</span>
            </div>
          ))
        )}
      </div>

      {signing && (
        <SignDialog
          signatures={signatures}
          defaultName={signerName}
          onClose={() => setSigning(false)}
          onSubmit={(slot, sig) => {
            onSign(slot, { ...sig, account: signerAccount });
            setSigning(false);
            notify(t("doc.done"));
          }}
        />
      )}
      {printing && <PrintOverlay signatures={signatures} onClose={() => setPrinting(false)} />}
    </div>
  );
}
