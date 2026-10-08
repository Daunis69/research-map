"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import { Expand, Minus, Plus } from "lucide-react";
import type { Publication } from "@/types/publication";
import { hasCoordinates } from "@/components/explorer-utils";

interface MapProps {
  publications: Publication[];
  onSelectLocation: (name: string) => void;
  resetKey: number;
}
interface Point {
  name: string;
  latitude: number;
  longitude: number;
  ids: Set<string>;
}
const INITIAL_CENTER: L.LatLngTuple = [28, 21];

function Markers({
  publications,
  onSelectLocation,
}: Pick<MapProps, "publications" | "onSelectLocation">) {
  const map = useMap();
  const callback = useRef(onSelectLocation);
  useEffect(() => {
    callback.current = onSelectLocation;
  }, [onSelectLocation]);
  const points = useMemo(() => {
    const grouped = new Map<string, Point>();
    publications.forEach((publication) =>
      publication.studyLocations.filter(hasCoordinates).forEach((location) => {
        const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
        const point = grouped.get(key) ?? {
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          ids: new Set<string>(),
        };
        point.ids.add(publication.id);
        grouped.set(key, point);
      }),
    );
    return [...grouped.values()];
  }, [publications]);

  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      iconCreateFunction: (cluster) => {
        const ids = new Set<string>();
        cluster
          .getAllChildMarkers()
          .forEach((marker) =>
            (
              marker.options as L.MarkerOptions & { publicationIds?: string[] }
            ).publicationIds?.forEach((id) => ids.add(id)),
          );
        return L.divIcon({
          className: "research-cluster",
          html: `<span aria-label="${ids.size} publications. Zoom to explore.">${ids.size}</span>`,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        });
      },
    });
    points.forEach((point) => {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({
          className: "research-marker",
          html: `<span>${point.ids.size}</span>`,
          iconSize: [39, 39],
          iconAnchor: [19.5, 19.5],
        }),
        title: `${point.name}: ${point.ids.size} publications`,
        alt: `${point.name}: ${point.ids.size} publications. Press Enter to view.`,
        keyboard: true,
        publicationIds: [...point.ids],
      } as L.MarkerOptions & { publicationIds: string[] });
      const popup = document.createElement("div");
      popup.className = "location-popup";
      const label = document.createElement("strong");
      label.textContent = point.name;
      const count = document.createElement("p");
      count.textContent = `${point.ids.size} ${point.ids.size === 1 ? "publication" : "publications"} at this study location`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Explore publications →";
      button.addEventListener("click", () => callback.current(point.name));
      popup.append(label, count, button);
      marker.bindPopup(popup);
      group.addLayer(marker);
    });
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      group.clearLayers();
    };
  }, [map, points]);
  return null;
}

function Controls({ resetKey }: { resetKey: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(INITIAL_CENTER, 2);
  }, [map, resetKey]);
  return (
    <div
      className="map-controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button aria-label="Zoom in" title="Zoom in" onClick={() => map.zoomIn()}>
        <Plus size={18} />
      </button>
      <button
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => map.zoomOut()}
      >
        <Minus size={18} />
      </button>
      <span />
      <button
        aria-label="Reset map view"
        title="Reset map view"
        onClick={() => map.setView(INITIAL_CENTER, 2)}
      >
        <Expand size={17} />
      </button>
    </div>
  );
}

export default function ResearchMap({
  publications,
  onSelectLocation,
  resetKey,
}: MapProps) {
  return (
    <MapContainer
      center={INITIAL_CENTER}
      zoom={2}
      minZoom={2}
      maxZoom={17}
      zoomControl={false}
      scrollWheelZoom={false}
      className="research-leaflet-map"
      aria-label="Interactive study locations map. Publication list is available alongside the map."
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Markers
        publications={publications}
        onSelectLocation={onSelectLocation}
      />
      <Controls resetKey={resetKey} />
    </MapContainer>
  );
}
