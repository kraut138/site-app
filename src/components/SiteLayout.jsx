import React, { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import { Icon, EmptyState } from "./UI.jsx";
import { SHAPE_OPTIONS } from "../data.js";
import { compressImage } from "../api.js";

export default function SiteLayout({ buildings, onUpdateBuilding, siteSettings, onUpdateSiteSettings, notify }) {
  const [armedId, setArmedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");

  const positioned = buildings.filter((b) => typeof b.siteX === "number" && typeof b.siteY === "number");
  const armedBuilding = buildings.find((b) => b.id === armedId) || null;
  const layoutImage = siteSettings && siteSettings.layoutImage;

  async function handlePlace(x, y) {
    if (!armedId) return;
    setBusyId(armedId);
    try {
      await onUpdateBuilding(armedId, { siteX: x, siteY: y });
      notify("배치 위치가 저장되었습니다.");
    } finally {
      setBusyId(null);
      setArmedId(null);
    }
  }

  async function handleClear(id) {
    setBusyId(id);
    try {
      await onUpdateBuilding(id, { siteX: null, siteY: null });
      notify("배치 위치를 초기화했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleShapeChange(id, shape) {
    setBusyId(id);
    try {
      await onUpdateBuilding(id, { shape });
      notify("동 형태가 저장되었습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImageBusy(true);
    setImageError("");
    try {
      const dataUrl = await compressImage(file, 1600, 0.78);
      await onUpdateSiteSettings({ layoutImage: dataUrl });
      notify("배치도 이미지를 업로드했습니다.");
    } catch (err) {
      setImageError(err.message);
    } finally {
      setImageBusy(false);
    }
  }

  async function handleImageClear() {
    setImageBusy(true);
    try {
      await onUpdateSiteSettings({ layoutImage: null });
      notify("배치도 이미지를 제거했습니다.");
    } finally {
      setImageBusy(false);
    }
  }

  if (buildings.length === 0) {
    return (
      <div className="card">
        <EmptyState message="먼저 동 관리 탭에서 동을 등록해주세요." />
      </div>
    );
  }

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="card card-pad">
        <div className="section-head">
          <div className="section-title">배치도 (2D)</div>
          <span className="eyebrow">{positioned.length}/{buildings.length}개동 배치됨</span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
            {imageBusy ? "처리 중…" : layoutImage ? "이미지 변경" : "배치도 이미지 업로드"}
            <input type="file" accept="image/*" hidden onChange={handleImageUpload} disabled={imageBusy} />
          </label>
          {layoutImage && (
            <button className="btn btn-ghost btn-sm" onClick={handleImageClear} disabled={imageBusy}>
              이미지 제거
            </button>
          )}
        </div>
        {imageError && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 10 }}>{imageError}</div>}

        <SiteMap2D buildings={positioned} armed={!!armedBuilding} onPlace={handlePlace} backgroundImage={layoutImage} />

        <div style={{ marginTop: 18 }}>
          {buildings.map((b) => {
            const hasPos = typeof b.siteX === "number" && typeof b.siteY === "number";
            return (
              <div
                key={b.id}
                className="list-row"
                style={{ cursor: "default", flexWrap: "wrap", background: armedId === b.id ? "var(--pass-bg)" : undefined }}
              >
                <Icon.Building width="17" height="17" style={{ color: "var(--blueprint)", flexShrink: 0 }} />
                <div className="grow">
                  <div className="title">{b.name}</div>
                  <div className="meta">
                    {b.floors}층 · 층당 {b.unitsPerFloor}세대{hasPos ? " · 배치 완료" : " · 위치 미지정"}
                  </div>
                </div>
                <select
                  className="input"
                  style={{ width: 92, padding: "6px 8px", fontSize: 12.5 }}
                  value={b.shape || "slab"}
                  disabled={busyId === b.id}
                  onChange={(e) => handleShapeChange(b.id, e.target.value)}
                >
                  {SHAPE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                {armedId === b.id ? (
                  <span className="chip" style={{ background: "var(--pass)", color: "#fff" }}>
                    지도를 클릭하세요
                  </span>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-sm" disabled={busyId === b.id} onClick={() => setArmedId(b.id)}>
                      {hasPos ? "위치 다시 지정" : "위치 지정"}
                    </button>
                    {hasPos && (
                      <button className="btn btn-ghost btn-sm" disabled={busyId === b.id} onClick={() => handleClear(b.id)}>
                        초기화
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div className="section-title">3D 배치 모델</div>
          <span className="eyebrow">드래그: 회전 · 휠: 확대</span>
        </div>
        {positioned.length === 0 ? (
          <EmptyState message="왼쪽에서 동 위치를 지정하면 3D 모델이 표시됩니다." />
        ) : (
          <Site3DView buildings={positioned} />
        )}
        <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-faint)" }}>
          건물 높이는 층수, 밑면 크기는 층당 세대수, 외곽 형태는 선택한 동 형태(판상형·타워형·ㄱ형·Y형)를 기준으로 한 개략적인 매싱(massing) 모델입니다. 실제 치수·형태와는 차이가 있을 수 있습니다.
        </div>
      </div>
    </div>
  );
}

function SiteMap2D({ buildings, armed, onPlace, backgroundImage }) {
  function handleClick(e) {
    if (!armed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onPlace(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }

  return (
    <div className={`drawing-frame${armed ? " editable" : ""}`} style={{ aspectRatio: "4 / 3" }} onClick={handleClick}>
      {backgroundImage ? (
        <img src={backgroundImage} alt="배치도" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
          <rect x="0" y="0" width="400" height="300" fill="#f4f7f5" />
          <rect x="10" y="10" width="380" height="280" fill="none" stroke="#9db3c4" strokeWidth="2" strokeDasharray="6 4" />
        </svg>
      )}
      {buildings.map((b) => (
        <div
          key={b.id}
          className="pin"
          style={{ left: `${b.siteX}%`, top: `${b.siteY}%`, marginTop: -13, animation: "none" }}
        >
          <svg viewBox="0 0 26 26" width="26" height="26">
            <circle cx="13" cy="13" r="10" fill="#17456f" stroke="#fff" strokeWidth="2" />
          </svg>
          <span
            style={{
              position: "absolute",
              top: 24,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 10.5,
              fontFamily: "var(--font-mono)",
              color: "var(--ink)",
              background: "#fff",
              padding: "1px 5px",
              borderRadius: 4,
              border: "1px solid var(--line)",
              whiteSpace: "nowrap",
            }}
          >
            {b.name}
          </span>
        </div>
      ))}
      {armed && <span className="drawing-hint">지도를 클릭해 위치를 지정하세요</span>}
    </div>
  );
}

// 동 형태별로 매싱 박스 파츠(local 중심좌표 x,z / 회전 rotY / 가로w·깊이d)를 계산한다.
// 모든 파츠는 baseSize(동 하나의 기준 크기)를 기준으로 산출한다.
function shapeParts(shape, baseSize) {
  if (shape === "tower") {
    const s = baseSize * 0.9;
    return [{ w: s, d: s, x: 0, z: 0, rotY: 0 }];
  }
  if (shape === "l") {
    const arm = baseSize * 1.3;
    const thick = baseSize * 0.5;
    return [
      { w: arm, d: thick, x: arm / 2, z: 0, rotY: 0 },
      { w: arm, d: thick, x: 0, z: arm / 2, rotY: -Math.PI / 2 },
    ];
  }
  if (shape === "y") {
    const arm = baseSize * 0.85;
    const thick = baseSize * 0.48;
    const anglesDeg = [90, 210, 330];
    return anglesDeg.map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return {
        w: arm,
        d: thick,
        x: Math.cos(rad) * (arm / 2),
        z: Math.sin(rad) * (arm / 2),
        rotY: -rad,
      };
    });
  }
  // slab (판상형, 기본값)
  return [{ w: baseSize * 1.8, d: baseSize * 0.78, x: 0, z: 0, rotY: 0 }];
}

function addBuildingMesh(group, disposables, building) {
  const baseSize = 3 + Math.min(building.unitsPerFloor || 4, 12) * 0.8;
  const bHeight = Math.max(1.2, (building.floors || 1) * 0.42);
  const parts = shapeParts(building.shape || "slab", baseSize);

  const wx = (building.siteX / 100) * 40 - 20;
  const wz = (building.siteY / 100) * 40 - 20;

  parts.forEach((p) => {
    const geo = new THREE.BoxGeometry(p.w, bHeight, p.d);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3e7cb1, roughness: 0.75, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wx + p.x, bHeight / 2, wz + p.z);
    mesh.rotation.y = p.rotY;
    group.add(mesh);

    const edgesGeo = new THREE.EdgesGeometry(geo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x17456f });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.position.copy(mesh.position);
    edges.rotation.y = p.rotY;
    group.add(edges);

    disposables.push(geo, mat, edgesGeo, edgesMat);
  });
}

function Site3DView({ buildings }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 400;
    const height = mount.clientHeight || 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef1ef);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(18, 26, 12);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(44, 22, 0x9db3c4, 0xd7ddda);
    scene.add(grid);
    const groundGeo = new THREE.PlaneGeometry(44, 44);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xf4f7f5, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);

    const group = new THREE.Group();
    const disposables = [groundGeo, groundMat];
    buildings.forEach((b) => addBuildingMesh(group, disposables, b));
    scene.add(group);

    let radius = 34;
    let azimuth = Math.PI / 4;
    let elevation = 0.68;

    function updateCamera() {
      const cx = radius * Math.cos(elevation) * Math.sin(azimuth);
      const cy = radius * Math.sin(elevation);
      const cz = radius * Math.cos(elevation) * Math.cos(azimuth);
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 2, 0);
    }
    updateCamera();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function onPointerDown(e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.style.cursor = "grabbing";
    }
    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      azimuth -= dx * 0.006;
      elevation = Math.min(1.45, Math.max(0.12, elevation + dy * 0.006));
      updateCamera();
    }
    function onPointerUp() {
      dragging = false;
      renderer.domElement.style.cursor = "grab";
    }
    function onWheel(e) {
      e.preventDefault();
      radius = Math.min(70, Math.max(14, radius + e.deltaY * 0.03));
      updateCamera();
    }

    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    let rafId;
    function animate() {
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      const w = mount.clientWidth || 400;
      const h = mount.clientHeight || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      disposables.forEach((d) => d.dispose());
    };
  }, [buildings]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: 360, borderRadius: "var(--radius-m)", overflow: "hidden", border: "1px solid var(--line)" }}
    />
  );
}
