import React from "react";
import PlatformHeader from "./PlatformHeader.jsx";
import { PlatformFooter } from "./PlatformShell.jsx";

/**
 * 로그인 화면과 QR로 들어온 화면처럼 "로그인 정보 없이" 보여 주는 화면의 틀:
 * 현장통 상단바(로고·제목만) + 가운데 정렬된 내용 + 바닥글.
 * narrow를 켜면 모바일 모드처럼 좁은 한 줄 화면이 된다(QR로 들어온 하도급사 화면).
 */
export default function BrandFrame({ children, narrow = false, center = false, footer = true, right = null, testId = "brand-frame", rootClass = "" }) {
  return (
    <div className={`flex-1 flex flex-col${rootClass ? ` ${rootClass}` : ""}`} data-testid={testId}>
      <PlatformHeader variant="brand" right={right} />
      <main className={`flex-1 w-full mx-auto p-4 ${narrow ? "max-w-lg" : "max-w-7xl"} ${center ? "flex items-center justify-center" : ""}`}>
        {center ? <div className="w-full flex justify-center">{children}</div> : children}
      </main>
      {footer && <PlatformFooter />}
    </div>
  );
}
