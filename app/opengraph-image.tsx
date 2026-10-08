import { ImageResponse } from "next/og";

export const alt = "Scientific Research Map — Professor Konstantinos C. Makris";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#173f38",
          color: "#f4f1e9",
          padding: "90px",
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 5,
            color: "#c5d6c6",
            marginBottom: 35,
          }}
        >
          CYPRUS UNIVERSITY OF TECHNOLOGY
        </div>
        <div style={{ fontSize: 76, lineHeight: 1.1 }}>
          Scientific Research Map
        </div>
        <div style={{ fontSize: 32, marginTop: 35 }}>
          Professor Konstantinos C. Makris
        </div>
        <div style={{ fontSize: 23, color: "#c5d6c6", marginTop: 45 }}>
          Explore the places, topics and timeline of research.
        </div>
      </div>
    ),
    size,
  );
}
