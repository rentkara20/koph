"use client"

export function DownloadButton({ token }: { token: string }) {
  return (
    <div style={{ display: "flex", gap: 10, width: "100%" }}>
      <button
        onClick={() => window.open(`/sign/${token}/print`, "_blank")}
        style={{
          flex: 1,
          padding: "14px",
          background: "#512A83",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        📥 تحميل PDF
      </button>
      <button
        onClick={() => {
          const w = window.open(`/sign/${token}/print`, "_blank")
          w?.addEventListener("load", () => w.print())
        }}
        style={{
          flex: 1,
          padding: "14px",
          background: "#fff",
          color: "#512A83",
          border: "1.5px solid #512A83",
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        🖨️ طباعة
      </button>
    </div>
  )
}
