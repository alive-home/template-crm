import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl"
import { useEffect, useRef } from "react"
import { hsl, LABEL_FONT, mapTokens, useMapContext, useMapLayers } from "#/features/map/index.ts"
import { EMPTY_FEED, type MapCompanyProperties, type MapFeed, readMapProperties } from "#/lib/map-types.ts"
import { bandColorExpression, CLUSTER_RADIUS, cityAware, clusterColorExpression, radiusExpression } from "./style.ts"

const SOURCE = "accounts"
const CLUSTERS = "accounts-clusters"
const CLUSTER_COUNT = "accounts-cluster-count"
const POINTS = "accounts-points"
const LABELS = "accounts-labels"
const SELECTED = "accounts-selected"

/**
 * The accounts on the map: clustered dots, their labels, and the selection ring.
 *
 * Renders nothing. Like every layer component it exists to run one effect against the map instance,
 * which is what lets a map layer be mounted, unmounted and given its own data in JSX.
 *
 * **Clustering is not decoration here.** CRM records pile up in cities in a way that geographic data
 * does not: whole handfuls of these companies share one city, so without clusters
 * the Randstad is one indistinct blob at every zoom below street level. Clusters also carry the
 * strongest band inside them (`minBand`), so a cluster is coloured by the best lead it contains and
 * the map still answers "where are the P0s" when it is zoomed out to all of Europe.
 */
export function AccountsLayer({
  data,
  selectedId,
  onSelect,
}: {
  data: MapFeed | undefined
  selectedId: string | null
  onSelect: (properties: MapCompanyProperties | null) => void
}) {
  const { map, styleEpoch } = useMapContext()

  /*
   * The click handler is registered once per style epoch, inside the setup below, so it closes over
   * whatever `onSelect` was at that moment. A ref keeps it pointing at the current one — otherwise
   * selecting an account would call a stale callback from the render that happened to build the
   * layers.
   */
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const dataRef = useRef(data)
  dataRef.current = data

  useMapLayers(instance => {
    const tokens = mapTokens()

    instance.addSource(SOURCE, {
      type: "geojson",
      data: dataRef.current ?? EMPTY_FEED,
      cluster: true,
      clusterRadius: 46,
      /*
       * Clusters stop well before the maximum zoom so that a city, once you are inside it, is
       * individual companies rather than one number you cannot click through.
       */
      clusterMaxZoom: 11,
      // The strongest band inside a cluster, so the cluster can be coloured by its best lead.
      clusterProperties: { minBand: ["min", ["get", "band"]] },
    })

    instance.addLayer({
      id: CLUSTERS,
      type: "circle",
      source: SOURCE,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": clusterColorExpression(tokens),
        "circle-opacity": 0.9,
        "circle-radius": CLUSTER_RADIUS,
        "circle-stroke-width": 2,
        "circle-stroke-color": hsl(tokens.card, { alpha: 0.95 }),
      },
    })

    instance.addLayer({
      id: CLUSTER_COUNT,
      type: "symbol",
      source: SOURCE,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": LABEL_FONT,
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": hsl(tokens.background, { lighten: 4 }) },
    })

    /*
     * One layer for the dots, with the two registers told apart by fill rather than by colour.
     *
     * A solid dot means the coordinates came off the record. A ring means we only know the city and
     * the point is that city's centre, nudged so it does not sit on top of its neighbours. Most pins
     * are rings, so this distinction is most of the map: without it, a spiral of dots around Utrecht
     * reads as 13 verified addresses.
     */
    instance.addLayer({
      id: POINTS,
      type: "circle",
      source: SOURCE,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": bandColorExpression(tokens),
        "circle-opacity": cityAware(0.22, 0.95),
        "circle-radius": radiusExpression(),
        "circle-stroke-width": cityAware(1.6, 1.2),
        "circle-stroke-color": [
          "case",
          ["==", ["get", "source"], "city"],
          bandColorExpression(tokens),
          hsl(tokens.card, { alpha: 0.95 }),
        ],
      },
    })

    // The selection ring sits above the dots and is filtered to one record at a time.
    instance.addLayer({
      id: SELECTED,
      type: "circle",
      source: SOURCE,
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-color": "transparent",
        "circle-radius": radiusExpression(5),
        "circle-stroke-width": 2,
        "circle-stroke-color": hsl(tokens.foreground),
      },
    })

    /*
     * Names arrive late and are allowed to lose.
     *
     * `text-optional` means a dot keeps its mark when there is no room for its label, which is the
     * right trade at city zoom: a label sitting on top of another label is worse than no label.
     */
    instance.addLayer({
      id: LABELS,
      type: "symbol",
      source: SOURCE,
      filter: ["!", ["has", "point_count"]],
      minzoom: 9,
      layout: {
        "text-field": ["get", "name"],
        "text-font": LABEL_FONT,
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-optional": true,
        "text-padding": 6,
        "text-max-width": 9,
      },
      paint: {
        "text-color": hsl(tokens.foreground, { lighten: 12 }),
        "text-halo-color": hsl(tokens.background, { alpha: 0.9 }),
        "text-halo-width": 1.4,
      },
    })

    const clickCluster = (event: MapMouseEvent) => {
      const feature = instance.queryRenderedFeatures(event.point, { layers: [CLUSTERS] })[0]
      if (!feature) return
      const clusterId = feature.properties?.cluster_id
      if (typeof clusterId !== "number") return
      const geometry = feature.geometry
      if (geometry.type !== "Point") return
      const [lng, lat] = geometry.coordinates
      if (lng === undefined || lat === undefined) return

      const source = instance.getSource<GeoJSONSource>(SOURCE)
      source?.getClusterExpansionZoom(clusterId).then(zoom => instance.easeTo({ center: [lng, lat], zoom }))
    }

    const clickPoint = (event: MapMouseEvent) => {
      const hit = instance.queryRenderedFeatures(event.point, { layers: [POINTS] })[0]
      const properties = readMapProperties(hit?.properties)
      if (properties) onSelectRef.current(properties)
    }

    // A click on the basemap itself closes the card. Without it the only way out is the X.
    const clickBackground = (event: MapMouseEvent) => {
      const hits = instance.queryRenderedFeatures(event.point, { layers: [POINTS, CLUSTERS] })
      if (hits.length === 0) onSelectRef.current(null)
    }

    const enter = () => {
      instance.getCanvas().style.cursor = "pointer"
    }
    const leave = () => {
      instance.getCanvas().style.cursor = ""
    }

    instance.on("click", CLUSTERS, clickCluster)
    instance.on("click", POINTS, clickPoint)
    instance.on("click", clickBackground)
    instance.on("mouseenter", CLUSTERS, enter)
    instance.on("mouseleave", CLUSTERS, leave)
    instance.on("mouseenter", POINTS, enter)
    instance.on("mouseleave", POINTS, leave)

    return () => {
      /*
       * Handlers are removed with the layers they point at. After a basemap switch the old ones would
       * reference layers that no longer exist — and `removeLayer` on a layer that is already gone
       * throws, which is why every removal is guarded.
       */
      instance.off("click", CLUSTERS, clickCluster)
      instance.off("click", POINTS, clickPoint)
      instance.off("click", clickBackground)
      instance.off("mouseenter", CLUSTERS, enter)
      instance.off("mouseleave", CLUSTERS, leave)
      instance.off("mouseenter", POINTS, enter)
      instance.off("mouseleave", POINTS, leave)

      for (const id of [LABELS, SELECTED, POINTS, CLUSTER_COUNT, CLUSTERS]) {
        if (instance.getLayer(id)) instance.removeLayer(id)
      }
      if (instance.getSource(SOURCE)) instance.removeSource(SOURCE)
    }
  })

  /*
   * New records update the source in place rather than rebuilding the layer. Tearing the source down
   * to change its contents flickers, loses the cluster state and drops the selection.
   */
  useEffect(() => {
    if (!map || styleEpoch === 0 || !data) return
    map.getSource<GeoJSONSource>(SOURCE)?.setData(data)
  }, [map, styleEpoch, data])

  // Selection is a filter on an existing layer, for the same reason: no source rebuild to draw a ring.
  useEffect(() => {
    if (!map || styleEpoch === 0) return
    if (!map.getLayer(SELECTED)) return
    map.setFilter(SELECTED, ["==", ["get", "id"], selectedId ?? ""])
  }, [map, styleEpoch, selectedId])

  return null
}
