import React, { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import { Icon, EmptyState } from "./UI.jsx";

export default function SiteLayout({ buildings, onUpdateBuilding, notify }) {
  const [armedId, setArmedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const positioned = buildings.filter((b) => typeof b.siteX === "number" && typeof b.siteY === "number");
  const armedBuilding = buildings.find((b) => b.id === armedId) || null;

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
        <SiteMap2D buildings={positioned} armed={!!armedBuilding} onPlace={handlePlace} />

        <div style={{ marginTop: 18 }}>
          {buildings.map((b) => {
            const hasPos = typeof b.siteX === "number" && typeof b.siteY === "number";
            return (
              <div
                key={b.id}
                className="list-row"
                style={{ cursor: "default", background: armedId === b.id ? "var(--pass-bg)" : undefined }}
              >
                <Icon.Building width="17" height="17" style={{ color: "var(--blueprint)", flexShrink: 0 }} />
                <div className="grow">
                  <div className="title">{b.name}</div>
                  <div className="meta">
                    {b.floors}층 · 층당 {b.unitsPerFloor}세대{hasPos ? " · 배치 완료" : " · 위치 미지정"}
                  </div>
                </div>
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
          건물 높이는 층수, 밑면 크기는 층당 세대수를 기준으로 한 개략적인 매싱(massing) 모델입니다. 실제 치수와는 차이가 있을 수 있습니다.
        </div>
      </div>
    </div>
  );
}

function SiteMap2D({ buildings, armed, onPlace }) {
  function handleClick(e) {
    if (!armed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onPlace(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }

  return (
    <div className={`drawing-frame${armed ? " editable" : ""}`} style={{ aspectRatio: "4 / 3" }} onClick={handleClick}>
      <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
        <rect x="0" y="0" width="400" height="300" fill="#f4f7f5" />
        <rect x="10" y="10" width="380" height="280" fill="none" stroke="#9db3c4" strokeWidth="2" strokeDasharray="6 4" />
      </svg>
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
    buildings.forEach((b) => {
      const footprint = 3 + Math.min(b.unitsPerFloor || 4, 12) * 0.8;
      const bHeight = Math.max(1.2, (b.floors || 1) * 0.42);
      const geo = new THREE.BoxGeometry(footprint, bHeight, footprint);
      const mat = new THREE.MeshStandardMaterial({ color: 0x3e7cb1, roughness: 0.75, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      const wx = (b.siteX / 100) * 40 - 20;
      const wz = (b.siteY / 100) * 40 - 20;
      mesh.position.set(wx, bHeight / 2, wz);
      group.add(mesh);

      const edgesGeo = new THREE.EdgesGeometry(geo);
      const edgesMat = new THREE.LineBasicMaterial({ color: 0x17456f });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      edges.position.copy(mesh.position);
      group.add(edges);

      disposables.push(geo, mat, edgesGeo, edgesMat);
    });
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
