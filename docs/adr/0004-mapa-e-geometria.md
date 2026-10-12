# ADR 0004: Mapa e geometria

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto

O PRD pede MapLibre (sem lock-in de Mapbox), desenho e importação do polígono do lote (GeoJSON/KML) e identificação da zona por interseção.

## Decisão

- **MapLibre GL JS 6** no cliente, carregado sob demanda (`import()` dentro do componente).
- **Tiles:** MapTiler quando `NEXT_PUBLIC_MAPTILER_KEY` existe; sem chave, tiles públicos do OpenStreetMap, **só em desenvolvimento** (a política de uso do OSM não permite tráfego de produção). `// TODO`: chave MapTiler em nome da Lugh.
- **Worker do MapLibre:** o MapLibre resolve o worker relativo ao próprio módulo, e esse caminho não existe no bundle do Next. O `postinstall` copia `maplibre-gl-worker.mjs` para `public/vendor/` (não versionado) e o mapa chama `setWorkerUrl`.
- **Desenho:** `terra-draw` + adaptador MapLibre (modos polígono, edição de vértices e estático). O `mapbox-gl-draw` foi descartado por ser acoplado ao Mapbox.
- **Importação:** GeoJSON (Polygon, MultiPolygon, Feature, FeatureCollection, GeometryCollection) e KML (`@tmcw/togeojson`), normalizados para `MultiPolygon` com anéis fechados e no máximo 5.000 vértices (`src/lib/geo/geojson.ts`).
- **Armazenamento:** PostGIS, `geometry(MultiPolygon, 4326)` com índices GIST. Colunas geradas: `geojson` (leitura pela API sem conversão), `centroid` (`ST_PointOnSurface`) e área no elipsoide (`ST_Area(geography)`), com opção de área informada.
- **Escrita:** sempre por `ST_GeomFromGeoJSON` dentro das funções `admin_save_*`. O cast direto de texto GeoJSON para `geometry` gera SRID 0 e seria rejeitado pela coluna.
- **Zona do lote:** trigger no banco escolhe a zona de **maior área de interseção** (`ST_Relate '2********'`, ignorando contato só de borda) e grava quantas zonas o lote cruza (`zones_overlap_count`), que vira flag de risco. Atribuição manual é possível e também vira flag.
- **Prévia na tela:** área calculada no cliente por projeção local no elipsoide WGS84 (erro < 0,1% frente ao PostGIS em lotes urbanos) e consulta às funções `identify_zones`/`environmental_hits` enquanto o admin desenha.

## Consequências

- A regra de zona fica no banco: vale igual para o admin, para importações futuras e para o copiloto.
- Trocar de provedor de tiles é uma mudança só em `map-style.ts`.
